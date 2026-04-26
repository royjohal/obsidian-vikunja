/**
 * @file sync/SyncEngine.ts
 * @description Orchestrates bidirectional sync between Obsidian vault tasks
 * and Vikunja.
 *
 * Sync strategy:
 *   - Obsidian → Vikunja: tasks without a vikunjaId are created; tasks with
 *     a vikunjaId are updated if their content has changed.
 *   - Vikunja → Obsidian: tasks updated remotely (done status, title, dates)
 *     are written back to the vault.
 *
 * Conflict resolution:
 *   - Last-write-wins based on the `updated` timestamp from Vikunja.
 *   - If Obsidian has changes and Vikunja has changes since last sync,
 *     Vikunja wins (it is the source of truth for collaboration).
 *
 * Task identity:
 *   - Each synced task carries a `<!--vikunja:ID-->` HTML comment in the
 *     markdown line. This is the persistent link between the two systems.
 */

import type { App, TFile } from "obsidian";
import type { VikunjaClient } from "../api/VikunjaClient";
import type {
  VikunjaPluginSettings,
  ObsidianTask,
  SyncResult,
  VikunjaTask,
  VikunjaProject,
} from "../types";
import { VIKUNJA_NULL_DATE } from "../types";
import { TaskParser } from "./TaskParser";

export class SyncEngine {
  private readonly app: App;
  private readonly client: VikunjaClient;
  private readonly settings: VikunjaPluginSettings;

  /** Tracks the last sync timestamp to detect remote changes */
  private lastSyncTime: Date | null = null;

  /**
   * Project list cache — populated once per sync run to avoid repeated API calls
   * when resolving project names from frontmatter across many files.
   */
  private cachedProjects: VikunjaProject[] | null = null;

