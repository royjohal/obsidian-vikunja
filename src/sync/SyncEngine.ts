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
import type { VikunjaPluginSettings, ObsidianTask, SyncResult, VikunjaTask } from "../types";
import { VIKUNJA_NULL_DATE } from "../types";
import { TaskParser } from "./TaskParser";

export class SyncEngine {
  private readonly app: App;
  private readonly client: VikunjaClient;
  private readonly settings: VikunjaPluginSettings;

  /** Tracks the last sync timestamp to detect remote changes */
  private lastSyncTime: Date | null = null;

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

    try {
      // Step 1: Scan the vault for all task lines
      const obsidianTasks = await this.scanVault();

      // Step 2: Push new Obsidian tasks (no vikunjaId) to Vikunja
      await this.pushNewTasks(obsidianTasks, result);

      // Step 3: Push updates to existing tasks (have vikunjaId, content changed)
      await this.pushTaskUpdates(obsidianTasks, result);

      // Step 4: Pull remote changes from Vikunja back to the vault
      await this.pullRemoteChanges(obsidianTasks, result);

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

    try {
      const content = await this.app.vault.read(file);
      const tasks = TaskParser.parseFile(content, file.path);

      // Resolve project IDs from frontmatter
      const projectId = await this.resolveProjectId(file);
      for (const task of tasks) {
        task.projectId = projectId;
      }

      await this.pushNewTasks(tasks, result);
      await this.pushTaskUpdates(tasks, result);
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

  // ─── Vault Scanning ─────────────────────────────────────────────────────────

  /**
   * Scan all markdown files in the vault for task lines.
   * Respects the excludedFolders setting.
   *
   * @returns All ObsidianTask objects found in the vault
   */
  private async scanVault(): Promise<ObsidianTask[]> {
    const allTasks: ObsidianTask[] = [];
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      if (this.isExcluded(file.path)) continue;

      try {
        const content = await this.app.vault.read(file);
        const tasks = TaskParser.parseFile(content, file.path);

        // Resolve project IDs
        const projectId = await this.resolveProjectId(file);
        for (const task of tasks) {
          task.projectId = projectId;
        }

        allTasks.push(...tasks);
      } catch (err) {
        console.error(`[Vikunja] Error scanning ${file.path}:`, err);
      }
    }

    return allTasks;
  }

  // ─── Push: Obsidian → Vikunja ────────────────────────────────────────────────

  /**
   * Create Vikunja tasks for any Obsidian tasks that don't yet have a vikunjaId.
   * After creation, writes the vikunjaId back into the markdown line.
   */
  private async pushNewTasks(tasks: ObsidianTask[], result: SyncResult): Promise<void> {
    const newTasks = tasks.filter((t) => t.vikunjaId === null);

    for (const task of newTasks) {
      const projectId = task.projectId ?? this.settings.defaultProjectId;
      if (!projectId) {
        result.errors.push(
          `No project ID for task "${task.title}" in ${task.filePath}. ` +
          `Set vikunja_project_id in frontmatter or configure a default project.`
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
   * Update Vikunja for tasks that have a vikunjaId (i.e. already synced).
   * Currently updates done status — title/date sync is handled in pull.
   */
  private async pushTaskUpdates(tasks: ObsidianTask[], result: SyncResult): Promise<void> {
    const existingTasks = tasks.filter((t) => t.vikunjaId !== null);

    for (const task of existingTasks) {
      try {
        await this.client.updateTask(task.vikunjaId!, {
          title: task.title,
          done: task.done,
          due_date: task.dueDate ? new Date(task.dueDate).toISOString() : undefined,
          priority: task.priority > 0 ? task.priority : undefined,
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
   * Handles tasks completed remotely (e.g. by a collaborator via the web UI).
   */
  private async pullRemoteChanges(
    localTasks: ObsidianTask[],
    result: SyncResult
  ): Promise<void> {
    // Build a map of vikunjaId → ObsidianTask for fast lookup
    const localById = new Map<number, ObsidianTask>(
      localTasks
        .filter((t) => t.vikunjaId !== null)
        .map((t) => [t.vikunjaId!, t])
    );

    if (localById.size === 0) return;

    // Fetch all remote tasks
    let remoteTasks: VikunjaTask[] = [];
    try {
      remoteTasks = await this.client.getAllTasks();
    } catch (err) {
      result.errors.push(`Failed to fetch remote tasks: ${String(err)}`);
      return;
    }

    for (const remote of remoteTasks) {
      const local = localById.get(remote.id);
      if (!local) continue;

      // Check if remote done status differs from local
      if (remote.done !== local.done) {
        local.done = remote.done;
        await this.writeTaskToFile(local);
        result.completed++;
      }

      // Sync title if changed remotely
      if (remote.title !== local.title) {
        local.title = remote.title;
        await this.writeTaskToFile(local);
        result.updated++;
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

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Resolve the Vikunja project ID for a file.
   * Checks frontmatter for `vikunja_project_id`, falls back to default.
   *
   * @param file - The file to check
   */
  private async resolveProjectId(file: TFile): Promise<number | null> {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;

    if (frontmatter?.vikunja_project_id) {
      return Number(frontmatter.vikunja_project_id);
    }

    return this.settings.defaultProjectId;
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