  constructor(app: App, client: VikunjaClient, settings: VikunjaPluginSettings) {
    this.app = app;
    this.client = client;
    this.settings = settings;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Run a full bidirectional sync.
   * This is the main entry point called by the plugin on save, on schedule,
   * or manually by the user.
   *
   * @returns SyncResult with counts of changes made
   */
  async sync(): Promise<SyncResult> {
    const result: SyncResult = {
      created: 0,
      updated: 0,
      completed: 0,
      errors: [],
      timestamp: new Date(),
    };

    // Reset project cache so we get a fresh list for this run
    this.cachedProjects = null;

    try {
      // Step 1: Ensure every Vikunja project has a markdown file in the vault.
      // Returns a map of newly-created file paths → project IDs so we can
      // import tasks into them immediately, before Obsidian's metadata cache
      // has had a chance to index their frontmatter.
      const newProjectFiles = await this.ensureProjectFiles();

      // Step 2: Scan the vault for all task lines + collect file→project bindings
      const { tasks: obsidianTasks, fileProjectMap } = await this.scanVault();

      // Merge newly-created project files into the map — metadata cache won't
      // have their frontmatter yet so scanVault can't detect them on its own.
      for (const [path, id] of newProjectFiles) {
        if (!fileProjectMap.has(path)) fileProjectMap.set(path, id);
      }

      // Step 3: Pull remote changes from Vikunja first.
      // This ensures Vikunja's state is reflected in Obsidian before we push.
      // Critical for conflict resolution: if a task was marked done in Vikunja
      // but is still pending in Obsidian, we pull the done state first so it's
      // reflected in both systems. If we pushed before pulling, we'd revert
      // Vikunja's change back to pending, losing the user's work in Vikunja.
      // See: https://github.com/royjohal/obsidian-vikunja/issues/X
      await this.pullRemoteChanges(obsidianTasks, fileProjectMap, result);

      // Step 4: Push new Obsidian tasks (no vikunjaId) to Vikunja
      await this.pushNewTasks(obsidianTasks, result);

      // Step 5: Push updates to existing tasks (have vikunjaId, content changed)
      // At this point, Obsidian reflects Vikunja's current state, so we only
      // push genuine local changes, not reverts of remote changes.
      await this.pushTaskUpdates(obsidianTasks, result);

      // Step 6: Delete orphaned tasks — DISABLED FOR NOW
      // The current implementation is too aggressive and deletes tasks that exist
      // in other files (e.g., daily notes with default project binding).
      // This needs a more sophisticated approach that tracks previous state.
      // TODO: Re-enable with proper state tracking in v0.2
      // await this.deleteOrphanedTasks(obsidianTasks, result);

    } catch (err) {
      result.errors.push(String(err));
    }

    this.lastSyncTime = new Date();
    return result;
  }

  /**
   * Sync a single file. Called on file-save events for efficiency —
   * avoids re-scanning the entire vault when only one file changed.
   *
   * Also pulls remote-only tasks from Vikunja into the file when the note
   * has an explicit project binding (`vikunja_project_id` or `vikunja_project`
   * frontmatter). This is what populates a newly-created project note with
   * tasks that already exist in Vikunja.
   *
   * @param file - The Obsidian TFile that was saved
   */
  async syncFile(file: TFile): Promise<SyncResult> {
    const result: SyncResult = {
      created: 0,
      updated: 0,
      completed: 0,
      errors: [],
      timestamp: new Date(),
    };

    if (this.isExcluded(file.path)) return result;

    // Reset project cache for this run
    this.cachedProjects = null;

    try {
      const content = await this.app.vault.read(file);
      const tasks = TaskParser.parseFile(content, file.path);

      // Resolve project IDs from frontmatter (explicit) or default
      const explicitId = await this.getExplicitProjectId(file);
      const effectiveId = explicitId ?? this.settings.defaultProjectId;
      for (const task of tasks) {
        task.projectId = effectiveId;
      }

      await this.pushNewTasks(tasks, result);
      await this.pushTaskUpdates(tasks, result);

      // Pull remote tasks for this file's explicitly-bound project.
      // This imports tasks that exist in Vikunja but haven't been synced
      // to this note yet (e.g. tasks created in the Vikunja web UI).
      if (explicitId !== null) {
        const fileProjectMap = new Map([[file.path, explicitId]]);
        await this.pullRemoteChanges(tasks, fileProjectMap, result);
      }
    } catch (err) {
      result.errors.push(`Error syncing ${file.path}: ${String(err)}`);
    }

    return result;
  }

  /**
   * Handle a checkbox toggle in the editor.
   * Called when the user clicks a checkbox in reading/live-preview mode.
   *
   * @param file       - File containing the task
   * @param lineNumber - Line that was toggled
   * @param done       - New done state
   */
  async handleCheckboxToggle(
    file: TFile,
    lineNumber: number,
    done: boolean
  ): Promise<void> {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const line = lines[lineNumber];

    if (!TaskParser.isTaskLine(line)) return;

    const task = TaskParser.parseLine(line, lineNumber, file.path);
    if (!task) return;

    task.done = done;

    // If the task is already linked to Vikunja, update it there
    if (task.vikunjaId !== null) {
      await this.client.setTaskDone(task.vikunjaId, done);
    }

    // Write the updated line back to the file
    const newContent = TaskParser.replaceLine(content, lineNumber, TaskParser.serialise(task));
    await this.app.vault.modify(file, newContent);
  }

  // ─── Project File Management ─────────────────────────────────────────────────

  /**
   * Ensure every non-archived Vikunja project has a corresponding markdown
   * file in the configured projects folder.
   *
   * Each file is created with `vikunja_project_id` frontmatter pre-filled so
   * the sync engine can route tasks correctly without any manual setup.
   *
   * Files that already exist are left untouched — this only creates missing ones.
   * If a project is renamed in Vikunja the original file keeps working because
   * the frontmatter ID is the real identity, not the filename.
   *
   * @returns A map of newly-created file paths → project IDs. Used by sync()
   *          to seed the fileProjectMap before the metadata cache has indexed
   *          the new files.
   */
  private async ensureProjectFiles(): Promise<Map<string, number>> {
    const created = new Map<string, number>();

    if (!this.settings.autoCreateProjectFiles) return created;

    const folder = this.settings.projectsFolder.trim().replace(/\/+$/, "");
    if (!folder) return created;

    // Create the folder if it doesn't exist yet
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      try {
        await this.app.vault.createFolder(folder);
      } catch {
        // Folder may have been created by a concurrent operation — safe to ignore
      }
    }

    const projects = await this.getCachedProjects();

    for (const project of projects) {
      if (project.is_archived) continue;

      // Sanitise project title: replace characters forbidden in most filesystems
      const safeName = project.title.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim();
      if (!safeName) continue;

      const filePath = `${folder}/${safeName}.md`;

      if (this.app.vault.getAbstractFileByPath(filePath)) continue; // Already exists

      const content = `---\nvikunja_project_id: ${project.id}\n---\n\n`;

      try {
        await this.app.vault.create(filePath, content);
        created.set(filePath, project.id);
        console.log(`[Vikunja] Created project file: ${filePath}`);
      } catch (err) {
        console.error(`[Vikunja] Failed to create project file ${filePath}:`, err);
      }
    }

    return created;
  }

  // ─── Vault Scanning ─────────────────────────────────────────────────────────

  /**
   * Scan all markdown files in the vault for task lines.
   * Respects the excludedFolders setting.
   *
   * Also builds a map of files that have an explicit project binding in their
   * frontmatter (`vikunja_project_id` or `vikunja_project`). This map drives
   * the remote-import step in pullRemoteChanges.
   *
   * @returns tasks — all ObsidianTask objects found in the vault
   *          fileProjectMap — file path → Vikunja project ID, for files with
   *                           explicit frontmatter project bindings only
   */
  private async scanVault(): Promise<{
    tasks: ObsidianTask[];
    fileProjectMap: Map<string, number>;
  }> {
    const allTasks: ObsidianTask[] = [];
    const fileProjectMap = new Map<string, number>();
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      if (this.isExcluded(file.path)) continue;

      try {
        const content = await this.app.vault.read(file);
        const tasks = TaskParser.parseFile(content, file.path);

        // Resolve explicit frontmatter binding (vikunja_project_id or vikunja_project)
        const explicitId = await this.getExplicitProjectId(file);
        const effectiveId = explicitId ?? this.settings.defaultProjectId;

        for (const task of tasks) {
          task.projectId = effectiveId;
        }

        // Track explicit bindings so pullRemoteChanges knows which files
        // to import remote-only tasks into
        if (explicitId !== null) {
          fileProjectMap.set(file.path, explicitId);
        }

        allTasks.push(...tasks);
      } catch (err) {
        console.error(`[Vikunja] Error scanning ${file.path}:`, err);
      }
    }

    return { tasks: allTasks, fileProjectMap };
  }

  // ─── Push: Obsidian → Vikunja ────────────────────────────────────────────────

  /**
   * Create Vikunja tasks for any Obsidian tasks that don't yet have a vikunjaId.
   * After creation, writes the vikunjaId back into the markdown line.
   *
   * Project resolution order (highest priority first):
   *   1. Inline `@project:Name` token on the task line
   *   2. `vikunja_project_id` / `vikunja_project` in the note's frontmatter
   *   3. Default project configured in plugin settings
   */
  private async pushNewTasks(tasks: ObsidianTask[], result: SyncResult): Promise<void> {
    const newTasks = tasks.filter((t) => t.vikunjaId === null);

    for (const task of newTasks) {
      // Resolve project — inline @project: overrides the note-level binding
      let projectId = task.projectId ?? this.settings.defaultProjectId;
      if (task.projectName) {
        const projects = await this.getCachedProjects();
        const match = projects.find(
          (p) => p.title.toLowerCase().trim() === task.projectName!.toLowerCase().trim()
        );
        if (match) {
          projectId = match.id;
        } else {
          result.errors.push(
            `Unknown project "@project:${task.projectName}" on task "${task.title}" ` +
            `in ${task.filePath}. Check the name matches a project in Vikunja exactly.`
          );
          continue;
        }
      }

      if (!projectId) {
        result.errors.push(
          `Skipped "${task.title}" in ${task.filePath} — no project assigned. ` +
          `Add vikunja_project_id to the note's frontmatter, use @project:Name on ` +
          `the task line, or set a Default Project in plugin settings.`
        );
        continue;
      }

      try {
        const created = await this.client.createTask(projectId, {
          title: task.title,
          done: task.done,
          due_date: task.dueDate ? new Date(task.dueDate).toISOString() : undefined,
          start_date: task.startDate ? new Date(task.startDate).toISOString() : undefined,
          priority: task.priority > 0 ? task.priority : undefined,
          repeat_after: TaskParser.parseRepeatAfter(task.recurrence),
        });

        // Write vikunjaId back to the file
        task.vikunjaId = created.id;
        await this.writeTaskToFile(task);
        result.created++;
      } catch (err) {
        result.errors.push(`Failed to create task "${task.title}": ${String(err)}`);
      }
    }
  }

  /**
   * Push local changes to Vikunja for tasks that already have a vikunjaId.
   *
   * Only tasks that differ from their remote state are pushed — this avoids
   * hammering the API with no-op updates on every sync (which was causing the
   * "Syncing…" notice to hang when a vault has many synced tasks).
   *
   * Remote state is fetched once via getAllTasks and cached in a Map for O(1)
   * lookup. If the remote fetch fails we skip updates rather than push blindly.
   */
  private async pushTaskUpdates(tasks: ObsidianTask[], result: SyncResult): Promise<void> {
    const existingTasks = tasks.filter((t) => t.vikunjaId !== null);
    if (existingTasks.length === 0) return;

    // Fetch current remote state so we only push genuine changes
    let remoteById = new Map<number, VikunjaTask>();
    try {
      const allRemote = await this.client.getAllTasks();
      remoteById = new Map(allRemote.map((t) => [t.id, t]));
    } catch (err) {
      result.errors.push(`Could not fetch remote tasks for update comparison: ${String(err)}`);
      return; // Skip updates rather than push blindly
    }

    for (const task of existingTasks) {
      const remote = remoteById.get(task.vikunjaId!);

      // If the task no longer exists remotely, skip (it may have been deleted)
      if (!remote) continue;

      // SAFETY: Skip if title contains replacement characters (corruption detected)
      if (task.title.includes('�')) {
        console.warn(
          `[Vikunja] Skipping update for task ${task.vikunjaId}: title contains corruption (replacement characters). ` +
          `Title: "${task.title}". This task may need manual repair.`
        );
        result.errors.push(
          `Skipped corrupted task ${task.vikunjaId}: title contains replacement characters. ` +
          `Please check this task in both Obsidian and Vikunja.`
        );
        continue;
      }

      const localRepeatAfter = TaskParser.parseRepeatAfter(task.recurrence) ?? 0;
      const localDueDate  = task.dueDate  ? new Date(task.dueDate).toISOString()  : null;
      const localStartDate = task.startDate ? new Date(task.startDate).toISOString() : null;

      const nothingChanged =
        task.title    === remote.title &&
        task.done     === remote.done  &&
        task.priority === remote.priority &&
        localRepeatAfter === (remote.repeat_after ?? 0) &&
        (localDueDate  ?? VIKUNJA_NULL_DATE) === (remote.due_date   ?? VIKUNJA_NULL_DATE) &&
        (localStartDate ?? VIKUNJA_NULL_DATE) === (remote.start_date ?? VIKUNJA_NULL_DATE);

      if (nothingChanged) continue;

      // ─── Conflict Resolution: Timestamp-based last-write-wins ───
      // When both platforms changed the task, compare timestamps to determine the winner.
      // Use file modification time as a proxy for local change time.
      try {
        const file = this.app.vault.getAbstractFileByPath(task.filePath);
        if (file && "stat" in file && "mtime" in (file as any).stat) {
          const localMtime = new Date((file as any).stat.mtime);
          const remoteUpdated = new Date(remote.updated);

          // If remote was updated AFTER the local file was modified, remote wins
          if (remoteUpdated > localMtime) {
            console.log(
              `[Vikunja] Skipping push for task ${task.vikunjaId}: ` +
              `remote updated (${remoteUpdated.toISOString()}) is newer than ` +
              `local file modified (${localMtime.toISOString()})`
            );
            continue; // Don't push; remote state is more recent
          }
        }
      } catch {
        // If we can't get file stats, proceed with the push (safer than losing work)
      }

      try {
        await this.client.updateTask(task.vikunjaId!, {
          title:        task.title,
          done:         task.done,
          due_date:     localDueDate  ?? undefined,
          start_date:   localStartDate ?? undefined,
          priority:     task.priority > 0 ? task.priority : undefined,
          repeat_after: localRepeatAfter || undefined,
        });
        result.updated++;
      } catch (err) {
        result.errors.push(`Failed to update task "${task.title}": ${String(err)}`);
      }
    }
  }

  // ─── Pull: Vikunja → Obsidian ────────────────────────────────────────────────

  /**
   * Pull remote changes from Vikunja and write them back to the vault.
   *
   * Two things happen here:
   *
   * 1. **Update existing tasks** — tasks already tracked in Obsidian (those
   *    with a `<!--vikunja:ID-->` comment) are compared against Vikunja and
   *    updated if their title or done state changed remotely.
   *
   * 2. **Import remote-only tasks** — for files that have an explicit project
   *    binding in their frontmatter (`vikunja_project_id` / `vikunja_project`),
   *    any Vikunja tasks that have no Obsidian counterpart are appended to
   *    that file. This is what populates a freshly-created project note with
   *    tasks already in Vikunja.
   *
   * @param localTasks     - All ObsidianTask objects found in the vault
   * @param fileProjectMap - Files with explicit project bindings (path → projectId)
   * @param result         - Mutable result object to accumulate counts/errors
   */
  private async pullRemoteChanges(
    localTasks: ObsidianTask[],
    fileProjectMap: Map<string, number>,
    result: SyncResult
  ): Promise<void> {
    // Build a map of vikunjaId → ObsidianTask for fast lookup
    const localById = new Map<number, ObsidianTask>(
      localTasks
        .filter((t) => t.vikunjaId !== null)
        .map((t) => [t.vikunjaId!, t])
    );

    // Track which remote task IDs we've already processed via per-project
    // fetches so we don't double-count them in the fallback getAllTasks call.
    const handledRemoteIds = new Set<number>();

    // ── Per-project import ──────────────────────────────────────────────────
    // Group files by project so we only fetch each project once even when
    // multiple notes share the same project ID.
    const projectToFiles = new Map<number, string[]>();
    for (const [filePath, projectId] of fileProjectMap) {
      const list = projectToFiles.get(projectId) ?? [];
      list.push(filePath);
      projectToFiles.set(projectId, list);
    }

    for (const [projectId, filePaths] of projectToFiles) {
      let remoteTasks: VikunjaTask[] = [];
      try {
        remoteTasks = await this.client.getProjectTasks(projectId);
      } catch (err) {
        result.errors.push(`Failed to fetch tasks for project ${projectId}: ${String(err)}`);
        continue;
      }

      // Collect tasks to import (not yet in Obsidian) so we can batch-append
      // them in a single file write rather than one write per task.
      const toImport: VikunjaTask[] = [];

      for (const remote of remoteTasks) {
        handledRemoteIds.add(remote.id);
        const local = localById.get(remote.id);

        if (local) {
          // Task already in Obsidian — update done/title if remote changed
          let changed = false;
          if (remote.done !== local.done) {
            local.done = remote.done;
            changed = true;
            result.completed++;
          }
          if (remote.title !== local.title) {
            local.title = remote.title;
            changed = true;
            result.updated++;
          }
          if (changed) await this.writeTaskToFile(local);
        } else {
          // Task exists only in Vikunja — queue it for import
          // Skip completed tasks unless the user opted in
          if (!remote.done || this.settings.syncCompletedTasks) {
            toImport.push(remote);
          }
        }
      }

      // Append all new remote tasks to the primary file for this project
      // (the first file that declared this project binding)
      if (toImport.length > 0) {
        await this.appendTasksToFile(filePaths[0], toImport, result);
      }
    }

    // ── Fallback: update tracked tasks not covered by any bound project ─────
    // These are tasks that have a vikunjaId in Obsidian but whose project is
    // not explicitly bound in frontmatter (e.g. they use the default project).
    const unhandledLocal = localTasks.filter(
      (t) => t.vikunjaId !== null && !handledRemoteIds.has(t.vikunjaId!)
    );

    if (unhandledLocal.length === 0) return;

    let allRemote: VikunjaTask[] = [];
    try {
      allRemote = await this.client.getAllTasks();
    } catch (err) {
      result.errors.push(`Failed to fetch remote tasks: ${String(err)}`);
      return;
    }

    for (const remote of allRemote) {
      if (handledRemoteIds.has(remote.id)) continue;
      const local = localById.get(remote.id);
      if (!local) continue;

      let changed = false;
      if (remote.done !== local.done) {
        local.done = remote.done;
        changed = true;
        result.completed++;
      }
      if (remote.title !== local.title) {
        local.title = remote.title;
        changed = true;
        result.updated++;
      }
      if (changed) await this.writeTaskToFile(local);
    }
  }

  /**
   * Delete tasks from Vikunja that were deleted from Obsidian.
   *
   * For each auto-created project file, checks if all tasks in Vikunja
   * still have tracking IDs in the file. Tasks without tracking IDs are
   * assumed to have been deleted from Obsidian, so they're deleted from Vikunja too.
   *
   * SAFETY: Only deletes if the file has been populated with at least some tasks.
   * Prevents accidental mass deletion on first sync.
   */
  private async deleteOrphanedTasks(
    obsidianTasks: ObsidianTask[],
    result: SyncResult
  ): Promise<void> {
    if (!this.settings.autoCreateProjectFiles) return;

    const folder = this.settings.projectsFolder.trim().replace(/\/+$/, "");
    if (!folder) return;

    const projects = await this.getCachedProjects();

    for (const project of projects) {
      if (project.is_archived) continue;

      // Construct the expected file path for this project
      const safeName = project.title.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim();
      if (!safeName) continue;
      const filePath = `${folder}/${safeName}.md`;

      // Get the file from Obsidian
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!file || !("extension" in file)) continue; // File doesn't exist, skip

      try {
        // Parse the file to get current tracking IDs
        const content = await this.app.vault.read(file as TFile);
        const localTasks = TaskParser.parseFile(content, filePath);
        const localIds = new Set(
          localTasks.filter((t) => t.vikunjaId !== null).map((t) => t.vikunjaId!)
        );

        // SAFETY: Only delete if the file has been populated with at least some tasks
        // This prevents accidental mass deletion on first sync before tasks are imported
        if (localTasks.length === 0) {
          console.log(
            `[Vikunja] Skipping orphan check for ${filePath} (file is empty, likely not yet populated)`
          );
          continue;
        }

        // Fetch all tasks from this project in Vikunja
        const remoteTasks = await this.client.getProjectTasks(project.id);

        // SAFETY: Never delete more than 50% of the tasks in a project
        // This prevents catastrophic data loss if something is broken
        const orphanedCount = remoteTasks.filter((t) => !localIds.has(t.id))
          .length;
        if (orphanedCount > remoteTasks.length * 0.5) {
          console.warn(
            `[Vikunja] Skipping deletion for ${project.title}: ${orphanedCount} orphaned tasks (>50%), likely a sync issue`
          );
          result.errors.push(
            `Skipped deletion for project "${project.title}": too many orphaned tasks (${orphanedCount}/${remoteTasks.length}). Please check your sync state.`
          );
          continue;
        }

        // Delete any task that's in Vikunja but not in the Obsidian file
        for (const remote of remoteTasks) {
          if (!localIds.has(remote.id)) {
            try {
              await this.client.deleteTask(remote.id);
              result.deleted = (result.deleted ?? 0) + 1;
              console.log(
                `[Vikunja] Deleted orphaned task ${remote.id} (was removed from Obsidian)`
              );
            } catch (err) {
              console.error(
                `[Vikunja] Failed to delete orphaned task ${remote.id}:`,
                err
              );
            }
          }
        }
      } catch (err) {
        console.error(
          `[Vikunja] Failed to check orphaned tasks in project ${project.id}:`,
          err
        );
      }
    }
  }

  // ─── File Writing ────────────────────────────────────────────────────────────

  /**
   * Write an updated task back to its source file.
   * Replaces only the specific line — does not touch the rest of the file.
   *
   * @param task - The task with updated fields
   */
  private async writeTaskToFile(task: ObsidianTask): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!file || !("extension" in file)) {
      throw new Error(`File not found: ${task.filePath}`);
    }

    const content = await this.app.vault.read(file as TFile);
    const newLine = TaskParser.serialise(task);
    const newContent = TaskParser.replaceLine(content, task.lineNumber, newLine);
    await this.app.vault.modify(file as TFile, newContent);
  }

  /**
   * Append a batch of Vikunja tasks to a file as new markdown task lines.
   * All tasks are written in a single vault.modify call to minimise file churn.
   *
   * Used when importing remote-only tasks (tasks that exist in Vikunja but have
   * no `<!--vikunja:ID-->` counterpart in the vault yet).
   *
   * @param filePath    - Vault-relative path of the target file
   * @param remoteTasks - Vikunja tasks to append
   * @param result      - Mutable result object; `created` is incremented per task
   */
  private async appendTasksToFile(
    filePath: string,
    remoteTasks: VikunjaTask[],
    result: SyncResult
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !("extension" in file)) return;

    const content = await this.app.vault.read(file as TFile);

    const newLines = remoteTasks.map((remote) => {
      const task: ObsidianTask = {
        rawLine: "",
        lineNumber: -1,
        filePath,
        title: remote.title,
        done: remote.done,
        dueDate: SyncEngine.formatDate(remote.due_date),
        startDate: SyncEngine.formatDate(remote.start_date),
        scheduledDate: null, // Vikunja has no scheduled-date concept
        priority: remote.priority,
        recurrence: TaskParser.formatRepeatAfter(remote.repeat_after),
        vikunjaId: remote.id,
        projectId: remote.project_id,
        projectName: null,
      };
      return TaskParser.serialise(task);
    });

    const newContent = content.trimEnd() + "\n" + newLines.join("\n") + "\n";
    await this.app.vault.modify(file as TFile, newContent);

    result.created += remoteTasks.length;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Fetch the project list, using a per-run in-memory cache so that name-based
   * frontmatter lookups (`vikunja_project: "Work Tasks"`) across many files
   * only result in a single API call per sync run.
   */
  private async getCachedProjects(): Promise<VikunjaProject[]> {
    if (!this.cachedProjects) {
      this.cachedProjects = await this.client.getProjects();
    }
    return this.cachedProjects;
  }

  /**
   * Resolve the explicit project ID declared in a file's frontmatter.
   *
   * Supports two frontmatter properties:
   * - `vikunja_project_id: 3`  — numeric ID, resolved directly
   * - `vikunja_project: "Work Tasks"` — project name, resolved via API
   *   (case-insensitive match against the authenticated user's project list)
   *
   * Returns `null` if the file has no explicit project binding. Does NOT
   * fall back to the default project — use `resolveProjectId` for that.
   *
   * @param file - The file whose frontmatter to inspect
   */
  private async getExplicitProjectId(file: TFile): Promise<number | null> {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;

    if (frontmatter?.vikunja_project_id) {
      return Number(frontmatter.vikunja_project_id);
    }

    if (frontmatter?.vikunja_project) {
      const name = String(frontmatter.vikunja_project).toLowerCase().trim();
      const projects = await this.getCachedProjects();
      const match = projects.find((p) => p.title.toLowerCase().trim() === name);
      if (match) return match.id;
      console.warn(
        `[Vikunja] No project found with name "${frontmatter.vikunja_project}" in ${file.path}`
      );
    }

    return null;
  }

  /**
   * Resolve the effective Vikunja project ID for a file.
   * Returns the explicit frontmatter binding if present, otherwise the
   * plugin-wide default project. Returns null if neither is configured.
   *
   * @param file - The file to check
   */
  private async resolveProjectId(file: TFile): Promise<number | null> {
    return (await this.getExplicitProjectId(file)) ?? this.settings.defaultProjectId;
  }

  /**
   * Check if a file path should be excluded from sync.
   * @param path - Vault-relative file path
   */
  private isExcluded(path: string): boolean {
    return this.settings.excludedFolders.some((folder) =>
      path.startsWith(folder.trim() + "/")
    );
  }

  /**
   * Format a Vikunja ISO date string to YYYY-MM-DD for Obsidian Tasks syntax.
   * Returns null for Vikunja's null date sentinel.
   */
  static formatDate(isoDate: string | null): string | null {
    if (!isoDate || isoDate === VIKUNJA_NULL_DATE) return null;
    return isoDate.split("T")[0];
  }
}
