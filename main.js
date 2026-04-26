"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VikunjaPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/api/VikunjaClient.ts
var VikunjaRequestError = class extends Error {
  constructor(status, apiError, message) {
    super(message);
    this.status = status;
    this.apiError = apiError;
    this.name = "VikunjaRequestError";
  }
};
var VikunjaClient = class {
  baseUrl;
  token;
  /**
   * @param baseUrl - Vikunja instance URL, e.g. https://vikunja.example.com
   * @param token   - Personal access token from Vikunja Account Settings
   */
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }
  // ─── Private Helpers ────────────────────────────────────────────────────────
  /** Build the full API URL for a given path */
  url(path) {
    return `${this.baseUrl}/api/v1${path}`;
  }
  /** Standard headers sent with every request */
  get headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json"
    };
  }
  /**
   * Core fetch wrapper. Handles non-2xx responses by throwing VikunjaRequestError.
   * @param path    - API path, e.g. /projects/1/tasks
   * @param options - Standard RequestInit options
   */
  async request(path, options = {}) {
    const response = await fetch(this.url(path), {
      ...options,
      headers: { ...this.headers, ...options.headers ?? {} }
    });
    if (!response.ok) {
      let apiError = null;
      try {
        apiError = await response.json();
      } catch {
      }
      throw new VikunjaRequestError(
        response.status,
        apiError,
        apiError?.message ?? `HTTP ${response.status} on ${path}`
      );
    }
    if (response.status === 204)
      return {};
    return response.json();
  }
  // ─── Connection ─────────────────────────────────────────────────────────────
  /**
   * Test connectivity and token validity.
   * Calls /info which is public, then /user which requires auth.
   * @returns true if connection and auth are valid
   */
  async testConnection() {
    try {
      await this.request("/user");
      return { success: true };
    } catch (err) {
      if (err instanceof VikunjaRequestError) {
        return { success: false, error: err.message };
      }
      return { success: false, error: String(err) };
    }
  }
  // ─── Projects ────────────────────────────────────────────────────────────────
  /**
   * Fetch all projects the authenticated user has access to.
   * @returns Array of Vikunja projects
   */
  async getProjects() {
    return this.request("/projects?per_page=500");
  }
  /**
   * Fetch a single project by ID.
   * @param projectId - Vikunja project ID
   */
  async getProject(projectId) {
    return this.request(`/projects/${projectId}`);
  }
  // ─── Tasks ───────────────────────────────────────────────────────────────────
  /**
   * Fetch all tasks in a project.
   * Handles pagination automatically — fetches all pages.
   * @param projectId - Vikunja project ID
   */
  async getProjectTasks(projectId) {
    const allTasks = [];
    let page = 1;
    while (true) {
      const tasks = await this.request(
        `/projects/${projectId}/tasks?per_page=50&page=${page}`
      );
      allTasks.push(...tasks);
      if (tasks.length < 50)
        break;
      page++;
    }
    return allTasks;
  }
  /**
   * Fetch all tasks across all projects.
   * Uses the /tasks/all endpoint for efficiency.
   * @param page - Page number (1-indexed)
   */
  async getAllTasks(page = 1) {
    const allTasks = [];
    let currentPage = page;
    while (true) {
      const tasks = await this.request(
        `/tasks/all?per_page=50&page=${currentPage}`
      );
      allTasks.push(...tasks);
      if (tasks.length < 50)
        break;
      currentPage++;
    }
    return allTasks;
  }
  /**
   * Fetch a single task by ID.
   * @param taskId - Vikunja task ID
   */
  async getTask(taskId) {
    return this.request(`/tasks/${taskId}`);
  }
  /**
   * Create a new task in a project.
   * @param projectId - The project to create the task in
   * @param payload   - Task data
   */
  async createTask(projectId, payload) {
    return this.request(`/projects/${projectId}/tasks`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  }
  /**
   * Update an existing task.
   * Uses POST as per Vikunja API convention.
   * @param taskId  - The task to update
   * @param payload - Fields to update (partial update supported)
   */
  async updateTask(taskId, payload) {
    return this.request(`/tasks/${taskId}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
  /**
   * Mark a task as done or not done.
   * Convenience wrapper around updateTask.
   * @param taskId - The task to update
   * @param done   - Whether the task is complete
   */
  async setTaskDone(taskId, done) {
    return this.updateTask(taskId, { done });
  }
  /**
   * Delete a task permanently.
   * @param taskId - The task to delete
   */
  async deleteTask(taskId) {
    await this.request(`/tasks/${taskId}`, { method: "DELETE" });
  }
  // ─── Labels ──────────────────────────────────────────────────────────────────
  /**
   * Fetch all labels the authenticated user has access to.
   */
  async getLabels() {
    return this.request("/labels?per_page=500");
  }
  /**
   * Add a label to a task.
   * @param taskId  - The task to label
   * @param labelId - The label to apply
   */
  async addLabelToTask(taskId, labelId) {
    await this.request(`/tasks/${taskId}/labels`, {
      method: "PUT",
      body: JSON.stringify({ label_id: labelId })
    });
  }
  /**
   * Remove a label from a task.
   * @param taskId  - The task
   * @param labelId - The label to remove
   */
  async removeLabelFromTask(taskId, labelId) {
    await this.request(`/tasks/${taskId}/labels/${labelId}`, {
      method: "DELETE"
    });
  }
};

// src/types.ts
var DEFAULT_SETTINGS = {
  apiUrl: "",
  apiToken: "",
  syncIntervalSeconds: 300,
  syncOnSave: true,
  defaultProjectId: null,
  showRibbonIcon: true,
  syncCompletedTasks: true,
  excludedFolders: [],
  autoCreateProjectFiles: true,
  projectsFolder: "Vikunja"
};
var VIKUNJA_NULL_DATE = "0001-01-01T00:00:00Z";
var PRIORITY_MAP = {
  "\u{1F53A}": 5,
  // Highest
  "\u23EB": 4,
  // High
  "\u{1F53C}": 3,
  // Medium
  "\u{1F53D}": 2,
  // Low
  "\u23EC": 1
  // Lowest
};
var PRIORITY_MAP_REVERSE = {
  5: "\u{1F53A}",
  4: "\u23EB",
  3: "\u{1F53C}",
  2: "\u{1F53D}",
  1: "\u23EC"
};

// src/sync/TaskParser.ts
var TASK_LINE_REGEX = /^(\s*)[-*]\s+\[([x ])\]\s+(.+)$/i;
var VIKUNJA_ID_REGEX = /<!--vikunja:(\d+)-->/;
var DUE_DATE_REGEX = /📅\s*(\d{4}-\d{2}-\d{2})/;
var START_DATE_REGEX = /🛫\s*(\d{4}-\d{2}-\d{2})/;
var SCHEDULED_DATE_REGEX = /⏳\s*(\d{4}-\d{2}-\d{2})/;
var RECURRENCE_EXTRACT_REGEX = /🔁\s*([^🔺⏫🔼🔽⏬📅🛫⏳➕✅❌🆔⛔🏁@<]+)/;
var PROJECT_OVERRIDE_REGEX = /@project:([^@<📅🛫⏳🔺⏫🔼🔽⏬➕✅❌🆔⛔🏁]+)/;
var PRIORITY_EMOJIS = Object.keys(PRIORITY_MAP);
var DATE_STRIP_REGEX = /[📅🛫⏳]\s*\d{4}-\d{2}-\d{2}/g;
var RECURRENCE_STRIP_REGEX = /🔁\s*[^🔺⏫🔼🔽⏬📅🛫⏳➕✅❌🆔⛔🏁@<]*/g;
var CREATED_DATE_STRIP_REGEX = /➕\s*\d{4}-\d{2}-\d{2}/g;
var DONE_DATE_STRIP_REGEX = /✅\s*\d{4}-\d{2}-\d{2}/g;
var CANCELLED_DATE_STRIP_REGEX = /❌\s*\d{4}-\d{2}-\d{2}/g;
var TASK_ID_STRIP_REGEX = /🆔\s*\S*/g;
var BLOCKED_BY_STRIP_REGEX = /⛔\s*\S*/g;
var FINISH_ON_STRIP_REGEX = /🏁\s*\S*/g;
var TaskParser = class _TaskParser {
  /**
   * Parse all task lines from a markdown file's content.
   */
  static parseFile(content, filePath) {
    return content.split("\n").map((line, i) => _TaskParser.parseLine(line, i, filePath)).filter((t) => t !== null);
  }
  /**
   * Parse a single line into an ObsidianTask, or return null if not a task.
   */
  static parseLine(line, lineNumber, filePath) {
    const match = line.match(TASK_LINE_REGEX);
    if (!match)
      return null;
    const [, , checkmark, rawContent] = match;
    const done = checkmark.toLowerCase() === "x";
    const vikunjaMatch = rawContent.match(VIKUNJA_ID_REGEX);
    const vikunjaId = vikunjaMatch ? parseInt(vikunjaMatch[1], 10) : null;
    const dueDateMatch = rawContent.match(DUE_DATE_REGEX);
    const startDateMatch = rawContent.match(START_DATE_REGEX);
    const scheduledDateMatch = rawContent.match(SCHEDULED_DATE_REGEX);
    let priority = 0;
    for (const [emoji, value] of Object.entries(PRIORITY_MAP)) {
      if (rawContent.includes(emoji)) {
        priority = value;
        break;
      }
    }
    const recurrenceMatch = rawContent.match(RECURRENCE_EXTRACT_REGEX);
    const recurrence = recurrenceMatch ? recurrenceMatch[1].trim() : null;
    const projectMatch = rawContent.match(PROJECT_OVERRIDE_REGEX);
    const projectName = projectMatch ? projectMatch[1].trim() : null;
    const title = _TaskParser.cleanTitle(rawContent);
    return {
      rawLine: line,
      lineNumber,
      filePath,
      title,
      done,
      dueDate: dueDateMatch ? dueDateMatch[1] : null,
      startDate: startDateMatch ? startDateMatch[1] : null,
      scheduledDate: scheduledDateMatch ? scheduledDateMatch[1] : null,
      priority,
      recurrence,
      vikunjaId,
      projectId: null,
      projectName
    };
  }
  /**
   * Strip all metadata tokens from a task title, leaving only human-readable text.
   *
   * Strips:
   * - Our own tokens: dates, priority, @project:, <!--vikunja:-->, 🔁 recurrence
   * - Obsidian Tasks plugin tokens: ➕ ✅ ❌ 🆔 ⛔ 🏁
   */
  static cleanTitle(raw) {
    let t = raw;
    t = t.replace(VIKUNJA_ID_REGEX, "");
    t = t.replace(DATE_STRIP_REGEX, "");
    t = t.replace(RECURRENCE_STRIP_REGEX, "");
    t = t.replace(PROJECT_OVERRIDE_REGEX, "");
    for (const emoji of PRIORITY_EMOJIS)
      t = t.replace(emoji, "");
    t = t.replace(CREATED_DATE_STRIP_REGEX, "");
    t = t.replace(DONE_DATE_STRIP_REGEX, "");
    t = t.replace(CANCELLED_DATE_STRIP_REGEX, "");
    t = t.replace(TASK_ID_STRIP_REGEX, "");
    t = t.replace(BLOCKED_BY_STRIP_REGEX, "");
    t = t.replace(FINISH_ON_STRIP_REGEX, "");
    return t.trim().replace(/\s+/g, " ");
  }
  // ─── Serialisation ──────────────────────────────────────────────────────────
  /**
   * Serialise an ObsidianTask back to a markdown line.
   * Preserves the original indentation from rawLine.
   */
  static serialise(task) {
    const indentMatch = task.rawLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : "";
    const checkmark = task.done ? "x" : " ";
    let line = `${indent}- [${checkmark}] ${task.title}`;
    if (task.projectName)
      line += ` @project:${task.projectName}`;
    if (task.recurrence)
      line += ` \u{1F501} ${task.recurrence}`;
    if (task.priority > 0 && PRIORITY_MAP_REVERSE[task.priority]) {
      line += ` ${PRIORITY_MAP_REVERSE[task.priority]}`;
    }
    if (task.startDate)
      line += ` \u{1F6EB} ${task.startDate}`;
    if (task.scheduledDate)
      line += ` \u23F3 ${task.scheduledDate}`;
    if (task.dueDate)
      line += ` \u{1F4C5} ${task.dueDate}`;
    if (task.vikunjaId !== null)
      line += ` <!--vikunja:${task.vikunjaId}-->`;
    return line;
  }
  /**
   * Replace a specific line in file content with a new task serialisation.
   */
  static replaceLine(content, lineNumber, newLine) {
    const lines = content.split("\n");
    lines[lineNumber] = newLine;
    return lines.join("\n");
  }
  /** Quick check — does this line look like a task? */
  static isTaskLine(line) {
    return TASK_LINE_REGEX.test(line);
  }
  // ─── Recurrence helpers ─────────────────────────────────────────────────────
  /**
   * Convert a recurrence string (e.g. "every week") to seconds for Vikunja's
   * `repeat_after` field. Returns undefined if the pattern is not recognised.
   *
   * Supports:
   *   every day / daily
   *   every week / weekly
   *   every month / monthly
   *   every year / yearly
   *   every other day
   *   every N days / weeks / months / years
   */
  static parseRepeatAfter(recurrence) {
    if (!recurrence)
      return void 0;
    const r = recurrence.toLowerCase().trim();
    const SECOND = 1;
    const DAY = 86400 * SECOND;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;
    const YEAR = 365 * DAY;
    if (r === "every day" || r === "daily")
      return DAY;
    if (r === "every week" || r === "weekly")
      return WEEK;
    if (r === "every month" || r === "monthly")
      return MONTH;
    if (r === "every year" || r === "yearly")
      return YEAR;
    if (r === "every other day")
      return 2 * DAY;
    const m = r.match(/^every (\d+) (day|week|month|year)s?$/);
    if (m) {
      const n = parseInt(m[1], 10);
      const units = { day: DAY, week: WEEK, month: MONTH, year: YEAR };
      return n * units[m[2]];
    }
    return void 0;
  }
  /**
   * Convert Vikunja's `repeat_after` (seconds) back to a human-readable
   * recurrence string for display in Obsidian.
   * Returns null when repeat_after is 0 (no recurrence).
   */
  static formatRepeatAfter(seconds) {
    if (!seconds || seconds <= 0)
      return null;
    const DAY = 86400;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;
    const YEAR = 365 * DAY;
    if (seconds % YEAR === 0)
      return seconds === YEAR ? "every year" : `every ${seconds / YEAR} years`;
    if (seconds % MONTH === 0)
      return seconds === MONTH ? "every month" : `every ${seconds / MONTH} months`;
    if (seconds % WEEK === 0)
      return seconds === WEEK ? "every week" : `every ${seconds / WEEK} weeks`;
    if (seconds % DAY === 0)
      return seconds === DAY ? "every day" : `every ${seconds / DAY} days`;
    const days = Math.round(seconds / DAY);
    return days === 1 ? "every day" : `every ${days} days`;
  }
};

// src/sync/SyncEngine.ts
var SyncEngine = class _SyncEngine {
  app;
  client;
  settings;
  /** Tracks the last sync timestamp to detect remote changes */
  lastSyncTime = null;
  /**
   * Project list cache — populated once per sync run to avoid repeated API calls
   * when resolving project names from frontmatter across many files.
   */
  cachedProjects = null;
  constructor(app, client, settings) {
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
  async sync() {
    const result = {
      created: 0,
      updated: 0,
      completed: 0,
      errors: [],
      timestamp: /* @__PURE__ */ new Date()
    };
    this.cachedProjects = null;
    try {
      const newProjectFiles = await this.ensureProjectFiles();
      const { tasks: obsidianTasks, fileProjectMap } = await this.scanVault();
      for (const [path, id] of newProjectFiles) {
        if (!fileProjectMap.has(path))
          fileProjectMap.set(path, id);
      }
      await this.pushNewTasks(obsidianTasks, result);
      await this.pushTaskUpdates(obsidianTasks, result);
      await this.pullRemoteChanges(obsidianTasks, fileProjectMap, result);
    } catch (err) {
      result.errors.push(String(err));
    }
    this.lastSyncTime = /* @__PURE__ */ new Date();
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
  async syncFile(file) {
    const result = {
      created: 0,
      updated: 0,
      completed: 0,
      errors: [],
      timestamp: /* @__PURE__ */ new Date()
    };
    if (this.isExcluded(file.path))
      return result;
    this.cachedProjects = null;
    try {
      const content = await this.app.vault.read(file);
      const tasks = TaskParser.parseFile(content, file.path);
      const explicitId = await this.getExplicitProjectId(file);
      const effectiveId = explicitId ?? this.settings.defaultProjectId;
      for (const task of tasks) {
        task.projectId = effectiveId;
      }
      await this.pushNewTasks(tasks, result);
      await this.pushTaskUpdates(tasks, result);
      if (explicitId !== null) {
        const fileProjectMap = /* @__PURE__ */ new Map([[file.path, explicitId]]);
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
  async handleCheckboxToggle(file, lineNumber, done) {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const line = lines[lineNumber];
    if (!TaskParser.isTaskLine(line))
      return;
    const task = TaskParser.parseLine(line, lineNumber, file.path);
    if (!task)
      return;
    task.done = done;
    if (task.vikunjaId !== null) {
      await this.client.setTaskDone(task.vikunjaId, done);
    }
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
  async ensureProjectFiles() {
    const created = /* @__PURE__ */ new Map();
    if (!this.settings.autoCreateProjectFiles)
      return created;
    const folder = this.settings.projectsFolder.trim().replace(/\/+$/, "");
    if (!folder)
      return created;
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      try {
        await this.app.vault.createFolder(folder);
      } catch {
      }
    }
    const projects = await this.getCachedProjects();
    for (const project of projects) {
      if (project.is_archived)
        continue;
      const safeName = project.title.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim();
      if (!safeName)
        continue;
      const filePath = `${folder}/${safeName}.md`;
      if (this.app.vault.getAbstractFileByPath(filePath))
        continue;
      const content = `---
vikunja_project_id: ${project.id}
---

# ${project.title}

`;
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
  async scanVault() {
    const allTasks = [];
    const fileProjectMap = /* @__PURE__ */ new Map();
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (this.isExcluded(file.path))
        continue;
      try {
        const content = await this.app.vault.read(file);
        const tasks = TaskParser.parseFile(content, file.path);
        const explicitId = await this.getExplicitProjectId(file);
        const effectiveId = explicitId ?? this.settings.defaultProjectId;
        for (const task of tasks) {
          task.projectId = effectiveId;
        }
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
  async pushNewTasks(tasks, result) {
    const newTasks = tasks.filter((t) => t.vikunjaId === null);
    for (const task of newTasks) {
      let projectId = task.projectId ?? this.settings.defaultProjectId;
      if (task.projectName) {
        const projects = await this.getCachedProjects();
        const match = projects.find(
          (p) => p.title.toLowerCase().trim() === task.projectName.toLowerCase().trim()
        );
        if (match) {
          projectId = match.id;
        } else {
          result.errors.push(
            `Unknown project "@project:${task.projectName}" on task "${task.title}" in ${task.filePath}. Check the name matches a project in Vikunja exactly.`
          );
          continue;
        }
      }
      if (!projectId) {
        result.errors.push(
          `Skipped "${task.title}" in ${task.filePath} \u2014 no project assigned. Add vikunja_project_id to the note's frontmatter, use @project:Name on the task line, or set a Default Project in plugin settings.`
        );
        continue;
      }
      try {
        const created = await this.client.createTask(projectId, {
          title: task.title,
          done: task.done,
          due_date: task.dueDate ? new Date(task.dueDate).toISOString() : void 0,
          start_date: task.startDate ? new Date(task.startDate).toISOString() : void 0,
          priority: task.priority > 0 ? task.priority : void 0,
          repeat_after: TaskParser.parseRepeatAfter(task.recurrence)
        });
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
  async pushTaskUpdates(tasks, result) {
    const existingTasks = tasks.filter((t) => t.vikunjaId !== null);
    for (const task of existingTasks) {
      try {
        await this.client.updateTask(task.vikunjaId, {
          title: task.title,
          done: task.done,
          due_date: task.dueDate ? new Date(task.dueDate).toISOString() : void 0,
          start_date: task.startDate ? new Date(task.startDate).toISOString() : void 0,
          priority: task.priority > 0 ? task.priority : void 0,
          repeat_after: TaskParser.parseRepeatAfter(task.recurrence)
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
  async pullRemoteChanges(localTasks, fileProjectMap, result) {
    const localById = new Map(
      localTasks.filter((t) => t.vikunjaId !== null).map((t) => [t.vikunjaId, t])
    );
    const handledRemoteIds = /* @__PURE__ */ new Set();
    const projectToFiles = /* @__PURE__ */ new Map();
    for (const [filePath, projectId] of fileProjectMap) {
      const list = projectToFiles.get(projectId) ?? [];
      list.push(filePath);
      projectToFiles.set(projectId, list);
    }
    for (const [projectId, filePaths] of projectToFiles) {
      let remoteTasks = [];
      try {
        remoteTasks = await this.client.getProjectTasks(projectId);
      } catch (err) {
        result.errors.push(`Failed to fetch tasks for project ${projectId}: ${String(err)}`);
        continue;
      }
      const toImport = [];
      for (const remote of remoteTasks) {
        handledRemoteIds.add(remote.id);
        const local = localById.get(remote.id);
        if (local) {
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
          if (changed)
            await this.writeTaskToFile(local);
        } else {
          if (!remote.done || this.settings.syncCompletedTasks) {
            toImport.push(remote);
          }
        }
      }
      if (toImport.length > 0) {
        await this.appendTasksToFile(filePaths[0], toImport, result);
      }
    }
    const unhandledLocal = localTasks.filter(
      (t) => t.vikunjaId !== null && !handledRemoteIds.has(t.vikunjaId)
    );
    if (unhandledLocal.length === 0)
      return;
    let allRemote = [];
    try {
      allRemote = await this.client.getAllTasks();
    } catch (err) {
      result.errors.push(`Failed to fetch remote tasks: ${String(err)}`);
      return;
    }
    for (const remote of allRemote) {
      if (handledRemoteIds.has(remote.id))
        continue;
      const local = localById.get(remote.id);
      if (!local)
        continue;
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
      if (changed)
        await this.writeTaskToFile(local);
    }
  }
  // ─── File Writing ────────────────────────────────────────────────────────────
  /**
   * Write an updated task back to its source file.
   * Replaces only the specific line — does not touch the rest of the file.
   *
   * @param task - The task with updated fields
   */
  async writeTaskToFile(task) {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!file || !("extension" in file)) {
      throw new Error(`File not found: ${task.filePath}`);
    }
    const content = await this.app.vault.read(file);
    const newLine = TaskParser.serialise(task);
    const newContent = TaskParser.replaceLine(content, task.lineNumber, newLine);
    await this.app.vault.modify(file, newContent);
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
  async appendTasksToFile(filePath, remoteTasks, result) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !("extension" in file))
      return;
    const content = await this.app.vault.read(file);
    const newLines = remoteTasks.map((remote) => {
      const task = {
        rawLine: "",
        lineNumber: -1,
        filePath,
        title: remote.title,
        done: remote.done,
        dueDate: _SyncEngine.formatDate(remote.due_date),
        startDate: _SyncEngine.formatDate(remote.start_date),
        scheduledDate: null,
        // Vikunja has no scheduled-date concept
        priority: remote.priority,
        recurrence: TaskParser.formatRepeatAfter(remote.repeat_after),
        vikunjaId: remote.id,
        projectId: remote.project_id,
        projectName: null
      };
      return TaskParser.serialise(task);
    });
    const newContent = content.trimEnd() + "\n" + newLines.join("\n") + "\n";
    await this.app.vault.modify(file, newContent);
    result.created += remoteTasks.length;
  }
  // ─── Helpers ─────────────────────────────────────────────────────────────────
  /**
   * Fetch the project list, using a per-run in-memory cache so that name-based
   * frontmatter lookups (`vikunja_project: "Work Tasks"`) across many files
   * only result in a single API call per sync run.
   */
  async getCachedProjects() {
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
  async getExplicitProjectId(file) {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (frontmatter?.vikunja_project_id) {
      return Number(frontmatter.vikunja_project_id);
    }
    if (frontmatter?.vikunja_project) {
      const name = String(frontmatter.vikunja_project).toLowerCase().trim();
      const projects = await this.getCachedProjects();
      const match = projects.find((p) => p.title.toLowerCase().trim() === name);
      if (match)
        return match.id;
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
  async resolveProjectId(file) {
    return await this.getExplicitProjectId(file) ?? this.settings.defaultProjectId;
  }
  /**
   * Check if a file path should be excluded from sync.
   * @param path - Vault-relative file path
   */
  isExcluded(path) {
    return this.settings.excludedFolders.some(
      (folder) => path.startsWith(folder.trim() + "/")
    );
  }
  /**
   * Format a Vikunja ISO date string to YYYY-MM-DD for Obsidian Tasks syntax.
   * Returns null for Vikunja's null date sentinel.
   */
  static formatDate(isoDate) {
    if (!isoDate || isoDate === VIKUNJA_NULL_DATE)
      return null;
    return isoDate.split("T")[0];
  }
};

// src/ui/SettingsTab.ts
var import_obsidian = require("obsidian");
var VikunjaSettingsTab = class extends import_obsidian.PluginSettingTab {
  plugin;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Vikunja Connection" });
    new import_obsidian.Setting(containerEl).setName("Vikunja URL").setDesc("Base URL of your Vikunja instance, e.g. https://vikunja.example.com").addText(
      (text) => text.setPlaceholder("https://vikunja.example.com").setValue(this.plugin.settings.apiUrl).onChange(async (value) => {
        this.plugin.settings.apiUrl = value.trim().replace(/\/$/, "");
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("API Token").setDesc(
      "Personal access token from Vikunja \u2192 Account Settings \u2192 API Tokens. Generate a token with full access."
    ).addText((text) => {
      text.setPlaceholder("Paste your token here").setValue(this.plugin.settings.apiToken).onChange(async (value) => {
        this.plugin.settings.apiToken = value.trim();
        await this.plugin.saveSettings();
      });
      text.inputEl.type = "password";
    });
    new import_obsidian.Setting(containerEl).setName("Test Connection").setDesc("Verify your URL and token are correct.").addButton(
      (btn) => btn.setButtonText("Test").setCta().onClick(async () => {
        btn.setButtonText("Testing\u2026");
        btn.setDisabled(true);
        const result = await this.plugin.testConnection();
        if (result.success) {
          new import_obsidian.Notice("\u2705 Connected to Vikunja successfully!");
          this.display();
        } else {
          new import_obsidian.Notice(`\u274C Connection failed: ${result.error}`);
          btn.setButtonText("Test");
          btn.setDisabled(false);
        }
      })
    );
    containerEl.createEl("h2", { text: "Default Project" });
    new import_obsidian.Setting(containerEl).setName("Default Project").setDesc(
      "Tasks created in notes without a vikunja_project_id frontmatter property will be added to this project."
    ).addDropdown(async (dropdown) => {
      dropdown.addOption("", "\u2014 Select a project \u2014");
      try {
        const projects = await this.plugin.client?.getProjects() ?? [];
        for (const project of projects) {
          dropdown.addOption(String(project.id), project.title);
        }
      } catch {
        dropdown.addOption("", "Could not load projects \u2014 check connection");
      }
      dropdown.setValue(String(this.plugin.settings.defaultProjectId ?? "")).onChange(async (value) => {
        this.plugin.settings.defaultProjectId = value ? parseInt(value, 10) : null;
        await this.plugin.saveSettings();
      });
    });
    containerEl.createEl("h2", { text: "Project Files" });
    new import_obsidian.Setting(containerEl).setName("Auto-create project files").setDesc(
      "Automatically create one markdown file per Vikunja project in the folder below. Each file is pre-configured with the correct project ID and acts as the task list for that project. Files are only created \u2014 never deleted or renamed \u2014 so renaming a project in Vikunja won't affect existing files."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoCreateProjectFiles).onChange(async (value) => {
        this.plugin.settings.autoCreateProjectFiles = value;
        await this.plugin.saveSettings();
        folderSetting.settingEl.toggle(value);
      })
    );
    const folderSetting = new import_obsidian.Setting(containerEl).setName("Projects folder").setDesc(
      "Vault-relative folder where project files are created. The folder is created automatically if it doesn't exist. Example: Vikunja, Tasks/Projects"
    ).addText(
      (text) => text.setPlaceholder("Vikunja").setValue(this.plugin.settings.projectsFolder).onChange(async (value) => {
        this.plugin.settings.projectsFolder = value.trim().replace(/\/+$/, "");
        await this.plugin.saveSettings();
      })
    );
    folderSetting.settingEl.toggle(this.plugin.settings.autoCreateProjectFiles);
    containerEl.createEl("h2", { text: "Sync Behaviour" });
    new import_obsidian.Setting(containerEl).setName("Sync on save").setDesc("Automatically sync tasks when you save a markdown file.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.syncOnSave).onChange(async (value) => {
        this.plugin.settings.syncOnSave = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Sync interval (seconds)").setDesc(
      "How often to poll Vikunja for remote changes. Set to 0 to disable polling (sync on save only)."
    ).addSlider(
      (slider) => slider.setLimits(0, 3600, 30).setValue(this.plugin.settings.syncIntervalSeconds).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.syncIntervalSeconds = value;
        await this.plugin.saveSettings();
        this.plugin.restartSyncInterval();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Sync completed tasks").setDesc(
      "Pull tasks completed remotely (e.g. by collaborators) back to Obsidian and mark them as [x]."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.syncCompletedTasks).onChange(async (value) => {
        this.plugin.settings.syncCompletedTasks = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h2", { text: "Exclusions" });
    new import_obsidian.Setting(containerEl).setName("Excluded folders").setDesc(
      "Folders to exclude from task scanning, one per line. Tasks in these folders will not be synced to Vikunja. Example: Templates, Archive"
    ).addTextArea(
      (textarea) => textarea.setPlaceholder("Templates\nArchive\n.trash").setValue(this.plugin.settings.excludedFolders.join("\n")).onChange(async (value) => {
        this.plugin.settings.excludedFolders = value.split("\n").map((f) => f.trim()).filter(Boolean);
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h2", { text: "Interface" });
    new import_obsidian.Setting(containerEl).setName("Show ribbon icon").setDesc("Show the Vikunja sync button in the left sidebar ribbon.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.showRibbonIcon).onChange(async (value) => {
        this.plugin.settings.showRibbonIcon = value;
        await this.plugin.saveSettings();
        new import_obsidian.Notice("Reload Obsidian to apply ribbon changes.");
      })
    );
  }
};

// src/main.ts
var VikunjaPlugin = class extends import_obsidian2.Plugin {
  /** Persisted plugin settings */
  settings;
  /** HTTP client for the Vikunja API — null until settings are configured */
  client = null;
  /** Sync engine — null until client is ready */
  syncEngine = null;
  /** Handle for the periodic sync interval so we can clear/restart it */
  syncIntervalHandle = null;
  // ─── Lifecycle ───────────────────────────────────────────────────────────────
  async onload() {
    console.log("[Vikunja] Plugin loading\u2026");
    await this.loadSettings();
    this.initClient();
    this.addSettingTab(new VikunjaSettingsTab(this.app, this));
    if (this.settings.showRibbonIcon) {
      this.addRibbonIcon("refresh-cw", "Sync Vikunja tasks", async () => {
        await this.runFullSync();
      });
    }
    this.addCommand({
      id: "sync-all",
      name: "Sync all tasks with Vikunja",
      callback: async () => {
        await this.runFullSync();
      }
    });
    this.addCommand({
      id: "sync-current-file",
      name: "Sync current file with Vikunja",
      editorCallback: async (editor, view) => {
        if (view.file)
          await this.syncFile(view.file);
      }
    });
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (this.settings.syncOnSave && this.syncEngine && file instanceof import_obsidian2.TFile && file.extension === "md") {
          await this.syncFile(file);
        }
      })
    );
    this.registerDomEvent(document, "click", async (evt) => {
      await this.handleEditorClick(evt);
    });
    this.startSyncInterval();
    console.log("[Vikunja] Plugin loaded.");
  }
  onunload() {
    this.stopSyncInterval();
    console.log("[Vikunja] Plugin unloaded.");
  }
  // ─── Settings ────────────────────────────────────────────────────────────────
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.initClient();
  }
  // ─── Client Initialisation ───────────────────────────────────────────────────
  /**
   * Initialise (or re-initialise) the API client and sync engine.
   * Safe to call multiple times — replaces existing instances.
   */
  initClient() {
    if (!this.settings.apiUrl || !this.settings.apiToken) {
      this.client = null;
      this.syncEngine = null;
      return;
    }
    this.client = new VikunjaClient(this.settings.apiUrl, this.settings.apiToken);
    this.syncEngine = new SyncEngine(this.app, this.client, this.settings);
  }
  /**
   * Test the current connection settings.
   * Used by the settings tab "Test" button.
   */
  async testConnection() {
    if (!this.client) {
      return { success: false, error: "No URL or token configured." };
    }
    return this.client.testConnection();
  }
  // ─── Sync ────────────────────────────────────────────────────────────────────
  /**
   * Run a full vault sync and display a Notice with the result.
   */
  async runFullSync() {
    if (!this.syncEngine) {
      new import_obsidian2.Notice("\u26A0\uFE0F Vikunja: Please configure your API URL and token in settings.");
      return;
    }
    const notice = new import_obsidian2.Notice("\u{1F504} Vikunja: Syncing\u2026", 0);
    try {
      const result = await this.syncEngine.sync();
      notice.hide();
      const summary = [
        result.created > 0 ? `${result.created} created` : null,
        result.updated > 0 ? `${result.updated} updated` : null,
        result.completed > 0 ? `${result.completed} completed` : null
      ].filter(Boolean).join(", ");
      if (result.errors.length > 0) {
        new import_obsidian2.Notice(`\u26A0\uFE0F Vikunja sync finished with errors:
${result.errors.join("\n")}`, 8e3);
      } else if (summary) {
        new import_obsidian2.Notice(`\u2705 Vikunja: ${summary}`);
      } else {
        new import_obsidian2.Notice("\u2705 Vikunja: Everything up to date.");
      }
    } catch (err) {
      notice.hide();
      new import_obsidian2.Notice(`\u274C Vikunja sync failed: ${String(err)}`, 8e3);
    }
  }
  /**
   * Sync a single file — called on file-save events.
   * Runs silently (no Notice) to avoid interrupting the user.
   */
  async syncFile(file) {
    if (!this.syncEngine)
      return;
    try {
      const result = await this.syncEngine.syncFile(file);
      if (result.errors.length > 0) {
        console.error("[Vikunja] Sync errors:", result.errors);
      }
    } catch (err) {
      console.error("[Vikunja] File sync error:", err);
    }
  }
  // ─── Interval Management ─────────────────────────────────────────────────────
  /**
   * Start the periodic sync interval based on current settings.
   * If interval is 0, does nothing.
   */
  startSyncInterval() {
    this.stopSyncInterval();
    if (this.settings.syncIntervalSeconds <= 0)
      return;
    this.syncIntervalHandle = window.setInterval(async () => {
      if (this.syncEngine) {
        await this.runFullSync();
      }
    }, this.settings.syncIntervalSeconds * 1e3);
  }
  /** Stop the current sync interval if running */
  stopSyncInterval() {
    if (this.syncIntervalHandle !== null) {
      window.clearInterval(this.syncIntervalHandle);
      this.syncIntervalHandle = null;
    }
  }
  /**
   * Restart the sync interval — called when interval setting changes.
   */
  restartSyncInterval() {
    this.startSyncInterval();
  }
  // ─── Editor Interaction ──────────────────────────────────────────────────────
  /**
   * Handle clicks in the editor to detect checkbox toggles.
   * Intercepts clicks on task checkboxes in reading view and live preview.
   *
   * @param evt - DOM click event
   */
  async handleEditorClick(evt) {
    const target = evt.target;
    if (target.tagName !== "INPUT" || target.type !== "checkbox" || !target.closest("li.task-list-item")) {
      return;
    }
    if (!this.syncEngine)
      return;
    const view = this.app.workspace.getActiveViewOfType(
      (await import("obsidian")).MarkdownView
    );
    if (!view?.file)
      return;
    const listItem = target.closest("li");
    if (!listItem)
      return;
    const content = await this.app.vault.read(view.file);
    const lines = content.split("\n");
    const done = target.checked;
    const itemText = listItem.textContent?.trim() ?? "";
    const lineNumber = lines.findIndex((line) => {
      if (!line.includes("[") || !line.includes("]"))
        return false;
      const stripped = line.replace(/^[\s\-*]+\[[x ]\]\s*/i, "").trim();
      return itemText.startsWith(stripped.slice(0, 30));
    });
    if (lineNumber === -1)
      return;
    await this.syncEngine.handleCheckboxToggle(view.file, lineNumber, done);
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL2FwaS9WaWt1bmphQ2xpZW50LnRzIiwgInNyYy90eXBlcy50cyIsICJzcmMvc3luYy9UYXNrUGFyc2VyLnRzIiwgInNyYy9zeW5jL1N5bmNFbmdpbmUudHMiLCAic3JjL3VpL1NldHRpbmdzVGFiLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcbiAqIEBmaWxlIG1haW4udHNcbiAqIEBkZXNjcmlwdGlvbiBFbnRyeSBwb2ludCBmb3IgdGhlIFZpa3VuamEgU3luYyBPYnNpZGlhbiBwbHVnaW4uXG4gKlxuICogUmVzcG9uc2liaWxpdGllczpcbiAqIC0gUGx1Z2luIGxpZmVjeWNsZSAob25sb2FkIC8gb251bmxvYWQpXG4gKiAtIFdpcmluZyB0b2dldGhlciB0aGUgQVBJIGNsaWVudCwgc3luYyBlbmdpbmUsIGFuZCBVSVxuICogLSBSZWdpc3RlcmluZyBldmVudCBsaXN0ZW5lcnMgKGZpbGUtc2F2ZSwgZWRpdG9yLWNsaWNrKVxuICogLSBNYW5hZ2luZyB0aGUgcGVyaW9kaWMgc3luYyBpbnRlcnZhbFxuICogLSBFeHBvc2luZyBjb21tYW5kcyB0byB0aGUgT2JzaWRpYW4gY29tbWFuZCBwYWxldHRlXG4gKi9cblxuaW1wb3J0IHtcbiAgUGx1Z2luLFxuICBOb3RpY2UsXG4gIFRGaWxlLFxuICB0eXBlIE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQsXG59IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBWaWt1bmphQ2xpZW50IH0gZnJvbSBcIi4vYXBpL1Zpa3VuamFDbGllbnRcIjtcbmltcG9ydCB7IFN5bmNFbmdpbmUgfSBmcm9tIFwiLi9zeW5jL1N5bmNFbmdpbmVcIjtcbmltcG9ydCB7IFZpa3VuamFTZXR0aW5nc1RhYiB9IGZyb20gXCIuL3VpL1NldHRpbmdzVGFiXCI7XG5pbXBvcnQge1xuICBERUZBVUxUX1NFVFRJTkdTLFxuICB0eXBlIFZpa3VuamFQbHVnaW5TZXR0aW5ncyxcbn0gZnJvbSBcIi4vdHlwZXNcIjtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgVmlrdW5qYVBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG4gIC8qKiBQZXJzaXN0ZWQgcGx1Z2luIHNldHRpbmdzICovXG4gIHNldHRpbmdzITogVmlrdW5qYVBsdWdpblNldHRpbmdzO1xuXG4gIC8qKiBIVFRQIGNsaWVudCBmb3IgdGhlIFZpa3VuamEgQVBJIFx1MjAxNCBudWxsIHVudGlsIHNldHRpbmdzIGFyZSBjb25maWd1cmVkICovXG4gIGNsaWVudDogVmlrdW5qYUNsaWVudCB8IG51bGwgPSBudWxsO1xuXG4gIC8qKiBTeW5jIGVuZ2luZSBcdTIwMTQgbnVsbCB1bnRpbCBjbGllbnQgaXMgcmVhZHkgKi9cbiAgcHJpdmF0ZSBzeW5jRW5naW5lOiBTeW5jRW5naW5lIHwgbnVsbCA9IG51bGw7XG5cbiAgLyoqIEhhbmRsZSBmb3IgdGhlIHBlcmlvZGljIHN5bmMgaW50ZXJ2YWwgc28gd2UgY2FuIGNsZWFyL3Jlc3RhcnQgaXQgKi9cbiAgcHJpdmF0ZSBzeW5jSW50ZXJ2YWxIYW5kbGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBMaWZlY3ljbGUgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgYXN5bmMgb25sb2FkKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnNvbGUubG9nKFwiW1Zpa3VuamFdIFBsdWdpbiBsb2FkaW5nXHUyMDI2XCIpO1xuXG4gICAgLy8gTG9hZCBwZXJzaXN0ZWQgc2V0dGluZ3NcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xuXG4gICAgLy8gSW5pdGlhbGlzZSBBUEkgY2xpZW50IGlmIGNyZWRlbnRpYWxzIGFyZSBwcmVzZW50XG4gICAgdGhpcy5pbml0Q2xpZW50KCk7XG5cbiAgICAvLyBSZWdpc3RlciBzZXR0aW5ncyB0YWJcbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IFZpa3VuamFTZXR0aW5nc1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG4gICAgLy8gUmVnaXN0ZXIgcmliYm9uIGljb25cbiAgICBpZiAodGhpcy5zZXR0aW5ncy5zaG93UmliYm9uSWNvbikge1xuICAgICAgdGhpcy5hZGRSaWJib25JY29uKFwicmVmcmVzaC1jd1wiLCBcIlN5bmMgVmlrdW5qYSB0YXNrc1wiLCBhc3luYyAoKSA9PiB7XG4gICAgICAgIGF3YWl0IHRoaXMucnVuRnVsbFN5bmMoKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFJlZ2lzdGVyIGNvbW1hbmRzXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInN5bmMtYWxsXCIsXG4gICAgICBuYW1lOiBcIlN5bmMgYWxsIHRhc2tzIHdpdGggVmlrdW5qYVwiLFxuICAgICAgY2FsbGJhY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgYXdhaXQgdGhpcy5ydW5GdWxsU3luYygpO1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJzeW5jLWN1cnJlbnQtZmlsZVwiLFxuICAgICAgbmFtZTogXCJTeW5jIGN1cnJlbnQgZmlsZSB3aXRoIFZpa3VuamFcIixcbiAgICAgIGVkaXRvckNhbGxiYWNrOiBhc3luYyAoZWRpdG9yLCB2aWV3KSA9PiB7XG4gICAgICAgIGlmICh2aWV3LmZpbGUpIGF3YWl0IHRoaXMuc3luY0ZpbGUodmlldy5maWxlKTtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBSZWdpc3RlciBmaWxlLXNhdmUgaGFuZGxlclxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLnZhdWx0Lm9uKFwibW9kaWZ5XCIsIGFzeW5jIChmaWxlKSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLnNldHRpbmdzLnN5bmNPblNhdmUgJiZcbiAgICAgICAgICB0aGlzLnN5bmNFbmdpbmUgJiZcbiAgICAgICAgICBmaWxlIGluc3RhbmNlb2YgVEZpbGUgJiZcbiAgICAgICAgICBmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiXG4gICAgICAgICkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuc3luY0ZpbGUoZmlsZSk7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIFJlZ2lzdGVyIGVkaXRvciBjbGljayBoYW5kbGVyIGZvciBjaGVja2JveCB0b2dnbGVzXG4gICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KGRvY3VtZW50LCBcImNsaWNrXCIsIGFzeW5jIChldnQpID0+IHtcbiAgICAgIGF3YWl0IHRoaXMuaGFuZGxlRWRpdG9yQ2xpY2soZXZ0KTtcbiAgICB9KTtcblxuICAgIC8vIFN0YXJ0IHBlcmlvZGljIHN5bmNcbiAgICB0aGlzLnN0YXJ0U3luY0ludGVydmFsKCk7XG5cbiAgICBjb25zb2xlLmxvZyhcIltWaWt1bmphXSBQbHVnaW4gbG9hZGVkLlwiKTtcbiAgfVxuXG4gIG9udW5sb2FkKCk6IHZvaWQge1xuICAgIHRoaXMuc3RvcFN5bmNJbnRlcnZhbCgpO1xuICAgIGNvbnNvbGUubG9nKFwiW1Zpa3VuamFdIFBsdWdpbiB1bmxvYWRlZC5cIik7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgU2V0dGluZ3MgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgYXN5bmMgbG9hZFNldHRpbmdzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMuc2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVNldHRpbmdzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XG4gICAgLy8gUmUtaW5pdGlhbGlzZSBjbGllbnQgaW4gY2FzZSBVUkwvdG9rZW4gY2hhbmdlZFxuICAgIHRoaXMuaW5pdENsaWVudCgpO1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIENsaWVudCBJbml0aWFsaXNhdGlvbiBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICAvKipcbiAgICogSW5pdGlhbGlzZSAob3IgcmUtaW5pdGlhbGlzZSkgdGhlIEFQSSBjbGllbnQgYW5kIHN5bmMgZW5naW5lLlxuICAgKiBTYWZlIHRvIGNhbGwgbXVsdGlwbGUgdGltZXMgXHUyMDE0IHJlcGxhY2VzIGV4aXN0aW5nIGluc3RhbmNlcy5cbiAgICovXG4gIHByaXZhdGUgaW5pdENsaWVudCgpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MuYXBpVXJsIHx8ICF0aGlzLnNldHRpbmdzLmFwaVRva2VuKSB7XG4gICAgICB0aGlzLmNsaWVudCA9IG51bGw7XG4gICAgICB0aGlzLnN5bmNFbmdpbmUgPSBudWxsO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuY2xpZW50ID0gbmV3IFZpa3VuamFDbGllbnQodGhpcy5zZXR0aW5ncy5hcGlVcmwsIHRoaXMuc2V0dGluZ3MuYXBpVG9rZW4pO1xuICAgIHRoaXMuc3luY0VuZ2luZSA9IG5ldyBTeW5jRW5naW5lKHRoaXMuYXBwLCB0aGlzLmNsaWVudCwgdGhpcy5zZXR0aW5ncyk7XG4gIH1cblxuICAvKipcbiAgICogVGVzdCB0aGUgY3VycmVudCBjb25uZWN0aW9uIHNldHRpbmdzLlxuICAgKiBVc2VkIGJ5IHRoZSBzZXR0aW5ncyB0YWIgXCJUZXN0XCIgYnV0dG9uLlxuICAgKi9cbiAgYXN5bmMgdGVzdENvbm5lY3Rpb24oKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgICBpZiAoIXRoaXMuY2xpZW50KSB7XG4gICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFwiTm8gVVJMIG9yIHRva2VuIGNvbmZpZ3VyZWQuXCIgfTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuY2xpZW50LnRlc3RDb25uZWN0aW9uKCk7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgU3luYyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICAvKipcbiAgICogUnVuIGEgZnVsbCB2YXVsdCBzeW5jIGFuZCBkaXNwbGF5IGEgTm90aWNlIHdpdGggdGhlIHJlc3VsdC5cbiAgICovXG4gIGFzeW5jIHJ1bkZ1bGxTeW5jKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5zeW5jRW5naW5lKSB7XG4gICAgICBuZXcgTm90aWNlKFwiXHUyNkEwXHVGRTBGIFZpa3VuamE6IFBsZWFzZSBjb25maWd1cmUgeW91ciBBUEkgVVJMIGFuZCB0b2tlbiBpbiBzZXR0aW5ncy5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgbm90aWNlID0gbmV3IE5vdGljZShcIlx1RDgzRFx1REQwNCBWaWt1bmphOiBTeW5jaW5nXHUyMDI2XCIsIDApO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc3luY0VuZ2luZS5zeW5jKCk7XG4gICAgICBub3RpY2UuaGlkZSgpO1xuXG4gICAgICBjb25zdCBzdW1tYXJ5ID0gW1xuICAgICAgICByZXN1bHQuY3JlYXRlZCA+IDAgPyBgJHtyZXN1bHQuY3JlYXRlZH0gY3JlYXRlZGAgOiBudWxsLFxuICAgICAgICByZXN1bHQudXBkYXRlZCA+IDAgPyBgJHtyZXN1bHQudXBkYXRlZH0gdXBkYXRlZGAgOiBudWxsLFxuICAgICAgICByZXN1bHQuY29tcGxldGVkID4gMCA/IGAke3Jlc3VsdC5jb21wbGV0ZWR9IGNvbXBsZXRlZGAgOiBudWxsLFxuICAgICAgXVxuICAgICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAgIC5qb2luKFwiLCBcIik7XG5cbiAgICAgIGlmIChyZXN1bHQuZXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgbmV3IE5vdGljZShgXHUyNkEwXHVGRTBGIFZpa3VuamEgc3luYyBmaW5pc2hlZCB3aXRoIGVycm9yczpcXG4ke3Jlc3VsdC5lcnJvcnMuam9pbihcIlxcblwiKX1gLCA4MDAwKTtcbiAgICAgIH0gZWxzZSBpZiAoc3VtbWFyeSkge1xuICAgICAgICBuZXcgTm90aWNlKGBcdTI3MDUgVmlrdW5qYTogJHtzdW1tYXJ5fWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmV3IE5vdGljZShcIlx1MjcwNSBWaWt1bmphOiBFdmVyeXRoaW5nIHVwIHRvIGRhdGUuXCIpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgbm90aWNlLmhpZGUoKTtcbiAgICAgIG5ldyBOb3RpY2UoYFx1Mjc0QyBWaWt1bmphIHN5bmMgZmFpbGVkOiAke1N0cmluZyhlcnIpfWAsIDgwMDApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTeW5jIGEgc2luZ2xlIGZpbGUgXHUyMDE0IGNhbGxlZCBvbiBmaWxlLXNhdmUgZXZlbnRzLlxuICAgKiBSdW5zIHNpbGVudGx5IChubyBOb3RpY2UpIHRvIGF2b2lkIGludGVycnVwdGluZyB0aGUgdXNlci5cbiAgICovXG4gIGFzeW5jIHN5bmNGaWxlKGZpbGU6IFRGaWxlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCF0aGlzLnN5bmNFbmdpbmUpIHJldHVybjtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnN5bmNFbmdpbmUuc3luY0ZpbGUoZmlsZSk7XG4gICAgICBpZiAocmVzdWx0LmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJbVmlrdW5qYV0gU3luYyBlcnJvcnM6XCIsIHJlc3VsdC5lcnJvcnMpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY29uc29sZS5lcnJvcihcIltWaWt1bmphXSBGaWxlIHN5bmMgZXJyb3I6XCIsIGVycik7XG4gICAgfVxuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEludGVydmFsIE1hbmFnZW1lbnQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgLyoqXG4gICAqIFN0YXJ0IHRoZSBwZXJpb2RpYyBzeW5jIGludGVydmFsIGJhc2VkIG9uIGN1cnJlbnQgc2V0dGluZ3MuXG4gICAqIElmIGludGVydmFsIGlzIDAsIGRvZXMgbm90aGluZy5cbiAgICovXG4gIHN0YXJ0U3luY0ludGVydmFsKCk6IHZvaWQge1xuICAgIHRoaXMuc3RvcFN5bmNJbnRlcnZhbCgpO1xuXG4gICAgaWYgKHRoaXMuc2V0dGluZ3Muc3luY0ludGVydmFsU2Vjb25kcyA8PSAwKSByZXR1cm47XG5cbiAgICB0aGlzLnN5bmNJbnRlcnZhbEhhbmRsZSA9IHdpbmRvdy5zZXRJbnRlcnZhbChhc3luYyAoKSA9PiB7XG4gICAgICBpZiAodGhpcy5zeW5jRW5naW5lKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucnVuRnVsbFN5bmMoKTtcbiAgICAgIH1cbiAgICB9LCB0aGlzLnNldHRpbmdzLnN5bmNJbnRlcnZhbFNlY29uZHMgKiAxMDAwKTtcbiAgfVxuXG4gIC8qKiBTdG9wIHRoZSBjdXJyZW50IHN5bmMgaW50ZXJ2YWwgaWYgcnVubmluZyAqL1xuICBzdG9wU3luY0ludGVydmFsKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnN5bmNJbnRlcnZhbEhhbmRsZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFySW50ZXJ2YWwodGhpcy5zeW5jSW50ZXJ2YWxIYW5kbGUpO1xuICAgICAgdGhpcy5zeW5jSW50ZXJ2YWxIYW5kbGUgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXN0YXJ0IHRoZSBzeW5jIGludGVydmFsIFx1MjAxNCBjYWxsZWQgd2hlbiBpbnRlcnZhbCBzZXR0aW5nIGNoYW5nZXMuXG4gICAqL1xuICByZXN0YXJ0U3luY0ludGVydmFsKCk6IHZvaWQge1xuICAgIHRoaXMuc3RhcnRTeW5jSW50ZXJ2YWwoKTtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBFZGl0b3IgSW50ZXJhY3Rpb24gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgLyoqXG4gICAqIEhhbmRsZSBjbGlja3MgaW4gdGhlIGVkaXRvciB0byBkZXRlY3QgY2hlY2tib3ggdG9nZ2xlcy5cbiAgICogSW50ZXJjZXB0cyBjbGlja3Mgb24gdGFzayBjaGVja2JveGVzIGluIHJlYWRpbmcgdmlldyBhbmQgbGl2ZSBwcmV2aWV3LlxuICAgKlxuICAgKiBAcGFyYW0gZXZ0IC0gRE9NIGNsaWNrIGV2ZW50XG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGhhbmRsZUVkaXRvckNsaWNrKGV2dDogTW91c2VFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHRhcmdldCA9IGV2dC50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cbiAgICAvLyBPbmx5IGNhcmUgYWJvdXQgY2hlY2tib3hlcyBpbnNpZGUgdGFzayBsaXN0IGl0ZW1zXG4gICAgaWYgKFxuICAgICAgdGFyZ2V0LnRhZ05hbWUgIT09IFwiSU5QVVRcIiB8fFxuICAgICAgKHRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS50eXBlICE9PSBcImNoZWNrYm94XCIgfHxcbiAgICAgICF0YXJnZXQuY2xvc2VzdChcImxpLnRhc2stbGlzdC1pdGVtXCIpXG4gICAgKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnN5bmNFbmdpbmUpIHJldHVybjtcblxuICAgIC8vIEZpbmQgd2hpY2ggZmlsZSB0aGlzIGNoZWNrYm94IGJlbG9uZ3MgdG9cbiAgICBjb25zdCB2aWV3ID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoXG4gICAgICAoYXdhaXQgaW1wb3J0KFwib2JzaWRpYW5cIikpLk1hcmtkb3duVmlld1xuICAgICk7XG5cbiAgICBpZiAoIXZpZXc/LmZpbGUpIHJldHVybjtcblxuICAgIC8vIEZpbmQgdGhlIGxpbmUgbnVtYmVyIGJ5IGxvb2tpbmcgYXQgdGhlIERPTSBjb250ZXh0XG4gICAgY29uc3QgbGlzdEl0ZW0gPSB0YXJnZXQuY2xvc2VzdChcImxpXCIpO1xuICAgIGlmICghbGlzdEl0ZW0pIHJldHVybjtcblxuICAgIC8vIFJlYWQgdGhlIGZpbGUgYW5kIGZpbmQgdGhlIG1hdGNoaW5nIHRhc2sgbGluZVxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKHZpZXcuZmlsZSk7XG4gICAgY29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KFwiXFxuXCIpO1xuICAgIGNvbnN0IGRvbmUgPSAodGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG5cbiAgICAvLyBGaW5kIHRoZSBsaW5lIGJ5IG1hdGNoaW5nIHRoZSB0ZXh0IGNvbnRlbnQgb2YgdGhlIGxpc3QgaXRlbVxuICAgIGNvbnN0IGl0ZW1UZXh0ID0gbGlzdEl0ZW0udGV4dENvbnRlbnQ/LnRyaW0oKSA/PyBcIlwiO1xuICAgIGNvbnN0IGxpbmVOdW1iZXIgPSBsaW5lcy5maW5kSW5kZXgoKGxpbmUpID0+IHtcbiAgICAgIGlmICghbGluZS5pbmNsdWRlcyhcIltcIikgfHwgIWxpbmUuaW5jbHVkZXMoXCJdXCIpKSByZXR1cm4gZmFsc2U7XG4gICAgICAvLyBTdHJpcCB0aGUgY2hlY2tib3ggc3ludGF4IHRvIGNvbXBhcmUgd2l0aCBET00gdGV4dFxuICAgICAgY29uc3Qgc3RyaXBwZWQgPSBsaW5lLnJlcGxhY2UoL15bXFxzXFwtKl0rXFxbW3ggXVxcXVxccyovaSwgXCJcIikudHJpbSgpO1xuICAgICAgcmV0dXJuIGl0ZW1UZXh0LnN0YXJ0c1dpdGgoc3RyaXBwZWQuc2xpY2UoMCwgMzApKTtcbiAgICB9KTtcblxuICAgIGlmIChsaW5lTnVtYmVyID09PSAtMSkgcmV0dXJuO1xuXG4gICAgYXdhaXQgdGhpcy5zeW5jRW5naW5lLmhhbmRsZUNoZWNrYm94VG9nZ2xlKHZpZXcuZmlsZSwgbGluZU51bWJlciwgZG9uZSk7XG4gIH1cbn1cbiIsICIvKipcbiAqIEBmaWxlIGFwaS9WaWt1bmphQ2xpZW50LnRzXG4gKiBAZGVzY3JpcHRpb24gVHlwZWQgSFRUUCBjbGllbnQgZm9yIHRoZSBWaWt1bmphIFJFU1QgQVBJLlxuICpcbiAqIEFsbCBBUEkgY29tbXVuaWNhdGlvbiBnb2VzIHRocm91Z2ggdGhpcyBjbGFzcy4gSXQgaGFuZGxlczpcbiAqIC0gQXV0aGVudGljYXRpb24gdmlhIEJlYXJlciB0b2tlblxuICogLSBSZXF1ZXN0L3Jlc3BvbnNlIHR5cGluZ1xuICogLSBFcnJvciBoYW5kbGluZyBhbmQgbm9ybWFsaXNhdGlvblxuICogLSBSYXRlIGxpbWl0aW5nIGF3YXJlbmVzc1xuICpcbiAqIFVzYWdlOlxuICogICBjb25zdCBjbGllbnQgPSBuZXcgVmlrdW5qYUNsaWVudChcImh0dHBzOi8vdmlrdW5qYS5leGFtcGxlLmNvbVwiLCBcIm15LXRva2VuXCIpO1xuICogICBjb25zdCB0YXNrcyA9IGF3YWl0IGNsaWVudC5nZXRQcm9qZWN0VGFza3MoMSk7XG4gKi9cblxuaW1wb3J0IHR5cGUge1xuICBWaWt1bmphVGFzayxcbiAgVmlrdW5qYVByb2plY3QsXG4gIFZpa3VuamFMYWJlbCxcbiAgQ3JlYXRlVGFza1BheWxvYWQsXG4gIFVwZGF0ZVRhc2tQYXlsb2FkLFxufSBmcm9tIFwiLi4vdHlwZXNcIjtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEVycm9yIFR5cGVzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4vKiogU3RydWN0dXJlZCBlcnJvciByZXR1cm5lZCBieSB0aGUgVmlrdW5qYSBBUEkgKi9cbmV4cG9ydCBpbnRlcmZhY2UgVmlrdW5qYUFwaUVycm9yIHtcbiAgY29kZTogbnVtYmVyO1xuICBtZXNzYWdlOiBzdHJpbmc7XG59XG5cbi8qKiBUaHJvd24gd2hlbiBhbiBBUEkgcmVxdWVzdCBmYWlscyAqL1xuZXhwb3J0IGNsYXNzIFZpa3VuamFSZXF1ZXN0RXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHB1YmxpYyByZWFkb25seSBzdGF0dXM6IG51bWJlcixcbiAgICBwdWJsaWMgcmVhZG9ubHkgYXBpRXJyb3I6IFZpa3VuamFBcGlFcnJvciB8IG51bGwsXG4gICAgbWVzc2FnZTogc3RyaW5nXG4gICkge1xuICAgIHN1cGVyKG1lc3NhZ2UpO1xuICAgIHRoaXMubmFtZSA9IFwiVmlrdW5qYVJlcXVlc3RFcnJvclwiO1xuICB9XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBDbGllbnQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmV4cG9ydCBjbGFzcyBWaWt1bmphQ2xpZW50IHtcbiAgcHJpdmF0ZSByZWFkb25seSBiYXNlVXJsOiBzdHJpbmc7XG4gIHByaXZhdGUgcmVhZG9ubHkgdG9rZW46IHN0cmluZztcblxuICAvKipcbiAgICogQHBhcmFtIGJhc2VVcmwgLSBWaWt1bmphIGluc3RhbmNlIFVSTCwgZS5nLiBodHRwczovL3Zpa3VuamEuZXhhbXBsZS5jb21cbiAgICogQHBhcmFtIHRva2VuICAgLSBQZXJzb25hbCBhY2Nlc3MgdG9rZW4gZnJvbSBWaWt1bmphIEFjY291bnQgU2V0dGluZ3NcbiAgICovXG4gIGNvbnN0cnVjdG9yKGJhc2VVcmw6IHN0cmluZywgdG9rZW46IHN0cmluZykge1xuICAgIC8vIE5vcm1hbGlzZTogc3RyaXAgdHJhaWxpbmcgc2xhc2ggc28gd2UgY2FuIGFsd2F5cyBhcHBlbmQgL2FwaS92MS8uLi5cbiAgICB0aGlzLmJhc2VVcmwgPSBiYXNlVXJsLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcbiAgICB0aGlzLnRva2VuID0gdG9rZW47XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgUHJpdmF0ZSBIZWxwZXJzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4gIC8qKiBCdWlsZCB0aGUgZnVsbCBBUEkgVVJMIGZvciBhIGdpdmVuIHBhdGggKi9cbiAgcHJpdmF0ZSB1cmwocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYCR7dGhpcy5iYXNlVXJsfS9hcGkvdjEke3BhdGh9YDtcbiAgfVxuXG4gIC8qKiBTdGFuZGFyZCBoZWFkZXJzIHNlbnQgd2l0aCBldmVyeSByZXF1ZXN0ICovXG4gIHByaXZhdGUgZ2V0IGhlYWRlcnMoKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB7XG4gICAgcmV0dXJuIHtcbiAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHt0aGlzLnRva2VufWAsXG4gICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIENvcmUgZmV0Y2ggd3JhcHBlci4gSGFuZGxlcyBub24tMnh4IHJlc3BvbnNlcyBieSB0aHJvd2luZyBWaWt1bmphUmVxdWVzdEVycm9yLlxuICAgKiBAcGFyYW0gcGF0aCAgICAtIEFQSSBwYXRoLCBlLmcuIC9wcm9qZWN0cy8xL3Rhc2tzXG4gICAqIEBwYXJhbSBvcHRpb25zIC0gU3RhbmRhcmQgUmVxdWVzdEluaXQgb3B0aW9uc1xuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyByZXF1ZXN0PFQ+KHBhdGg6IHN0cmluZywgb3B0aW9uczogUmVxdWVzdEluaXQgPSB7fSk6IFByb21pc2U8VD4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godGhpcy51cmwocGF0aCksIHtcbiAgICAgIC4uLm9wdGlvbnMsXG4gICAgICBoZWFkZXJzOiB7IC4uLnRoaXMuaGVhZGVycywgLi4uKG9wdGlvbnMuaGVhZGVycyBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID8/IHt9KSB9LFxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgbGV0IGFwaUVycm9yOiBWaWt1bmphQXBpRXJyb3IgfCBudWxsID0gbnVsbDtcbiAgICAgIHRyeSB7XG4gICAgICAgIGFwaUVycm9yID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIFZpa3VuamFBcGlFcnJvcjtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBSZXNwb25zZSBib2R5IHdhc24ndCBKU09OIFx1MjAxNCB0aGF0J3MgZmluZVxuICAgICAgfVxuICAgICAgdGhyb3cgbmV3IFZpa3VuamFSZXF1ZXN0RXJyb3IoXG4gICAgICAgIHJlc3BvbnNlLnN0YXR1cyxcbiAgICAgICAgYXBpRXJyb3IsXG4gICAgICAgIGFwaUVycm9yPy5tZXNzYWdlID8/IGBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfSBvbiAke3BhdGh9YFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyAyMDQgTm8gQ29udGVudCBcdTIwMTQgcmV0dXJuIGVtcHR5IG9iamVjdFxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDIwNCkgcmV0dXJuIHt9IGFzIFQ7XG5cbiAgICByZXR1cm4gcmVzcG9uc2UuanNvbigpIGFzIFByb21pc2U8VD47XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgQ29ubmVjdGlvbiBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICAvKipcbiAgICogVGVzdCBjb25uZWN0aXZpdHkgYW5kIHRva2VuIHZhbGlkaXR5LlxuICAgKiBDYWxscyAvaW5mbyB3aGljaCBpcyBwdWJsaWMsIHRoZW4gL3VzZXIgd2hpY2ggcmVxdWlyZXMgYXV0aC5cbiAgICogQHJldHVybnMgdHJ1ZSBpZiBjb25uZWN0aW9uIGFuZCBhdXRoIGFyZSB2YWxpZFxuICAgKi9cbiAgYXN5bmMgdGVzdENvbm5lY3Rpb24oKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5yZXF1ZXN0KFwiL3VzZXJcIik7XG4gICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH07XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBpZiAoZXJyIGluc3RhbmNlb2YgVmlrdW5qYVJlcXVlc3RFcnJvcikge1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnIpIH07XG4gICAgfVxuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFByb2plY3RzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4gIC8qKlxuICAgKiBGZXRjaCBhbGwgcHJvamVjdHMgdGhlIGF1dGhlbnRpY2F0ZWQgdXNlciBoYXMgYWNjZXNzIHRvLlxuICAgKiBAcmV0dXJucyBBcnJheSBvZiBWaWt1bmphIHByb2plY3RzXG4gICAqL1xuICBhc3luYyBnZXRQcm9qZWN0cygpOiBQcm9taXNlPFZpa3VuamFQcm9qZWN0W10+IHtcbiAgICByZXR1cm4gdGhpcy5yZXF1ZXN0PFZpa3VuamFQcm9qZWN0W10+KFwiL3Byb2plY3RzP3Blcl9wYWdlPTUwMFwiKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBGZXRjaCBhIHNpbmdsZSBwcm9qZWN0IGJ5IElELlxuICAgKiBAcGFyYW0gcHJvamVjdElkIC0gVmlrdW5qYSBwcm9qZWN0IElEXG4gICAqL1xuICBhc3luYyBnZXRQcm9qZWN0KHByb2plY3RJZDogbnVtYmVyKTogUHJvbWlzZTxWaWt1bmphUHJvamVjdD4ge1xuICAgIHJldHVybiB0aGlzLnJlcXVlc3Q8VmlrdW5qYVByb2plY3Q+KGAvcHJvamVjdHMvJHtwcm9qZWN0SWR9YCk7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgVGFza3MgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgLyoqXG4gICAqIEZldGNoIGFsbCB0YXNrcyBpbiBhIHByb2plY3QuXG4gICAqIEhhbmRsZXMgcGFnaW5hdGlvbiBhdXRvbWF0aWNhbGx5IFx1MjAxNCBmZXRjaGVzIGFsbCBwYWdlcy5cbiAgICogQHBhcmFtIHByb2plY3RJZCAtIFZpa3VuamEgcHJvamVjdCBJRFxuICAgKi9cbiAgYXN5bmMgZ2V0UHJvamVjdFRhc2tzKHByb2plY3RJZDogbnVtYmVyKTogUHJvbWlzZTxWaWt1bmphVGFza1tdPiB7XG4gICAgY29uc3QgYWxsVGFza3M6IFZpa3VuamFUYXNrW10gPSBbXTtcbiAgICBsZXQgcGFnZSA9IDE7XG5cbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgY29uc3QgdGFza3MgPSBhd2FpdCB0aGlzLnJlcXVlc3Q8VmlrdW5qYVRhc2tbXT4oXG4gICAgICAgIGAvcHJvamVjdHMvJHtwcm9qZWN0SWR9L3Rhc2tzP3Blcl9wYWdlPTUwJnBhZ2U9JHtwYWdlfWBcbiAgICAgICk7XG4gICAgICBhbGxUYXNrcy5wdXNoKC4uLnRhc2tzKTtcbiAgICAgIGlmICh0YXNrcy5sZW5ndGggPCA1MCkgYnJlYWs7IC8vIExhc3QgcGFnZVxuICAgICAgcGFnZSsrO1xuICAgIH1cblxuICAgIHJldHVybiBhbGxUYXNrcztcbiAgfVxuXG4gIC8qKlxuICAgKiBGZXRjaCBhbGwgdGFza3MgYWNyb3NzIGFsbCBwcm9qZWN0cy5cbiAgICogVXNlcyB0aGUgL3Rhc2tzL2FsbCBlbmRwb2ludCBmb3IgZWZmaWNpZW5jeS5cbiAgICogQHBhcmFtIHBhZ2UgLSBQYWdlIG51bWJlciAoMS1pbmRleGVkKVxuICAgKi9cbiAgYXN5bmMgZ2V0QWxsVGFza3MocGFnZSA9IDEpOiBQcm9taXNlPFZpa3VuamFUYXNrW10+IHtcbiAgICBjb25zdCBhbGxUYXNrczogVmlrdW5qYVRhc2tbXSA9IFtdO1xuICAgIGxldCBjdXJyZW50UGFnZSA9IHBhZ2U7XG5cbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgY29uc3QgdGFza3MgPSBhd2FpdCB0aGlzLnJlcXVlc3Q8VmlrdW5qYVRhc2tbXT4oXG4gICAgICAgIGAvdGFza3MvYWxsP3Blcl9wYWdlPTUwJnBhZ2U9JHtjdXJyZW50UGFnZX1gXG4gICAgICApO1xuICAgICAgYWxsVGFza3MucHVzaCguLi50YXNrcyk7XG4gICAgICBpZiAodGFza3MubGVuZ3RoIDwgNTApIGJyZWFrO1xuICAgICAgY3VycmVudFBhZ2UrKztcbiAgICB9XG5cbiAgICByZXR1cm4gYWxsVGFza3M7XG4gIH1cblxuICAvKipcbiAgICogRmV0Y2ggYSBzaW5nbGUgdGFzayBieSBJRC5cbiAgICogQHBhcmFtIHRhc2tJZCAtIFZpa3VuamEgdGFzayBJRFxuICAgKi9cbiAgYXN5bmMgZ2V0VGFzayh0YXNrSWQ6IG51bWJlcik6IFByb21pc2U8VmlrdW5qYVRhc2s+IHtcbiAgICByZXR1cm4gdGhpcy5yZXF1ZXN0PFZpa3VuamFUYXNrPihgL3Rhc2tzLyR7dGFza0lkfWApO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIG5ldyB0YXNrIGluIGEgcHJvamVjdC5cbiAgICogQHBhcmFtIHByb2plY3RJZCAtIFRoZSBwcm9qZWN0IHRvIGNyZWF0ZSB0aGUgdGFzayBpblxuICAgKiBAcGFyYW0gcGF5bG9hZCAgIC0gVGFzayBkYXRhXG4gICAqL1xuICBhc3luYyBjcmVhdGVUYXNrKHByb2plY3RJZDogbnVtYmVyLCBwYXlsb2FkOiBDcmVhdGVUYXNrUGF5bG9hZCk6IFByb21pc2U8VmlrdW5qYVRhc2s+IHtcbiAgICByZXR1cm4gdGhpcy5yZXF1ZXN0PFZpa3VuamFUYXNrPihgL3Byb2plY3RzLyR7cHJvamVjdElkfS90YXNrc2AsIHtcbiAgICAgIG1ldGhvZDogXCJQVVRcIixcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHBheWxvYWQpLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSBhbiBleGlzdGluZyB0YXNrLlxuICAgKiBVc2VzIFBPU1QgYXMgcGVyIFZpa3VuamEgQVBJIGNvbnZlbnRpb24uXG4gICAqIEBwYXJhbSB0YXNrSWQgIC0gVGhlIHRhc2sgdG8gdXBkYXRlXG4gICAqIEBwYXJhbSBwYXlsb2FkIC0gRmllbGRzIHRvIHVwZGF0ZSAocGFydGlhbCB1cGRhdGUgc3VwcG9ydGVkKVxuICAgKi9cbiAgYXN5bmMgdXBkYXRlVGFzayh0YXNrSWQ6IG51bWJlciwgcGF5bG9hZDogVXBkYXRlVGFza1BheWxvYWQpOiBQcm9taXNlPFZpa3VuamFUYXNrPiB7XG4gICAgcmV0dXJuIHRoaXMucmVxdWVzdDxWaWt1bmphVGFzaz4oYC90YXNrcy8ke3Rhc2tJZH1gLCB7XG4gICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCksXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogTWFyayBhIHRhc2sgYXMgZG9uZSBvciBub3QgZG9uZS5cbiAgICogQ29udmVuaWVuY2Ugd3JhcHBlciBhcm91bmQgdXBkYXRlVGFzay5cbiAgICogQHBhcmFtIHRhc2tJZCAtIFRoZSB0YXNrIHRvIHVwZGF0ZVxuICAgKiBAcGFyYW0gZG9uZSAgIC0gV2hldGhlciB0aGUgdGFzayBpcyBjb21wbGV0ZVxuICAgKi9cbiAgYXN5bmMgc2V0VGFza0RvbmUodGFza0lkOiBudW1iZXIsIGRvbmU6IGJvb2xlYW4pOiBQcm9taXNlPFZpa3VuamFUYXNrPiB7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlVGFzayh0YXNrSWQsIHsgZG9uZSB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEZWxldGUgYSB0YXNrIHBlcm1hbmVudGx5LlxuICAgKiBAcGFyYW0gdGFza0lkIC0gVGhlIHRhc2sgdG8gZGVsZXRlXG4gICAqL1xuICBhc3luYyBkZWxldGVUYXNrKHRhc2tJZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5yZXF1ZXN0PHZvaWQ+KGAvdGFza3MvJHt0YXNrSWR9YCwgeyBtZXRob2Q6IFwiREVMRVRFXCIgfSk7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgTGFiZWxzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4gIC8qKlxuICAgKiBGZXRjaCBhbGwgbGFiZWxzIHRoZSBhdXRoZW50aWNhdGVkIHVzZXIgaGFzIGFjY2VzcyB0by5cbiAgICovXG4gIGFzeW5jIGdldExhYmVscygpOiBQcm9taXNlPFZpa3VuamFMYWJlbFtdPiB7XG4gICAgcmV0dXJuIHRoaXMucmVxdWVzdDxWaWt1bmphTGFiZWxbXT4oXCIvbGFiZWxzP3Blcl9wYWdlPTUwMFwiKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYSBsYWJlbCB0byBhIHRhc2suXG4gICAqIEBwYXJhbSB0YXNrSWQgIC0gVGhlIHRhc2sgdG8gbGFiZWxcbiAgICogQHBhcmFtIGxhYmVsSWQgLSBUaGUgbGFiZWwgdG8gYXBwbHlcbiAgICovXG4gIGFzeW5jIGFkZExhYmVsVG9UYXNrKHRhc2tJZDogbnVtYmVyLCBsYWJlbElkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCB0aGlzLnJlcXVlc3Q8dm9pZD4oYC90YXNrcy8ke3Rhc2tJZH0vbGFiZWxzYCwge1xuICAgICAgbWV0aG9kOiBcIlBVVFwiLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBsYWJlbF9pZDogbGFiZWxJZCB9KSxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmUgYSBsYWJlbCBmcm9tIGEgdGFzay5cbiAgICogQHBhcmFtIHRhc2tJZCAgLSBUaGUgdGFza1xuICAgKiBAcGFyYW0gbGFiZWxJZCAtIFRoZSBsYWJlbCB0byByZW1vdmVcbiAgICovXG4gIGFzeW5jIHJlbW92ZUxhYmVsRnJvbVRhc2sodGFza0lkOiBudW1iZXIsIGxhYmVsSWQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMucmVxdWVzdDx2b2lkPihgL3Rhc2tzLyR7dGFza0lkfS9sYWJlbHMvJHtsYWJlbElkfWAsIHtcbiAgICAgIG1ldGhvZDogXCJERUxFVEVcIixcbiAgICB9KTtcbiAgfVxufVxuIiwgIi8qKlxuICogQGZpbGUgdHlwZXMudHNcbiAqIEBkZXNjcmlwdGlvbiBDb3JlIFR5cGVTY3JpcHQgaW50ZXJmYWNlcyByZXByZXNlbnRpbmcgVmlrdW5qYSBBUEkgZGF0YSBzaGFwZXMuXG4gKiBUaGVzZSBhcmUgdXNlZCB0aHJvdWdob3V0IHRoZSBwbHVnaW4gdG8gZW5zdXJlIHR5cGUgc2FmZXR5IHdoZW4gY29tbXVuaWNhdGluZ1xuICogd2l0aCB0aGUgVmlrdW5qYSBBUEkgYW5kIHdoZW4gc3RvcmluZyB0YXNrIGRhdGEgbG9jYWxseS5cbiAqL1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgVmlrdW5qYSBBUEkgVHlwZXMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbi8qKiBBIFZpa3VuamEgcHJvamVjdCAoZm9ybWVybHkgY2FsbGVkIFwibGlzdFwiKSAqL1xuZXhwb3J0IGludGVyZmFjZSBWaWt1bmphUHJvamVjdCB7XG4gIGlkOiBudW1iZXI7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGlzX2FyY2hpdmVkOiBib29sZWFuO1xuICBoZXhfY29sb3I6IHN0cmluZztcbiAgcGFyZW50X3Byb2plY3RfaWQ6IG51bWJlcjtcbn1cblxuLyoqIEEgbGFiZWwgdGhhdCBjYW4gYmUgYXBwbGllZCB0byB0YXNrcyAqL1xuZXhwb3J0IGludGVyZmFjZSBWaWt1bmphTGFiZWwge1xuICBpZDogbnVtYmVyO1xuICB0aXRsZTogc3RyaW5nO1xuICBoZXhfY29sb3I6IHN0cmluZztcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbn1cblxuLyoqIEEgdXNlciBhc3NpZ25lZSBvbiBhIHRhc2sgKi9cbmV4cG9ydCBpbnRlcmZhY2UgVmlrdW5qYVVzZXIge1xuICBpZDogbnVtYmVyO1xuICB1c2VybmFtZTogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIGVtYWlsOiBzdHJpbmc7XG59XG5cbi8qKiBBIHNpbmdsZSBWaWt1bmphIHRhc2sgKi9cbmV4cG9ydCBpbnRlcmZhY2UgVmlrdW5qYVRhc2sge1xuICBpZDogbnVtYmVyO1xuICB0aXRsZTogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkb25lOiBib29sZWFuO1xuICBkb25lX2F0OiBzdHJpbmcgfCBudWxsO1xuICBkdWVfZGF0ZTogc3RyaW5nIHwgbnVsbDtcbiAgc3RhcnRfZGF0ZTogc3RyaW5nIHwgbnVsbDtcbiAgZW5kX2RhdGU6IHN0cmluZyB8IG51bGw7XG4gIHByaW9yaXR5OiBudW1iZXI7XG4gIGxhYmVsczogVmlrdW5qYUxhYmVsW107XG4gIGFzc2lnbmVlczogVmlrdW5qYVVzZXJbXTtcbiAgcHJvamVjdF9pZDogbnVtYmVyO1xuICBjcmVhdGVkOiBzdHJpbmc7XG4gIHVwZGF0ZWQ6IHN0cmluZztcbiAgLyoqIFZpa3VuamEncyBudWxsIGRhdGUgc2VudGluZWwgdmFsdWUgKi9cbiAgcmVwZWF0X2FmdGVyOiBudW1iZXI7XG4gIHBlcmNlbnRfZG9uZTogbnVtYmVyO1xufVxuXG4vKiogUGF5bG9hZCBmb3IgY3JlYXRpbmcgYSBuZXcgdGFzayAqL1xuZXhwb3J0IGludGVyZmFjZSBDcmVhdGVUYXNrUGF5bG9hZCB7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuICBkb25lPzogYm9vbGVhbjtcbiAgZHVlX2RhdGU/OiBzdHJpbmc7XG4gIHN0YXJ0X2RhdGU/OiBzdHJpbmc7XG4gIGVuZF9kYXRlPzogc3RyaW5nO1xuICBwcmlvcml0eT86IG51bWJlcjtcbiAgcHJvamVjdF9pZD86IG51bWJlcjtcbiAgLyoqIFJlcGVhdCBpbnRlcnZhbCBpbiBzZWNvbmRzLiAwID0gbm8gcmVjdXJyZW5jZS4gKi9cbiAgcmVwZWF0X2FmdGVyPzogbnVtYmVyO1xufVxuXG4vKiogUGF5bG9hZCBmb3IgdXBkYXRpbmcgYW4gZXhpc3RpbmcgdGFzayAqL1xuZXhwb3J0IGludGVyZmFjZSBVcGRhdGVUYXNrUGF5bG9hZCB7XG4gIHRpdGxlPzogc3RyaW5nO1xuICBkZXNjcmlwdGlvbj86IHN0cmluZztcbiAgZG9uZT86IGJvb2xlYW47XG4gIGR1ZV9kYXRlPzogc3RyaW5nO1xuICBzdGFydF9kYXRlPzogc3RyaW5nO1xuICBlbmRfZGF0ZT86IHN0cmluZztcbiAgcHJpb3JpdHk/OiBudW1iZXI7XG4gIGxhYmVscz86IFZpa3VuamFMYWJlbFtdO1xuICAvKiogUmVwZWF0IGludGVydmFsIGluIHNlY29uZHMuIDAgPSBubyByZWN1cnJlbmNlLiAqL1xuICByZXBlYXRfYWZ0ZXI/OiBudW1iZXI7XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBQbHVnaW4gSW50ZXJuYWwgVHlwZXMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbi8qKlxuICogUmVwcmVzZW50cyBhIHRhc2sgYXMgcGFyc2VkIGZyb20gYW4gT2JzaWRpYW4gbWFya2Rvd24gZmlsZS5cbiAqIFRoaXMgaXMgdGhlIGJyaWRnZSBiZXR3ZWVuIE9ic2lkaWFuJ3MgYC0gWyBdYCBzeW50YXggYW5kIFZpa3VuamEgdGFza3MuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgT2JzaWRpYW5UYXNrIHtcbiAgLyoqIFJhdyBtYXJrZG93biBsaW5lLCBlLmcuIGAtIFsgXSBNeSB0YXNrIFx1RDgzRFx1RENDNSAyMDI2LTA0LTIwYCAqL1xuICByYXdMaW5lOiBzdHJpbmc7XG4gIC8qKiBMaW5lIG51bWJlciBpbiB0aGUgZmlsZSAoMC1pbmRleGVkKSAqL1xuICBsaW5lTnVtYmVyOiBudW1iZXI7XG4gIC8qKiBUaGUgZmlsZSBwYXRoIHRoaXMgdGFzayB3YXMgZm91bmQgaW4gKi9cbiAgZmlsZVBhdGg6IHN0cmluZztcbiAgLyoqIFBhcnNlZCB0YXNrIHRpdGxlIChzdHJpcHBlZCBvZiBtZXRhZGF0YSkgKi9cbiAgdGl0bGU6IHN0cmluZztcbiAgLyoqIFdoZXRoZXIgdGhlIGNoZWNrYm94IGlzIGNoZWNrZWQgKi9cbiAgZG9uZTogYm9vbGVhbjtcbiAgLyoqIFBhcnNlZCBkdWUgZGF0ZSBpZiBwcmVzZW50IChcdUQ4M0RcdURDQzUgZW1vamkgc3ludGF4KSAqL1xuICBkdWVEYXRlOiBzdHJpbmcgfCBudWxsO1xuICAvKiogUGFyc2VkIHN0YXJ0IGRhdGUgaWYgcHJlc2VudCAoXHVEODNEXHVERUVCIGVtb2ppIHN5bnRheCkgKi9cbiAgc3RhcnREYXRlOiBzdHJpbmcgfCBudWxsO1xuICAvKiogUGFyc2VkIHNjaGVkdWxlZCBkYXRlIGlmIHByZXNlbnQgKFx1MjNGMyBlbW9qaSBzeW50YXgpICovXG4gIHNjaGVkdWxlZERhdGU6IHN0cmluZyB8IG51bGw7XG4gIC8qKiBQcmlvcml0eSBpZiBwcmVzZW50IChcdUQ4M0RcdUREM0EgaGlnaGVzdCwgXHUyM0VCIGhpZ2gsIFx1RDgzRFx1REQzQyBtZWRpdW0sIFx1RDgzRFx1REQzRCBsb3cpICovXG4gIHByaW9yaXR5OiBudW1iZXI7XG4gIC8qKiBUaGUgVmlrdW5qYSB0YXNrIElEIGlmIHRoaXMgdGFzayBoYXMgYmVlbiBzeW5jZWQgKHN0b3JlZCBhcyBpbmxpbmUgbWV0YWRhdGEpICovXG4gIHZpa3VuamFJZDogbnVtYmVyIHwgbnVsbDtcbiAgLyoqIFRoZSBWaWt1bmphIHByb2plY3QgSUQgaW5mZXJyZWQgZnJvbSB0aGUgZmlsZSdzIGZyb250bWF0dGVyIG9yIGZvbGRlciAqL1xuICBwcm9qZWN0SWQ6IG51bWJlciB8IG51bGw7XG4gIC8qKlxuICAgKiBJbmxpbmUgcHJvamVjdCBuYW1lIG92ZXJyaWRlIHBhcnNlZCBmcm9tIGBAcHJvamVjdDpOYW1lYCBzeW50YXguXG4gICAqIFdoZW4gcHJlc2VudCwgdGhpcyB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgdGhlIG5vdGUncyBmcm9udG1hdHRlciBiaW5kaW5nLlxuICAgKiBTdHJpcHBlZCBmcm9tIHRoZSB0YXNrIHRpdGxlIGJlZm9yZSBwdXNoaW5nIHRvIFZpa3VuamEuXG4gICAqL1xuICBwcm9qZWN0TmFtZTogc3RyaW5nIHwgbnVsbDtcbiAgLyoqXG4gICAqIFJlY3VycmVuY2UgcnVsZSBwYXJzZWQgZnJvbSBgXHVEODNEXHVERDAxIGV2ZXJ5IHdlZWtgIHN5bnRheC5cbiAgICogU3RvcmVkIGFzIHRoZSBodW1hbi1yZWFkYWJsZSBzdHJpbmcgKGUuZy4gXCJldmVyeSB3ZWVrXCIpIGFuZCBjb252ZXJ0ZWRcbiAgICogdG8gc2Vjb25kcyBmb3IgVmlrdW5qYSdzIGByZXBlYXRfYWZ0ZXJgIGZpZWxkIHdoZW4gcHVzaGluZy5cbiAgICovXG4gIHJlY3VycmVuY2U6IHN0cmluZyB8IG51bGw7XG59XG5cbi8qKiBQbHVnaW4gc2V0dGluZ3Mgc3RvcmVkIGluIE9ic2lkaWFuJ3MgZGF0YS5qc29uICovXG5leHBvcnQgaW50ZXJmYWNlIFZpa3VuamFQbHVnaW5TZXR0aW5ncyB7XG4gIC8qKiBCYXNlIFVSTCBvZiB5b3VyIFZpa3VuamEgaW5zdGFuY2UsIGUuZy4gaHR0cHM6Ly92aWt1bmphLmV4YW1wbGUuY29tICovXG4gIGFwaVVybDogc3RyaW5nO1xuICAvKiogUGVyc29uYWwgYWNjZXNzIHRva2VuIGdlbmVyYXRlZCBpbiBWaWt1bmphIEFjY291bnQgU2V0dGluZ3MgKi9cbiAgYXBpVG9rZW46IHN0cmluZztcbiAgLyoqIEhvdyBvZnRlbiB0byBwb2xsIFZpa3VuamEgZm9yIHJlbW90ZSBjaGFuZ2VzLCBpbiBzZWNvbmRzLiAwID0gZGlzYWJsZWQgKi9cbiAgc3luY0ludGVydmFsU2Vjb25kczogbnVtYmVyO1xuICAvKiogV2hldGhlciB0byBzeW5jIHRhc2tzIG9uIGZpbGUgc2F2ZSAqL1xuICBzeW5jT25TYXZlOiBib29sZWFuO1xuICAvKiogRGVmYXVsdCBwcm9qZWN0IElEIGZvciB0YXNrcyBjcmVhdGVkIHdpdGhvdXQgYSBwcm9qZWN0IGNvbnRleHQgKi9cbiAgZGVmYXVsdFByb2plY3RJZDogbnVtYmVyIHwgbnVsbDtcbiAgLyoqIFdoZXRoZXIgdG8gc2hvdyBhIHJpYmJvbiBpY29uIGluIHRoZSBzaWRlYmFyICovXG4gIHNob3dSaWJib25JY29uOiBib29sZWFuO1xuICAvKiogV2hldGhlciB0byBzeW5jIGNvbXBsZXRlZCB0YXNrcyBiYWNrIHRvIE9ic2lkaWFuICovXG4gIHN5bmNDb21wbGV0ZWRUYXNrczogYm9vbGVhbjtcbiAgLyoqIEZvbGRlcnMgdG8gZXhjbHVkZSBmcm9tIHRhc2sgc2Nhbm5pbmcgKGNvbW1hLXNlcGFyYXRlZCkgKi9cbiAgZXhjbHVkZWRGb2xkZXJzOiBzdHJpbmdbXTtcbiAgLyoqXG4gICAqIFdoZW4gdHJ1ZSwgdGhlIHBsdWdpbiBhdXRvbWF0aWNhbGx5IGNyZWF0ZXMgb25lIG1hcmtkb3duIGZpbGUgcGVyXG4gICAqIFZpa3VuamEgcHJvamVjdCBpbnNpZGUgYHByb2plY3RzRm9sZGVyYC4gRWFjaCBmaWxlIGlzIHByZS1jb25maWd1cmVkXG4gICAqIHdpdGggdGhlIGNvcnJlY3QgYHZpa3VuamFfcHJvamVjdF9pZGAgZnJvbnRtYXR0ZXIgYW5kIGFjdHMgYXMgdGhlXG4gICAqIGNhbm9uaWNhbCB0YXNrIGxpc3QgZm9yIHRoYXQgcHJvamVjdC5cbiAgICovXG4gIGF1dG9DcmVhdGVQcm9qZWN0RmlsZXM6IGJvb2xlYW47XG4gIC8qKlxuICAgKiBWYXVsdC1yZWxhdGl2ZSBmb2xkZXIgd2hlcmUgYXV0by1jcmVhdGVkIHByb2plY3QgZmlsZXMgYXJlIHBsYWNlZC5cbiAgICogVGhlIGZvbGRlciBpcyBjcmVhdGVkIGlmIGl0IGRvZXMgbm90IGV4aXN0LlxuICAgKiBPbmx5IHVzZWQgd2hlbiBgYXV0b0NyZWF0ZVByb2plY3RGaWxlc2AgaXMgdHJ1ZS5cbiAgICovXG4gIHByb2plY3RzRm9sZGVyOiBzdHJpbmc7XG59XG5cbi8qKiBEZWZhdWx0IHBsdWdpbiBzZXR0aW5ncyAqL1xuZXhwb3J0IGNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFZpa3VuamFQbHVnaW5TZXR0aW5ncyA9IHtcbiAgYXBpVXJsOiBcIlwiLFxuICBhcGlUb2tlbjogXCJcIixcbiAgc3luY0ludGVydmFsU2Vjb25kczogMzAwLFxuICBzeW5jT25TYXZlOiB0cnVlLFxuICBkZWZhdWx0UHJvamVjdElkOiBudWxsLFxuICBzaG93UmliYm9uSWNvbjogdHJ1ZSxcbiAgc3luY0NvbXBsZXRlZFRhc2tzOiB0cnVlLFxuICBleGNsdWRlZEZvbGRlcnM6IFtdLFxuICBhdXRvQ3JlYXRlUHJvamVjdEZpbGVzOiB0cnVlLFxuICBwcm9qZWN0c0ZvbGRlcjogXCJWaWt1bmphXCIsXG59O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgU3luYyBTdGF0ZSBUeXBlcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuLyoqIFJlc3VsdCBvZiBhIHN5bmMgb3BlcmF0aW9uICovXG5leHBvcnQgaW50ZXJmYWNlIFN5bmNSZXN1bHQge1xuICBjcmVhdGVkOiBudW1iZXI7XG4gIHVwZGF0ZWQ6IG51bWJlcjtcbiAgY29tcGxldGVkOiBudW1iZXI7XG4gIGVycm9yczogc3RyaW5nW107XG4gIHRpbWVzdGFtcDogRGF0ZTtcbn1cblxuLyoqIE1hcHMgYSBWaWt1bmphIHRhc2sgSUQgdG8gaXRzIGxvY2F0aW9uIGluIHRoZSB2YXVsdCAqL1xuZXhwb3J0IGludGVyZmFjZSBUYXNrTG9jYXRpb24ge1xuICBmaWxlUGF0aDogc3RyaW5nO1xuICBsaW5lTnVtYmVyOiBudW1iZXI7XG4gIHZpa3VuamFJZDogbnVtYmVyO1xufVxuXG4vKiogVGhlIG51bGwgZGF0ZSBWaWt1bmphIHVzZXMgd2hlbiBubyBkYXRlIGlzIHNldCAqL1xuZXhwb3J0IGNvbnN0IFZJS1VOSkFfTlVMTF9EQVRFID0gXCIwMDAxLTAxLTAxVDAwOjAwOjAwWlwiO1xuXG4vKiogUHJpb3JpdHkgbWFwcGluZ3MgYmV0d2VlbiBPYnNpZGlhbiBlbW9qaSBzeW50YXggYW5kIFZpa3VuamEgcHJpb3JpdHkgbnVtYmVycyAqL1xuZXhwb3J0IGNvbnN0IFBSSU9SSVRZX01BUDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHtcbiAgXCJcdUQ4M0RcdUREM0FcIjogNSwgLy8gSGlnaGVzdFxuICBcIlx1MjNFQlwiOiA0LCAvLyBIaWdoXG4gIFwiXHVEODNEXHVERDNDXCI6IDMsIC8vIE1lZGl1bVxuICBcIlx1RDgzRFx1REQzRFwiOiAyLCAvLyBMb3dcbiAgXCJcdTIzRUNcIjogMSwgLy8gTG93ZXN0XG59O1xuXG5leHBvcnQgY29uc3QgUFJJT1JJVFlfTUFQX1JFVkVSU0U6IFJlY29yZDxudW1iZXIsIHN0cmluZz4gPSB7XG4gIDU6IFwiXHVEODNEXHVERDNBXCIsXG4gIDQ6IFwiXHUyM0VCXCIsXG4gIDM6IFwiXHVEODNEXHVERDNDXCIsXG4gIDI6IFwiXHVEODNEXHVERDNEXCIsXG4gIDE6IFwiXHUyM0VDXCIsXG59O1xuIiwgIi8qKlxuICogQGZpbGUgc3luYy9UYXNrUGFyc2VyLnRzXG4gKiBAZGVzY3JpcHRpb24gUGFyc2VzIE9ic2lkaWFuIG1hcmtkb3duIHRhc2sgc3ludGF4IGludG8gc3RydWN0dXJlZCBPYnNpZGlhblRhc2sgb2JqZWN0cyxcbiAqIGFuZCBzZXJpYWxpc2VzIHRoZW0gYmFjayB0byBtYXJrZG93bi5cbiAqXG4gKiBTdXBwb3J0ZWQgc3ludGF4IChvd24gKyBPYnNpZGlhbiBUYXNrcyBwbHVnaW4gY29tcGF0aWJsZSk6XG4gKiAgIC0gWyBdIFRhc2sgdGl0bGUgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjE5MiBpbmNvbXBsZXRlIHRhc2tcbiAqICAgLSBbeF0gVGFzayB0aXRsZSAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyMTkyIGNvbXBsZXRlIHRhc2tcbiAqICAgLSBbIF0gVGFzayB0aXRsZSBcdUQ4M0RcdURDQzUgMjAyNi0wNC0yMCAgICAgICAgICAgIFx1MjE5MiBkdWUgZGF0ZVxuICogICAtIFsgXSBUYXNrIHRpdGxlIFx1RDgzRFx1REVFQiAyMDI2LTA0LTIwICAgICAgICAgICAgXHUyMTkyIHN0YXJ0IGRhdGVcbiAqICAgLSBbIF0gVGFzayB0aXRsZSBcdTIzRjMgMjAyNi0wNC0yMCAgICAgICAgICAgIFx1MjE5MiBzY2hlZHVsZWQgZGF0ZVxuICogICAtIFsgXSBUYXNrIHRpdGxlIFx1RDgzRFx1REQwMSBldmVyeSB3ZWVrICAgICAgICAgICAgXHUyMTkyIHJlY3VycmVuY2UgXHUyMTkyIFZpa3VuamEgcmVwZWF0X2FmdGVyXG4gKiAgIC0gWyBdIFRhc2sgdGl0bGUgXHVEODNEXHVERDNBICAgICAgICAgICAgICAgICAgICAgICBcdTIxOTIgaGlnaGVzdCBwcmlvcml0eVxuICogICAtIFsgXSBUYXNrIHRpdGxlIFx1MjNFQiAgICAgICAgICAgICAgICAgICAgICAgXHUyMTkyIGhpZ2ggcHJpb3JpdHlcbiAqICAgLSBbIF0gVGFzayB0aXRsZSBcdUQ4M0RcdUREM0MgICAgICAgICAgICAgICAgICAgICAgIFx1MjE5MiBtZWRpdW0gcHJpb3JpdHlcbiAqICAgLSBbIF0gVGFzayB0aXRsZSBcdUQ4M0RcdUREM0QgICAgICAgICAgICAgICAgICAgICAgIFx1MjE5MiBsb3cgcHJpb3JpdHlcbiAqICAgLSBbIF0gVGFzayB0aXRsZSBAcHJvamVjdDpXb3JrIFRhc2tzICAgICAgXHUyMTkyIGlubGluZSBwcm9qZWN0IG92ZXJyaWRlXG4gKiAgIC0gWyBdIFRhc2sgdGl0bGUgPCEtLXZpa3VuamE6NDItLT4gICAgICAgIFx1MjE5MiBzeW5jZWQgdGFzayB3aXRoIFZpa3VuamEgSUQgNDJcbiAqXG4gKiBUb2tlbnMgZnJvbSB0aGUgT2JzaWRpYW4gVGFza3MgcGx1Z2luIHRoYXQgYXJlIHN0cmlwcGVkIGJ1dCBub3QgbWFwcGVkIHRvIFZpa3VuamE6XG4gKiAgIFx1Mjc5NSBZWVlZLU1NLUREICAgY3JlYXRlZCBkYXRlXG4gKiAgIFx1MjcwNSBZWVlZLU1NLUREICAgY29tcGxldGlvbiBkYXRlXG4gKiAgIFx1Mjc0QyBZWVlZLU1NLUREICAgY2FuY2VsbGVkIGRhdGVcbiAqICAgXHVEODNDXHVERDk0IDxpZD4gICAgICAgICBUYXNrcyBwbHVnaW4gdGFzayBJRFxuICogICBcdTI2RDQgPGlkPiAgICAgICAgIGJsb2NrZWQtYnkgZGVwZW5kZW5jeVxuICogICBcdUQ4M0NcdURGQzEgPHRleHQ+ICAgICAgIG9uLWNvbXBsZXRpb24gYWN0aW9uXG4gKi9cblxuaW1wb3J0IHR5cGUgeyBPYnNpZGlhblRhc2sgfSBmcm9tIFwiLi4vdHlwZXNcIjtcbmltcG9ydCB7IFBSSU9SSVRZX01BUCwgUFJJT1JJVFlfTUFQX1JFVkVSU0UgfSBmcm9tIFwiLi4vdHlwZXNcIjtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFJlZ2V4IFBhdHRlcm5zIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4vKiogTWF0Y2hlcyBhIG1hcmtkb3duIHRhc2sgbGluZTogYC0gWyBdIC4uLmAgb3IgYC0gW3hdIC4uLmAgb3IgYCogWyBdIC4uLmAgKi9cbmNvbnN0IFRBU0tfTElORV9SRUdFWCA9IC9eKFxccyopWy0qXVxccytcXFsoW3ggXSlcXF1cXHMrKC4rKSQvaTtcblxuLyoqIE1hdGNoZXMgdGhlIFZpa3VuamEgSUQgY29tbWVudDogYDwhLS12aWt1bmphOjQyLS0+YCAqL1xuY29uc3QgVklLVU5KQV9JRF9SRUdFWCA9IC88IS0tdmlrdW5qYTooXFxkKyktLT4vO1xuXG4vKiogTWF0Y2hlcyBkdWUgZGF0ZTogYFx1RDgzRFx1RENDNSAyMDI2LTA0LTIwYCAqL1xuY29uc3QgRFVFX0RBVEVfUkVHRVggPSAvXHVEODNEXHVEQ0M1XFxzKihcXGR7NH0tXFxkezJ9LVxcZHsyfSkvO1xuXG4vKiogTWF0Y2hlcyBzdGFydCBkYXRlOiBgXHVEODNEXHVERUVCIDIwMjYtMDQtMjBgICovXG5jb25zdCBTVEFSVF9EQVRFX1JFR0VYID0gL1x1RDgzRFx1REVFQlxccyooXFxkezR9LVxcZHsyfS1cXGR7Mn0pLztcblxuLyoqIE1hdGNoZXMgc2NoZWR1bGVkIGRhdGU6IGBcdTIzRjMgMjAyNi0wNC0yMGAgKi9cbmNvbnN0IFNDSEVEVUxFRF9EQVRFX1JFR0VYID0gL1x1MjNGM1xccyooXFxkezR9LVxcZHsyfS1cXGR7Mn0pLztcblxuLyoqXG4gKiBDYXB0dXJlcyByZWN1cnJlbmNlIHRleHQgYWZ0ZXIgXHVEODNEXHVERDAxLCBzdG9wcGluZyBhdCB0aGUgbmV4dCBtZXRhZGF0YSBlbW9qaS5cbiAqIGUuZy4gYFx1RDgzRFx1REQwMSBldmVyeSB3ZWVrYCBcdTIxOTIgY2FwdHVyZXMgXCJldmVyeSB3ZWVrXCJcbiAqL1xuY29uc3QgUkVDVVJSRU5DRV9FWFRSQUNUX1JFR0VYID0gL1x1RDgzRFx1REQwMVxccyooW15cdUQ4M0RcdUREM0FcdTIzRUJcdUQ4M0RcdUREM0NcdUQ4M0RcdUREM0RcdTIzRUNcdUQ4M0RcdURDQzVcdUQ4M0RcdURFRUJcdTIzRjNcdTI3OTVcdTI3MDVcdTI3NENcdUQ4M0NcdUREOTRcdTI2RDRcdUQ4M0NcdURGQzFAPF0rKS87XG5cbi8qKlxuICogTWF0Y2hlcyBhbiBpbmxpbmUgcHJvamVjdCBvdmVycmlkZTogYEBwcm9qZWN0OldvcmsgVGFza3NgXG4gKiBTdG9wcyBhdCB0aGUgbmV4dCBtZXRhZGF0YSBtYXJrZXIgc28gbXVsdGktd29yZCBuYW1lcyB3b3JrIHdpdGhvdXQgcXVvdGVzLlxuICovXG5jb25zdCBQUk9KRUNUX09WRVJSSURFX1JFR0VYID0gL0Bwcm9qZWN0OihbXkA8XHVEODNEXHVEQ0M1XHVEODNEXHVERUVCXHUyM0YzXHVEODNEXHVERDNBXHUyM0VCXHVEODNEXHVERDNDXHVEODNEXHVERDNEXHUyM0VDXHUyNzk1XHUyNzA1XHUyNzRDXHVEODNDXHVERDk0XHUyNkQ0XHVEODNDXHVERkMxXSspLztcblxuLyoqIEFsbCBwcmlvcml0eSBlbW9qaXMgKi9cbmNvbnN0IFBSSU9SSVRZX0VNT0pJUyA9IE9iamVjdC5rZXlzKFBSSU9SSVRZX01BUCk7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBTdHJpcC1vbmx5IHBhdHRlcm5zICh0b2tlbnMgd2UgZG9uJ3QgbWFwIHRvIFZpa3VuamEpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4vKiogYFx1RDgzRFx1RENDNSAvIFx1RDgzRFx1REVFQiAvIFx1MjNGM2AgKyBkYXRlIFx1MjAxNCBoYW5kbGVkIHNlcGFyYXRlbHkgYnV0IGxpc3RlZCBoZXJlIGZvciByZWZlcmVuY2UgKi9cbmNvbnN0IERBVEVfU1RSSVBfUkVHRVggPSAvW1x1RDgzRFx1RENDNVx1RDgzRFx1REVFQlx1MjNGM11cXHMqXFxkezR9LVxcZHsyfS1cXGR7Mn0vZztcblxuLyoqIGBcdUQ4M0RcdUREMDEgZXZlcnkgLi4uYCBcdTIwMTQgZnVsbCByZWN1cnJlbmNlIHRva2VuICovXG5jb25zdCBSRUNVUlJFTkNFX1NUUklQX1JFR0VYID0gL1x1RDgzRFx1REQwMVxccypbXlx1RDgzRFx1REQzQVx1MjNFQlx1RDgzRFx1REQzQ1x1RDgzRFx1REQzRFx1MjNFQ1x1RDgzRFx1RENDNVx1RDgzRFx1REVFQlx1MjNGM1x1Mjc5NVx1MjcwNVx1Mjc0Q1x1RDgzQ1x1REQ5NFx1MjZENFx1RDgzQ1x1REZDMUA8XSovZztcblxuLyoqIGBcdTI3OTUgWVlZWS1NTS1ERGAgXHUyMDE0IGNyZWF0ZWQgZGF0ZSAoVGFza3MgcGx1Z2luKSAqL1xuY29uc3QgQ1JFQVRFRF9EQVRFX1NUUklQX1JFR0VYID0gL1x1Mjc5NVxccypcXGR7NH0tXFxkezJ9LVxcZHsyfS9nO1xuXG4vKiogYFx1MjcwNSBZWVlZLU1NLUREYCBcdTIwMTQgY29tcGxldGlvbiBkYXRlIChUYXNrcyBwbHVnaW4pICovXG5jb25zdCBET05FX0RBVEVfU1RSSVBfUkVHRVggPSAvXHUyNzA1XFxzKlxcZHs0fS1cXGR7Mn0tXFxkezJ9L2c7XG5cbi8qKiBgXHUyNzRDIFlZWVktTU0tRERgIFx1MjAxNCBjYW5jZWxsZWQgZGF0ZSAoVGFza3MgcGx1Z2luKSAqL1xuY29uc3QgQ0FOQ0VMTEVEX0RBVEVfU1RSSVBfUkVHRVggPSAvXHUyNzRDXFxzKlxcZHs0fS1cXGR7Mn0tXFxkezJ9L2c7XG5cbi8qKiBgXHVEODNDXHVERDk0IDx3b3JkPmAgXHUyMDE0IFRhc2tzIHBsdWdpbiBpbnRlcm5hbCB0YXNrIElEICovXG5jb25zdCBUQVNLX0lEX1NUUklQX1JFR0VYID0gL1x1RDgzQ1x1REQ5NFxccypcXFMqL2c7XG5cbi8qKiBgXHUyNkQ0IDx3b3JkPmAgXHUyMDE0IGJsb2NrZWQtYnkgZGVwZW5kZW5jeSAoVGFza3MgcGx1Z2luKSAqL1xuY29uc3QgQkxPQ0tFRF9CWV9TVFJJUF9SRUdFWCA9IC9cdTI2RDRcXHMqXFxTKi9nO1xuXG4vKiogYFx1RDgzQ1x1REZDMSA8d29yZD5gIFx1MjAxNCBvbi1jb21wbGV0aW9uIGFjdGlvbiAoVGFza3MgcGx1Z2luKSAqL1xuY29uc3QgRklOSVNIX09OX1NUUklQX1JFR0VYID0gL1x1RDgzQ1x1REZDMVxccypcXFMqL2c7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBQYXJzZXIgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmV4cG9ydCBjbGFzcyBUYXNrUGFyc2VyIHtcbiAgLyoqXG4gICAqIFBhcnNlIGFsbCB0YXNrIGxpbmVzIGZyb20gYSBtYXJrZG93biBmaWxlJ3MgY29udGVudC5cbiAgICovXG4gIHN0YXRpYyBwYXJzZUZpbGUoY29udGVudDogc3RyaW5nLCBmaWxlUGF0aDogc3RyaW5nKTogT2JzaWRpYW5UYXNrW10ge1xuICAgIHJldHVybiBjb250ZW50XG4gICAgICAuc3BsaXQoXCJcXG5cIilcbiAgICAgIC5tYXAoKGxpbmUsIGkpID0+IFRhc2tQYXJzZXIucGFyc2VMaW5lKGxpbmUsIGksIGZpbGVQYXRoKSlcbiAgICAgIC5maWx0ZXIoKHQpOiB0IGlzIE9ic2lkaWFuVGFzayA9PiB0ICE9PSBudWxsKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQYXJzZSBhIHNpbmdsZSBsaW5lIGludG8gYW4gT2JzaWRpYW5UYXNrLCBvciByZXR1cm4gbnVsbCBpZiBub3QgYSB0YXNrLlxuICAgKi9cbiAgc3RhdGljIHBhcnNlTGluZShcbiAgICBsaW5lOiBzdHJpbmcsXG4gICAgbGluZU51bWJlcjogbnVtYmVyLFxuICAgIGZpbGVQYXRoOiBzdHJpbmdcbiAgKTogT2JzaWRpYW5UYXNrIHwgbnVsbCB7XG4gICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKFRBU0tfTElORV9SRUdFWCk7XG4gICAgaWYgKCFtYXRjaCkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBbLCAsIGNoZWNrbWFyaywgcmF3Q29udGVudF0gPSBtYXRjaDtcbiAgICBjb25zdCBkb25lID0gY2hlY2ttYXJrLnRvTG93ZXJDYXNlKCkgPT09IFwieFwiO1xuXG4gICAgLy8gVmlrdW5qYSB0cmFja2luZyBJRFxuICAgIGNvbnN0IHZpa3VuamFNYXRjaCA9IHJhd0NvbnRlbnQubWF0Y2goVklLVU5KQV9JRF9SRUdFWCk7XG4gICAgY29uc3QgdmlrdW5qYUlkID0gdmlrdW5qYU1hdGNoID8gcGFyc2VJbnQodmlrdW5qYU1hdGNoWzFdLCAxMCkgOiBudWxsO1xuXG4gICAgLy8gRGF0ZXNcbiAgICBjb25zdCBkdWVEYXRlTWF0Y2ggPSByYXdDb250ZW50Lm1hdGNoKERVRV9EQVRFX1JFR0VYKTtcbiAgICBjb25zdCBzdGFydERhdGVNYXRjaCA9IHJhd0NvbnRlbnQubWF0Y2goU1RBUlRfREFURV9SRUdFWCk7XG4gICAgY29uc3Qgc2NoZWR1bGVkRGF0ZU1hdGNoID0gcmF3Q29udGVudC5tYXRjaChTQ0hFRFVMRURfREFURV9SRUdFWCk7XG5cbiAgICAvLyBQcmlvcml0eVxuICAgIGxldCBwcmlvcml0eSA9IDA7XG4gICAgZm9yIChjb25zdCBbZW1vamksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhQUklPUklUWV9NQVApKSB7XG4gICAgICBpZiAocmF3Q29udGVudC5pbmNsdWRlcyhlbW9qaSkpIHtcbiAgICAgICAgcHJpb3JpdHkgPSB2YWx1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVjdXJyZW5jZSAoYFx1RDgzRFx1REQwMSBldmVyeSB3ZWVrYCBldGMuKVxuICAgIGNvbnN0IHJlY3VycmVuY2VNYXRjaCA9IHJhd0NvbnRlbnQubWF0Y2goUkVDVVJSRU5DRV9FWFRSQUNUX1JFR0VYKTtcbiAgICBjb25zdCByZWN1cnJlbmNlID0gcmVjdXJyZW5jZU1hdGNoID8gcmVjdXJyZW5jZU1hdGNoWzFdLnRyaW0oKSA6IG51bGw7XG5cbiAgICAvLyBJbmxpbmUgcHJvamVjdCBvdmVycmlkZSAoYEBwcm9qZWN0Ok5hbWVgKVxuICAgIGNvbnN0IHByb2plY3RNYXRjaCA9IHJhd0NvbnRlbnQubWF0Y2goUFJPSkVDVF9PVkVSUklERV9SRUdFWCk7XG4gICAgY29uc3QgcHJvamVjdE5hbWUgPSBwcm9qZWN0TWF0Y2ggPyBwcm9qZWN0TWF0Y2hbMV0udHJpbSgpIDogbnVsbDtcblxuICAgIGNvbnN0IHRpdGxlID0gVGFza1BhcnNlci5jbGVhblRpdGxlKHJhd0NvbnRlbnQpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJhd0xpbmU6IGxpbmUsXG4gICAgICBsaW5lTnVtYmVyLFxuICAgICAgZmlsZVBhdGgsXG4gICAgICB0aXRsZSxcbiAgICAgIGRvbmUsXG4gICAgICBkdWVEYXRlOiBkdWVEYXRlTWF0Y2ggPyBkdWVEYXRlTWF0Y2hbMV0gOiBudWxsLFxuICAgICAgc3RhcnREYXRlOiBzdGFydERhdGVNYXRjaCA/IHN0YXJ0RGF0ZU1hdGNoWzFdIDogbnVsbCxcbiAgICAgIHNjaGVkdWxlZERhdGU6IHNjaGVkdWxlZERhdGVNYXRjaCA/IHNjaGVkdWxlZERhdGVNYXRjaFsxXSA6IG51bGwsXG4gICAgICBwcmlvcml0eSxcbiAgICAgIHJlY3VycmVuY2UsXG4gICAgICB2aWt1bmphSWQsXG4gICAgICBwcm9qZWN0SWQ6IG51bGwsXG4gICAgICBwcm9qZWN0TmFtZSxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFN0cmlwIGFsbCBtZXRhZGF0YSB0b2tlbnMgZnJvbSBhIHRhc2sgdGl0bGUsIGxlYXZpbmcgb25seSBodW1hbi1yZWFkYWJsZSB0ZXh0LlxuICAgKlxuICAgKiBTdHJpcHM6XG4gICAqIC0gT3VyIG93biB0b2tlbnM6IGRhdGVzLCBwcmlvcml0eSwgQHByb2plY3Q6LCA8IS0tdmlrdW5qYTotLT4sIFx1RDgzRFx1REQwMSByZWN1cnJlbmNlXG4gICAqIC0gT2JzaWRpYW4gVGFza3MgcGx1Z2luIHRva2VuczogXHUyNzk1IFx1MjcwNSBcdTI3NEMgXHVEODNDXHVERDk0IFx1MjZENCBcdUQ4M0NcdURGQzFcbiAgICovXG4gIHN0YXRpYyBjbGVhblRpdGxlKHJhdzogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBsZXQgdCA9IHJhdztcblxuICAgIC8vIE91ciBvd24gdG9rZW5zXG4gICAgdCA9IHQucmVwbGFjZShWSUtVTkpBX0lEX1JFR0VYLCBcIlwiKTtcbiAgICB0ID0gdC5yZXBsYWNlKERBVEVfU1RSSVBfUkVHRVgsIFwiXCIpO1xuICAgIHQgPSB0LnJlcGxhY2UoUkVDVVJSRU5DRV9TVFJJUF9SRUdFWCwgXCJcIik7XG4gICAgdCA9IHQucmVwbGFjZShQUk9KRUNUX09WRVJSSURFX1JFR0VYLCBcIlwiKTtcbiAgICBmb3IgKGNvbnN0IGVtb2ppIG9mIFBSSU9SSVRZX0VNT0pJUykgdCA9IHQucmVwbGFjZShlbW9qaSwgXCJcIik7XG5cbiAgICAvLyBUYXNrcyBwbHVnaW4gdG9rZW5zIChzdHJpcC1vbmx5IFx1MjAxNCBub3QgbWFwcGVkIHRvIFZpa3VuamEpXG4gICAgdCA9IHQucmVwbGFjZShDUkVBVEVEX0RBVEVfU1RSSVBfUkVHRVgsIFwiXCIpO1xuICAgIHQgPSB0LnJlcGxhY2UoRE9ORV9EQVRFX1NUUklQX1JFR0VYLCBcIlwiKTtcbiAgICB0ID0gdC5yZXBsYWNlKENBTkNFTExFRF9EQVRFX1NUUklQX1JFR0VYLCBcIlwiKTtcbiAgICB0ID0gdC5yZXBsYWNlKFRBU0tfSURfU1RSSVBfUkVHRVgsIFwiXCIpO1xuICAgIHQgPSB0LnJlcGxhY2UoQkxPQ0tFRF9CWV9TVFJJUF9SRUdFWCwgXCJcIik7XG4gICAgdCA9IHQucmVwbGFjZShGSU5JU0hfT05fU1RSSVBfUkVHRVgsIFwiXCIpO1xuXG4gICAgcmV0dXJuIHQudHJpbSgpLnJlcGxhY2UoL1xccysvZywgXCIgXCIpO1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFNlcmlhbGlzYXRpb24gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgLyoqXG4gICAqIFNlcmlhbGlzZSBhbiBPYnNpZGlhblRhc2sgYmFjayB0byBhIG1hcmtkb3duIGxpbmUuXG4gICAqIFByZXNlcnZlcyB0aGUgb3JpZ2luYWwgaW5kZW50YXRpb24gZnJvbSByYXdMaW5lLlxuICAgKi9cbiAgc3RhdGljIHNlcmlhbGlzZSh0YXNrOiBPYnNpZGlhblRhc2spOiBzdHJpbmcge1xuICAgIGNvbnN0IGluZGVudE1hdGNoID0gdGFzay5yYXdMaW5lLm1hdGNoKC9eKFxccyopLyk7XG4gICAgY29uc3QgaW5kZW50ID0gaW5kZW50TWF0Y2ggPyBpbmRlbnRNYXRjaFsxXSA6IFwiXCI7XG5cbiAgICBjb25zdCBjaGVja21hcmsgPSB0YXNrLmRvbmUgPyBcInhcIiA6IFwiIFwiO1xuICAgIGxldCBsaW5lID0gYCR7aW5kZW50fS0gWyR7Y2hlY2ttYXJrfV0gJHt0YXNrLnRpdGxlfWA7XG5cbiAgICAvLyBJbmxpbmUgcHJvamVjdCBvdmVycmlkZSBcdTIwMTQga2VwdCBzbyByb3V0aW5nIHN1cnZpdmVzIHJvdW5kLXRyaXBzXG4gICAgaWYgKHRhc2sucHJvamVjdE5hbWUpIGxpbmUgKz0gYCBAcHJvamVjdDoke3Rhc2sucHJvamVjdE5hbWV9YDtcblxuICAgIC8vIFJlY3VycmVuY2VcbiAgICBpZiAodGFzay5yZWN1cnJlbmNlKSBsaW5lICs9IGAgXHVEODNEXHVERDAxICR7dGFzay5yZWN1cnJlbmNlfWA7XG5cbiAgICAvLyBQcmlvcml0eVxuICAgIGlmICh0YXNrLnByaW9yaXR5ID4gMCAmJiBQUklPUklUWV9NQVBfUkVWRVJTRVt0YXNrLnByaW9yaXR5XSkge1xuICAgICAgbGluZSArPSBgICR7UFJJT1JJVFlfTUFQX1JFVkVSU0VbdGFzay5wcmlvcml0eV19YDtcbiAgICB9XG5cbiAgICAvLyBEYXRlc1xuICAgIGlmICh0YXNrLnN0YXJ0RGF0ZSkgICAgIGxpbmUgKz0gYCBcdUQ4M0RcdURFRUIgJHt0YXNrLnN0YXJ0RGF0ZX1gO1xuICAgIGlmICh0YXNrLnNjaGVkdWxlZERhdGUpIGxpbmUgKz0gYCBcdTIzRjMgJHt0YXNrLnNjaGVkdWxlZERhdGV9YDtcbiAgICBpZiAodGFzay5kdWVEYXRlKSAgICAgICBsaW5lICs9IGAgXHVEODNEXHVEQ0M1ICR7dGFzay5kdWVEYXRlfWA7XG5cbiAgICAvLyBWaWt1bmphIHRyYWNraW5nIElEXG4gICAgaWYgKHRhc2sudmlrdW5qYUlkICE9PSBudWxsKSBsaW5lICs9IGAgPCEtLXZpa3VuamE6JHt0YXNrLnZpa3VuamFJZH0tLT5gO1xuXG4gICAgcmV0dXJuIGxpbmU7XG4gIH1cblxuICAvKipcbiAgICogUmVwbGFjZSBhIHNwZWNpZmljIGxpbmUgaW4gZmlsZSBjb250ZW50IHdpdGggYSBuZXcgdGFzayBzZXJpYWxpc2F0aW9uLlxuICAgKi9cbiAgc3RhdGljIHJlcGxhY2VMaW5lKGNvbnRlbnQ6IHN0cmluZywgbGluZU51bWJlcjogbnVtYmVyLCBuZXdMaW5lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdChcIlxcblwiKTtcbiAgICBsaW5lc1tsaW5lTnVtYmVyXSA9IG5ld0xpbmU7XG4gICAgcmV0dXJuIGxpbmVzLmpvaW4oXCJcXG5cIik7XG4gIH1cblxuICAvKiogUXVpY2sgY2hlY2sgXHUyMDE0IGRvZXMgdGhpcyBsaW5lIGxvb2sgbGlrZSBhIHRhc2s/ICovXG4gIHN0YXRpYyBpc1Rhc2tMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBUQVNLX0xJTkVfUkVHRVgudGVzdChsaW5lKTtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBSZWN1cnJlbmNlIGhlbHBlcnMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgLyoqXG4gICAqIENvbnZlcnQgYSByZWN1cnJlbmNlIHN0cmluZyAoZS5nLiBcImV2ZXJ5IHdlZWtcIikgdG8gc2Vjb25kcyBmb3IgVmlrdW5qYSdzXG4gICAqIGByZXBlYXRfYWZ0ZXJgIGZpZWxkLiBSZXR1cm5zIHVuZGVmaW5lZCBpZiB0aGUgcGF0dGVybiBpcyBub3QgcmVjb2duaXNlZC5cbiAgICpcbiAgICogU3VwcG9ydHM6XG4gICAqICAgZXZlcnkgZGF5IC8gZGFpbHlcbiAgICogICBldmVyeSB3ZWVrIC8gd2Vla2x5XG4gICAqICAgZXZlcnkgbW9udGggLyBtb250aGx5XG4gICAqICAgZXZlcnkgeWVhciAvIHllYXJseVxuICAgKiAgIGV2ZXJ5IG90aGVyIGRheVxuICAgKiAgIGV2ZXJ5IE4gZGF5cyAvIHdlZWtzIC8gbW9udGhzIC8geWVhcnNcbiAgICovXG4gIHN0YXRpYyBwYXJzZVJlcGVhdEFmdGVyKHJlY3VycmVuY2U6IHN0cmluZyB8IG51bGwpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuICAgIGlmICghcmVjdXJyZW5jZSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICBjb25zdCByID0gcmVjdXJyZW5jZS50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcblxuICAgIGNvbnN0IFNFQ09ORCA9IDE7XG4gICAgY29uc3QgREFZICAgID0gODZfNDAwICogU0VDT05EO1xuICAgIGNvbnN0IFdFRUsgICA9IDcgICogREFZO1xuICAgIGNvbnN0IE1PTlRIICA9IDMwICogREFZO1xuICAgIGNvbnN0IFlFQVIgICA9IDM2NSAqIERBWTtcblxuICAgIGlmIChyID09PSBcImV2ZXJ5IGRheVwiICAgfHwgciA9PT0gXCJkYWlseVwiKSAgIHJldHVybiBEQVk7XG4gICAgaWYgKHIgPT09IFwiZXZlcnkgd2Vla1wiICB8fCByID09PSBcIndlZWtseVwiKSAgcmV0dXJuIFdFRUs7XG4gICAgaWYgKHIgPT09IFwiZXZlcnkgbW9udGhcIiB8fCByID09PSBcIm1vbnRobHlcIikgcmV0dXJuIE1PTlRIO1xuICAgIGlmIChyID09PSBcImV2ZXJ5IHllYXJcIiAgfHwgciA9PT0gXCJ5ZWFybHlcIikgIHJldHVybiBZRUFSO1xuICAgIGlmIChyID09PSBcImV2ZXJ5IG90aGVyIGRheVwiKSAgICAgICAgICAgICAgICByZXR1cm4gMiAqIERBWTtcblxuICAgIGNvbnN0IG0gPSByLm1hdGNoKC9eZXZlcnkgKFxcZCspIChkYXl8d2Vla3xtb250aHx5ZWFyKXM/JC8pO1xuICAgIGlmIChtKSB7XG4gICAgICBjb25zdCBuID0gcGFyc2VJbnQobVsxXSwgMTApO1xuICAgICAgY29uc3QgdW5pdHM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7IGRheTogREFZLCB3ZWVrOiBXRUVLLCBtb250aDogTU9OVEgsIHllYXI6IFlFQVIgfTtcbiAgICAgIHJldHVybiBuICogdW5pdHNbbVsyXV07XG4gICAgfVxuXG4gICAgcmV0dXJuIHVuZGVmaW5lZDsgLy8gUGF0dGVybiBub3QgcmVjb2duaXNlZCBcdTIwMTQgd2UnbGwgc2tpcCByZXBlYXRfYWZ0ZXJcbiAgfVxuXG4gIC8qKlxuICAgKiBDb252ZXJ0IFZpa3VuamEncyBgcmVwZWF0X2FmdGVyYCAoc2Vjb25kcykgYmFjayB0byBhIGh1bWFuLXJlYWRhYmxlXG4gICAqIHJlY3VycmVuY2Ugc3RyaW5nIGZvciBkaXNwbGF5IGluIE9ic2lkaWFuLlxuICAgKiBSZXR1cm5zIG51bGwgd2hlbiByZXBlYXRfYWZ0ZXIgaXMgMCAobm8gcmVjdXJyZW5jZSkuXG4gICAqL1xuICBzdGF0aWMgZm9ybWF0UmVwZWF0QWZ0ZXIoc2Vjb25kczogbnVtYmVyKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgaWYgKCFzZWNvbmRzIHx8IHNlY29uZHMgPD0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBEQVkgICA9IDg2XzQwMDtcbiAgICBjb25zdCBXRUVLICA9IDcgICogREFZO1xuICAgIGNvbnN0IE1PTlRIID0gMzAgKiBEQVk7XG4gICAgY29uc3QgWUVBUiAgPSAzNjUgKiBEQVk7XG5cbiAgICBpZiAoc2Vjb25kcyAlIFlFQVIgID09PSAwKSByZXR1cm4gc2Vjb25kcyA9PT0gWUVBUiAgPyBcImV2ZXJ5IHllYXJcIiAgOiBgZXZlcnkgJHtzZWNvbmRzIC8gWUVBUn0geWVhcnNgO1xuICAgIGlmIChzZWNvbmRzICUgTU9OVEggPT09IDApIHJldHVybiBzZWNvbmRzID09PSBNT05USCA/IFwiZXZlcnkgbW9udGhcIiA6IGBldmVyeSAke3NlY29uZHMgLyBNT05USH0gbW9udGhzYDtcbiAgICBpZiAoc2Vjb25kcyAlIFdFRUsgID09PSAwKSByZXR1cm4gc2Vjb25kcyA9PT0gV0VFSyAgPyBcImV2ZXJ5IHdlZWtcIiAgOiBgZXZlcnkgJHtzZWNvbmRzIC8gV0VFS30gd2Vla3NgO1xuICAgIGlmIChzZWNvbmRzICUgREFZICAgPT09IDApIHJldHVybiBzZWNvbmRzID09PSBEQVkgICA/IFwiZXZlcnkgZGF5XCIgICA6IGBldmVyeSAke3NlY29uZHMgLyBEQVl9IGRheXNgO1xuXG4gICAgLy8gRmFsbCBiYWNrIHRvIGRheXMgKHJvdW5kZWQpIGZvciBpcnJlZ3VsYXIgdmFsdWVzXG4gICAgY29uc3QgZGF5cyA9IE1hdGgucm91bmQoc2Vjb25kcyAvIERBWSk7XG4gICAgcmV0dXJuIGRheXMgPT09IDEgPyBcImV2ZXJ5IGRheVwiIDogYGV2ZXJ5ICR7ZGF5c30gZGF5c2A7XG4gIH1cbn1cbiIsICIvKipcbiAqIEBmaWxlIHN5bmMvU3luY0VuZ2luZS50c1xuICogQGRlc2NyaXB0aW9uIE9yY2hlc3RyYXRlcyBiaWRpcmVjdGlvbmFsIHN5bmMgYmV0d2VlbiBPYnNpZGlhbiB2YXVsdCB0YXNrc1xuICogYW5kIFZpa3VuamEuXG4gKlxuICogU3luYyBzdHJhdGVneTpcbiAqICAgLSBPYnNpZGlhbiBcdTIxOTIgVmlrdW5qYTogdGFza3Mgd2l0aG91dCBhIHZpa3VuamFJZCBhcmUgY3JlYXRlZDsgdGFza3Mgd2l0aFxuICogICAgIGEgdmlrdW5qYUlkIGFyZSB1cGRhdGVkIGlmIHRoZWlyIGNvbnRlbnQgaGFzIGNoYW5nZWQuXG4gKiAgIC0gVmlrdW5qYSBcdTIxOTIgT2JzaWRpYW46IHRhc2tzIHVwZGF0ZWQgcmVtb3RlbHkgKGRvbmUgc3RhdHVzLCB0aXRsZSwgZGF0ZXMpXG4gKiAgICAgYXJlIHdyaXR0ZW4gYmFjayB0byB0aGUgdmF1bHQuXG4gKlxuICogQ29uZmxpY3QgcmVzb2x1dGlvbjpcbiAqICAgLSBMYXN0LXdyaXRlLXdpbnMgYmFzZWQgb24gdGhlIGB1cGRhdGVkYCB0aW1lc3RhbXAgZnJvbSBWaWt1bmphLlxuICogICAtIElmIE9ic2lkaWFuIGhhcyBjaGFuZ2VzIGFuZCBWaWt1bmphIGhhcyBjaGFuZ2VzIHNpbmNlIGxhc3Qgc3luYyxcbiAqICAgICBWaWt1bmphIHdpbnMgKGl0IGlzIHRoZSBzb3VyY2Ugb2YgdHJ1dGggZm9yIGNvbGxhYm9yYXRpb24pLlxuICpcbiAqIFRhc2sgaWRlbnRpdHk6XG4gKiAgIC0gRWFjaCBzeW5jZWQgdGFzayBjYXJyaWVzIGEgYDwhLS12aWt1bmphOklELS0+YCBIVE1MIGNvbW1lbnQgaW4gdGhlXG4gKiAgICAgbWFya2Rvd24gbGluZS4gVGhpcyBpcyB0aGUgcGVyc2lzdGVudCBsaW5rIGJldHdlZW4gdGhlIHR3byBzeXN0ZW1zLlxuICovXG5cbmltcG9ydCB0eXBlIHsgQXBwLCBURmlsZSB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHR5cGUgeyBWaWt1bmphQ2xpZW50IH0gZnJvbSBcIi4uL2FwaS9WaWt1bmphQ2xpZW50XCI7XG5pbXBvcnQgdHlwZSB7XG4gIFZpa3VuamFQbHVnaW5TZXR0aW5ncyxcbiAgT2JzaWRpYW5UYXNrLFxuICBTeW5jUmVzdWx0LFxuICBWaWt1bmphVGFzayxcbiAgVmlrdW5qYVByb2plY3QsXG59IGZyb20gXCIuLi90eXBlc1wiO1xuaW1wb3J0IHsgVklLVU5KQV9OVUxMX0RBVEUgfSBmcm9tIFwiLi4vdHlwZXNcIjtcbmltcG9ydCB7IFRhc2tQYXJzZXIgfSBmcm9tIFwiLi9UYXNrUGFyc2VyXCI7XG5cbmV4cG9ydCBjbGFzcyBTeW5jRW5naW5lIHtcbiAgcHJpdmF0ZSByZWFkb25seSBhcHA6IEFwcDtcbiAgcHJpdmF0ZSByZWFkb25seSBjbGllbnQ6IFZpa3VuamFDbGllbnQ7XG4gIHByaXZhdGUgcmVhZG9ubHkgc2V0dGluZ3M6IFZpa3VuamFQbHVnaW5TZXR0aW5ncztcblxuICAvKiogVHJhY2tzIHRoZSBsYXN0IHN5bmMgdGltZXN0YW1wIHRvIGRldGVjdCByZW1vdGUgY2hhbmdlcyAqL1xuICBwcml2YXRlIGxhc3RTeW5jVGltZTogRGF0ZSB8IG51bGwgPSBudWxsO1xuXG4gIC8qKlxuICAgKiBQcm9qZWN0IGxpc3QgY2FjaGUgXHUyMDE0IHBvcHVsYXRlZCBvbmNlIHBlciBzeW5jIHJ1biB0byBhdm9pZCByZXBlYXRlZCBBUEkgY2FsbHNcbiAgICogd2hlbiByZXNvbHZpbmcgcHJvamVjdCBuYW1lcyBmcm9tIGZyb250bWF0dGVyIGFjcm9zcyBtYW55IGZpbGVzLlxuICAgKi9cbiAgcHJpdmF0ZSBjYWNoZWRQcm9qZWN0czogVmlrdW5qYVByb2plY3RbXSB8IG51bGwgPSBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBjbGllbnQ6IFZpa3VuamFDbGllbnQsIHNldHRpbmdzOiBWaWt1bmphUGx1Z2luU2V0dGluZ3MpIHtcbiAgICB0aGlzLmFwcCA9IGFwcDtcbiAgICB0aGlzLmNsaWVudCA9IGNsaWVudDtcbiAgICB0aGlzLnNldHRpbmdzID0gc2V0dGluZ3M7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgUHVibGljIEFQSSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICAvKipcbiAgICogUnVuIGEgZnVsbCBiaWRpcmVjdGlvbmFsIHN5bmMuXG4gICAqIFRoaXMgaXMgdGhlIG1haW4gZW50cnkgcG9pbnQgY2FsbGVkIGJ5IHRoZSBwbHVnaW4gb24gc2F2ZSwgb24gc2NoZWR1bGUsXG4gICAqIG9yIG1hbnVhbGx5IGJ5IHRoZSB1c2VyLlxuICAgKlxuICAgKiBAcmV0dXJucyBTeW5jUmVzdWx0IHdpdGggY291bnRzIG9mIGNoYW5nZXMgbWFkZVxuICAgKi9cbiAgYXN5bmMgc3luYygpOiBQcm9taXNlPFN5bmNSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQ6IFN5bmNSZXN1bHQgPSB7XG4gICAgICBjcmVhdGVkOiAwLFxuICAgICAgdXBkYXRlZDogMCxcbiAgICAgIGNvbXBsZXRlZDogMCxcbiAgICAgIGVycm9yczogW10sXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCksXG4gICAgfTtcblxuICAgIC8vIFJlc2V0IHByb2plY3QgY2FjaGUgc28gd2UgZ2V0IGEgZnJlc2ggbGlzdCBmb3IgdGhpcyBydW5cbiAgICB0aGlzLmNhY2hlZFByb2plY3RzID0gbnVsbDtcblxuICAgIHRyeSB7XG4gICAgICAvLyBTdGVwIDE6IEVuc3VyZSBldmVyeSBWaWt1bmphIHByb2plY3QgaGFzIGEgbWFya2Rvd24gZmlsZSBpbiB0aGUgdmF1bHQuXG4gICAgICAvLyBSZXR1cm5zIGEgbWFwIG9mIG5ld2x5LWNyZWF0ZWQgZmlsZSBwYXRocyBcdTIxOTIgcHJvamVjdCBJRHMgc28gd2UgY2FuXG4gICAgICAvLyBpbXBvcnQgdGFza3MgaW50byB0aGVtIGltbWVkaWF0ZWx5LCBiZWZvcmUgT2JzaWRpYW4ncyBtZXRhZGF0YSBjYWNoZVxuICAgICAgLy8gaGFzIGhhZCBhIGNoYW5jZSB0byBpbmRleCB0aGVpciBmcm9udG1hdHRlci5cbiAgICAgIGNvbnN0IG5ld1Byb2plY3RGaWxlcyA9IGF3YWl0IHRoaXMuZW5zdXJlUHJvamVjdEZpbGVzKCk7XG5cbiAgICAgIC8vIFN0ZXAgMjogU2NhbiB0aGUgdmF1bHQgZm9yIGFsbCB0YXNrIGxpbmVzICsgY29sbGVjdCBmaWxlXHUyMTkycHJvamVjdCBiaW5kaW5nc1xuICAgICAgY29uc3QgeyB0YXNrczogb2JzaWRpYW5UYXNrcywgZmlsZVByb2plY3RNYXAgfSA9IGF3YWl0IHRoaXMuc2NhblZhdWx0KCk7XG5cbiAgICAgIC8vIE1lcmdlIG5ld2x5LWNyZWF0ZWQgcHJvamVjdCBmaWxlcyBpbnRvIHRoZSBtYXAgXHUyMDE0IG1ldGFkYXRhIGNhY2hlIHdvbid0XG4gICAgICAvLyBoYXZlIHRoZWlyIGZyb250bWF0dGVyIHlldCBzbyBzY2FuVmF1bHQgY2FuJ3QgZGV0ZWN0IHRoZW0gb24gaXRzIG93bi5cbiAgICAgIGZvciAoY29uc3QgW3BhdGgsIGlkXSBvZiBuZXdQcm9qZWN0RmlsZXMpIHtcbiAgICAgICAgaWYgKCFmaWxlUHJvamVjdE1hcC5oYXMocGF0aCkpIGZpbGVQcm9qZWN0TWFwLnNldChwYXRoLCBpZCk7XG4gICAgICB9XG5cbiAgICAgIC8vIFN0ZXAgMzogUHVzaCBuZXcgT2JzaWRpYW4gdGFza3MgKG5vIHZpa3VuamFJZCkgdG8gVmlrdW5qYVxuICAgICAgYXdhaXQgdGhpcy5wdXNoTmV3VGFza3Mob2JzaWRpYW5UYXNrcywgcmVzdWx0KTtcblxuICAgICAgLy8gU3RlcCA0OiBQdXNoIHVwZGF0ZXMgdG8gZXhpc3RpbmcgdGFza3MgKGhhdmUgdmlrdW5qYUlkLCBjb250ZW50IGNoYW5nZWQpXG4gICAgICBhd2FpdCB0aGlzLnB1c2hUYXNrVXBkYXRlcyhvYnNpZGlhblRhc2tzLCByZXN1bHQpO1xuXG4gICAgICAvLyBTdGVwIDU6IFB1bGwgcmVtb3RlIGNoYW5nZXMgZnJvbSBWaWt1bmphIGJhY2sgdG8gdGhlIHZhdWx0LFxuICAgICAgLy8gICAgICAgICBhbmQgaW1wb3J0IHJlbW90ZS1vbmx5IHRhc2tzIGludG8gdGhlaXIgYm91bmQgZmlsZXNcbiAgICAgIGF3YWl0IHRoaXMucHVsbFJlbW90ZUNoYW5nZXMob2JzaWRpYW5UYXNrcywgZmlsZVByb2plY3RNYXAsIHJlc3VsdCk7XG5cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIHJlc3VsdC5lcnJvcnMucHVzaChTdHJpbmcoZXJyKSk7XG4gICAgfVxuXG4gICAgdGhpcy5sYXN0U3luY1RpbWUgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogU3luYyBhIHNpbmdsZSBmaWxlLiBDYWxsZWQgb24gZmlsZS1zYXZlIGV2ZW50cyBmb3IgZWZmaWNpZW5jeSBcdTIwMTRcbiAgICogYXZvaWRzIHJlLXNjYW5uaW5nIHRoZSBlbnRpcmUgdmF1bHQgd2hlbiBvbmx5IG9uZSBmaWxlIGNoYW5nZWQuXG4gICAqXG4gICAqIEFsc28gcHVsbHMgcmVtb3RlLW9ubHkgdGFza3MgZnJvbSBWaWt1bmphIGludG8gdGhlIGZpbGUgd2hlbiB0aGUgbm90ZVxuICAgKiBoYXMgYW4gZXhwbGljaXQgcHJvamVjdCBiaW5kaW5nIChgdmlrdW5qYV9wcm9qZWN0X2lkYCBvciBgdmlrdW5qYV9wcm9qZWN0YFxuICAgKiBmcm9udG1hdHRlcikuIFRoaXMgaXMgd2hhdCBwb3B1bGF0ZXMgYSBuZXdseS1jcmVhdGVkIHByb2plY3Qgbm90ZSB3aXRoXG4gICAqIHRhc2tzIHRoYXQgYWxyZWFkeSBleGlzdCBpbiBWaWt1bmphLlxuICAgKlxuICAgKiBAcGFyYW0gZmlsZSAtIFRoZSBPYnNpZGlhbiBURmlsZSB0aGF0IHdhcyBzYXZlZFxuICAgKi9cbiAgYXN5bmMgc3luY0ZpbGUoZmlsZTogVEZpbGUpOiBQcm9taXNlPFN5bmNSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQ6IFN5bmNSZXN1bHQgPSB7XG4gICAgICBjcmVhdGVkOiAwLFxuICAgICAgdXBkYXRlZDogMCxcbiAgICAgIGNvbXBsZXRlZDogMCxcbiAgICAgIGVycm9yczogW10sXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCksXG4gICAgfTtcblxuICAgIGlmICh0aGlzLmlzRXhjbHVkZWQoZmlsZS5wYXRoKSkgcmV0dXJuIHJlc3VsdDtcblxuICAgIC8vIFJlc2V0IHByb2plY3QgY2FjaGUgZm9yIHRoaXMgcnVuXG4gICAgdGhpcy5jYWNoZWRQcm9qZWN0cyA9IG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICBjb25zdCB0YXNrcyA9IFRhc2tQYXJzZXIucGFyc2VGaWxlKGNvbnRlbnQsIGZpbGUucGF0aCk7XG5cbiAgICAgIC8vIFJlc29sdmUgcHJvamVjdCBJRHMgZnJvbSBmcm9udG1hdHRlciAoZXhwbGljaXQpIG9yIGRlZmF1bHRcbiAgICAgIGNvbnN0IGV4cGxpY2l0SWQgPSBhd2FpdCB0aGlzLmdldEV4cGxpY2l0UHJvamVjdElkKGZpbGUpO1xuICAgICAgY29uc3QgZWZmZWN0aXZlSWQgPSBleHBsaWNpdElkID8/IHRoaXMuc2V0dGluZ3MuZGVmYXVsdFByb2plY3RJZDtcbiAgICAgIGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuICAgICAgICB0YXNrLnByb2plY3RJZCA9IGVmZmVjdGl2ZUlkO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLnB1c2hOZXdUYXNrcyh0YXNrcywgcmVzdWx0KTtcbiAgICAgIGF3YWl0IHRoaXMucHVzaFRhc2tVcGRhdGVzKHRhc2tzLCByZXN1bHQpO1xuXG4gICAgICAvLyBQdWxsIHJlbW90ZSB0YXNrcyBmb3IgdGhpcyBmaWxlJ3MgZXhwbGljaXRseS1ib3VuZCBwcm9qZWN0LlxuICAgICAgLy8gVGhpcyBpbXBvcnRzIHRhc2tzIHRoYXQgZXhpc3QgaW4gVmlrdW5qYSBidXQgaGF2ZW4ndCBiZWVuIHN5bmNlZFxuICAgICAgLy8gdG8gdGhpcyBub3RlIHlldCAoZS5nLiB0YXNrcyBjcmVhdGVkIGluIHRoZSBWaWt1bmphIHdlYiBVSSkuXG4gICAgICBpZiAoZXhwbGljaXRJZCAhPT0gbnVsbCkge1xuICAgICAgICBjb25zdCBmaWxlUHJvamVjdE1hcCA9IG5ldyBNYXAoW1tmaWxlLnBhdGgsIGV4cGxpY2l0SWRdXSk7XG4gICAgICAgIGF3YWl0IHRoaXMucHVsbFJlbW90ZUNoYW5nZXModGFza3MsIGZpbGVQcm9qZWN0TWFwLCByZXN1bHQpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgcmVzdWx0LmVycm9ycy5wdXNoKGBFcnJvciBzeW5jaW5nICR7ZmlsZS5wYXRofTogJHtTdHJpbmcoZXJyKX1gKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIEhhbmRsZSBhIGNoZWNrYm94IHRvZ2dsZSBpbiB0aGUgZWRpdG9yLlxuICAgKiBDYWxsZWQgd2hlbiB0aGUgdXNlciBjbGlja3MgYSBjaGVja2JveCBpbiByZWFkaW5nL2xpdmUtcHJldmlldyBtb2RlLlxuICAgKlxuICAgKiBAcGFyYW0gZmlsZSAgICAgICAtIEZpbGUgY29udGFpbmluZyB0aGUgdGFza1xuICAgKiBAcGFyYW0gbGluZU51bWJlciAtIExpbmUgdGhhdCB3YXMgdG9nZ2xlZFxuICAgKiBAcGFyYW0gZG9uZSAgICAgICAtIE5ldyBkb25lIHN0YXRlXG4gICAqL1xuICBhc3luYyBoYW5kbGVDaGVja2JveFRvZ2dsZShcbiAgICBmaWxlOiBURmlsZSxcbiAgICBsaW5lTnVtYmVyOiBudW1iZXIsXG4gICAgZG9uZTogYm9vbGVhblxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBsaW5lcyA9IGNvbnRlbnQuc3BsaXQoXCJcXG5cIik7XG4gICAgY29uc3QgbGluZSA9IGxpbmVzW2xpbmVOdW1iZXJdO1xuXG4gICAgaWYgKCFUYXNrUGFyc2VyLmlzVGFza0xpbmUobGluZSkpIHJldHVybjtcblxuICAgIGNvbnN0IHRhc2sgPSBUYXNrUGFyc2VyLnBhcnNlTGluZShsaW5lLCBsaW5lTnVtYmVyLCBmaWxlLnBhdGgpO1xuICAgIGlmICghdGFzaykgcmV0dXJuO1xuXG4gICAgdGFzay5kb25lID0gZG9uZTtcblxuICAgIC8vIElmIHRoZSB0YXNrIGlzIGFscmVhZHkgbGlua2VkIHRvIFZpa3VuamEsIHVwZGF0ZSBpdCB0aGVyZVxuICAgIGlmICh0YXNrLnZpa3VuamFJZCAhPT0gbnVsbCkge1xuICAgICAgYXdhaXQgdGhpcy5jbGllbnQuc2V0VGFza0RvbmUodGFzay52aWt1bmphSWQsIGRvbmUpO1xuICAgIH1cblxuICAgIC8vIFdyaXRlIHRoZSB1cGRhdGVkIGxpbmUgYmFjayB0byB0aGUgZmlsZVxuICAgIGNvbnN0IG5ld0NvbnRlbnQgPSBUYXNrUGFyc2VyLnJlcGxhY2VMaW5lKGNvbnRlbnQsIGxpbmVOdW1iZXIsIFRhc2tQYXJzZXIuc2VyaWFsaXNlKHRhc2spKTtcbiAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgbmV3Q29udGVudCk7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgUHJvamVjdCBGaWxlIE1hbmFnZW1lbnQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgLyoqXG4gICAqIEVuc3VyZSBldmVyeSBub24tYXJjaGl2ZWQgVmlrdW5qYSBwcm9qZWN0IGhhcyBhIGNvcnJlc3BvbmRpbmcgbWFya2Rvd25cbiAgICogZmlsZSBpbiB0aGUgY29uZmlndXJlZCBwcm9qZWN0cyBmb2xkZXIuXG4gICAqXG4gICAqIEVhY2ggZmlsZSBpcyBjcmVhdGVkIHdpdGggYHZpa3VuamFfcHJvamVjdF9pZGAgZnJvbnRtYXR0ZXIgcHJlLWZpbGxlZCBzb1xuICAgKiB0aGUgc3luYyBlbmdpbmUgY2FuIHJvdXRlIHRhc2tzIGNvcnJlY3RseSB3aXRob3V0IGFueSBtYW51YWwgc2V0dXAuXG4gICAqXG4gICAqIEZpbGVzIHRoYXQgYWxyZWFkeSBleGlzdCBhcmUgbGVmdCB1bnRvdWNoZWQgXHUyMDE0IHRoaXMgb25seSBjcmVhdGVzIG1pc3Npbmcgb25lcy5cbiAgICogSWYgYSBwcm9qZWN0IGlzIHJlbmFtZWQgaW4gVmlrdW5qYSB0aGUgb3JpZ2luYWwgZmlsZSBrZWVwcyB3b3JraW5nIGJlY2F1c2VcbiAgICogdGhlIGZyb250bWF0dGVyIElEIGlzIHRoZSByZWFsIGlkZW50aXR5LCBub3QgdGhlIGZpbGVuYW1lLlxuICAgKlxuICAgKiBAcmV0dXJucyBBIG1hcCBvZiBuZXdseS1jcmVhdGVkIGZpbGUgcGF0aHMgXHUyMTkyIHByb2plY3QgSURzLiBVc2VkIGJ5IHN5bmMoKVxuICAgKiAgICAgICAgICB0byBzZWVkIHRoZSBmaWxlUHJvamVjdE1hcCBiZWZvcmUgdGhlIG1ldGFkYXRhIGNhY2hlIGhhcyBpbmRleGVkXG4gICAqICAgICAgICAgIHRoZSBuZXcgZmlsZXMuXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGVuc3VyZVByb2plY3RGaWxlcygpOiBQcm9taXNlPE1hcDxzdHJpbmcsIG51bWJlcj4+IHtcbiAgICBjb25zdCBjcmVhdGVkID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuICAgIGlmICghdGhpcy5zZXR0aW5ncy5hdXRvQ3JlYXRlUHJvamVjdEZpbGVzKSByZXR1cm4gY3JlYXRlZDtcblxuICAgIGNvbnN0IGZvbGRlciA9IHRoaXMuc2V0dGluZ3MucHJvamVjdHNGb2xkZXIudHJpbSgpLnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG4gICAgaWYgKCFmb2xkZXIpIHJldHVybiBjcmVhdGVkO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBmb2xkZXIgaWYgaXQgZG9lc24ndCBleGlzdCB5ZXRcbiAgICBpZiAoIXRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmb2xkZXIpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVGb2xkZXIoZm9sZGVyKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBGb2xkZXIgbWF5IGhhdmUgYmVlbiBjcmVhdGVkIGJ5IGEgY29uY3VycmVudCBvcGVyYXRpb24gXHUyMDE0IHNhZmUgdG8gaWdub3JlXG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcHJvamVjdHMgPSBhd2FpdCB0aGlzLmdldENhY2hlZFByb2plY3RzKCk7XG5cbiAgICBmb3IgKGNvbnN0IHByb2plY3Qgb2YgcHJvamVjdHMpIHtcbiAgICAgIGlmIChwcm9qZWN0LmlzX2FyY2hpdmVkKSBjb250aW51ZTtcblxuICAgICAgLy8gU2FuaXRpc2UgcHJvamVjdCB0aXRsZTogcmVwbGFjZSBjaGFyYWN0ZXJzIGZvcmJpZGRlbiBpbiBtb3N0IGZpbGVzeXN0ZW1zXG4gICAgICBjb25zdCBzYWZlTmFtZSA9IHByb2plY3QudGl0bGUucmVwbGFjZSgvW1xcXFwvOio/XCI8PnwjXltcXF1dL2csIFwiLVwiKS50cmltKCk7XG4gICAgICBpZiAoIXNhZmVOYW1lKSBjb250aW51ZTtcblxuICAgICAgY29uc3QgZmlsZVBhdGggPSBgJHtmb2xkZXJ9LyR7c2FmZU5hbWV9Lm1kYDtcblxuICAgICAgaWYgKHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmaWxlUGF0aCkpIGNvbnRpbnVlOyAvLyBBbHJlYWR5IGV4aXN0c1xuXG4gICAgICBjb25zdCBjb250ZW50ID1cbiAgICAgICAgYC0tLVxcbnZpa3VuamFfcHJvamVjdF9pZDogJHtwcm9qZWN0LmlkfVxcbi0tLVxcblxcbiMgJHtwcm9qZWN0LnRpdGxlfVxcblxcbmA7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZShmaWxlUGF0aCwgY29udGVudCk7XG4gICAgICAgIGNyZWF0ZWQuc2V0KGZpbGVQYXRoLCBwcm9qZWN0LmlkKTtcbiAgICAgICAgY29uc29sZS5sb2coYFtWaWt1bmphXSBDcmVhdGVkIHByb2plY3QgZmlsZTogJHtmaWxlUGF0aH1gKTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBbVmlrdW5qYV0gRmFpbGVkIHRvIGNyZWF0ZSBwcm9qZWN0IGZpbGUgJHtmaWxlUGF0aH06YCwgZXJyKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gY3JlYXRlZDtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBWYXVsdCBTY2FubmluZyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICAvKipcbiAgICogU2NhbiBhbGwgbWFya2Rvd24gZmlsZXMgaW4gdGhlIHZhdWx0IGZvciB0YXNrIGxpbmVzLlxuICAgKiBSZXNwZWN0cyB0aGUgZXhjbHVkZWRGb2xkZXJzIHNldHRpbmcuXG4gICAqXG4gICAqIEFsc28gYnVpbGRzIGEgbWFwIG9mIGZpbGVzIHRoYXQgaGF2ZSBhbiBleHBsaWNpdCBwcm9qZWN0IGJpbmRpbmcgaW4gdGhlaXJcbiAgICogZnJvbnRtYXR0ZXIgKGB2aWt1bmphX3Byb2plY3RfaWRgIG9yIGB2aWt1bmphX3Byb2plY3RgKS4gVGhpcyBtYXAgZHJpdmVzXG4gICAqIHRoZSByZW1vdGUtaW1wb3J0IHN0ZXAgaW4gcHVsbFJlbW90ZUNoYW5nZXMuXG4gICAqXG4gICAqIEByZXR1cm5zIHRhc2tzIFx1MjAxNCBhbGwgT2JzaWRpYW5UYXNrIG9iamVjdHMgZm91bmQgaW4gdGhlIHZhdWx0XG4gICAqICAgICAgICAgIGZpbGVQcm9qZWN0TWFwIFx1MjAxNCBmaWxlIHBhdGggXHUyMTkyIFZpa3VuamEgcHJvamVjdCBJRCwgZm9yIGZpbGVzIHdpdGhcbiAgICogICAgICAgICAgICAgICAgICAgICAgICAgICBleHBsaWNpdCBmcm9udG1hdHRlciBwcm9qZWN0IGJpbmRpbmdzIG9ubHlcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgc2NhblZhdWx0KCk6IFByb21pc2U8e1xuICAgIHRhc2tzOiBPYnNpZGlhblRhc2tbXTtcbiAgICBmaWxlUHJvamVjdE1hcDogTWFwPHN0cmluZywgbnVtYmVyPjtcbiAgfT4ge1xuICAgIGNvbnN0IGFsbFRhc2tzOiBPYnNpZGlhblRhc2tbXSA9IFtdO1xuICAgIGNvbnN0IGZpbGVQcm9qZWN0TWFwID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgICBjb25zdCBmaWxlcyA9IHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKTtcblxuICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgaWYgKHRoaXMuaXNFeGNsdWRlZChmaWxlLnBhdGgpKSBjb250aW51ZTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgIGNvbnN0IHRhc2tzID0gVGFza1BhcnNlci5wYXJzZUZpbGUoY29udGVudCwgZmlsZS5wYXRoKTtcblxuICAgICAgICAvLyBSZXNvbHZlIGV4cGxpY2l0IGZyb250bWF0dGVyIGJpbmRpbmcgKHZpa3VuamFfcHJvamVjdF9pZCBvciB2aWt1bmphX3Byb2plY3QpXG4gICAgICAgIGNvbnN0IGV4cGxpY2l0SWQgPSBhd2FpdCB0aGlzLmdldEV4cGxpY2l0UHJvamVjdElkKGZpbGUpO1xuICAgICAgICBjb25zdCBlZmZlY3RpdmVJZCA9IGV4cGxpY2l0SWQgPz8gdGhpcy5zZXR0aW5ncy5kZWZhdWx0UHJvamVjdElkO1xuXG4gICAgICAgIGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuICAgICAgICAgIHRhc2sucHJvamVjdElkID0gZWZmZWN0aXZlSWQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUcmFjayBleHBsaWNpdCBiaW5kaW5ncyBzbyBwdWxsUmVtb3RlQ2hhbmdlcyBrbm93cyB3aGljaCBmaWxlc1xuICAgICAgICAvLyB0byBpbXBvcnQgcmVtb3RlLW9ubHkgdGFza3MgaW50b1xuICAgICAgICBpZiAoZXhwbGljaXRJZCAhPT0gbnVsbCkge1xuICAgICAgICAgIGZpbGVQcm9qZWN0TWFwLnNldChmaWxlLnBhdGgsIGV4cGxpY2l0SWQpO1xuICAgICAgICB9XG5cbiAgICAgICAgYWxsVGFza3MucHVzaCguLi50YXNrcyk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgW1Zpa3VuamFdIEVycm9yIHNjYW5uaW5nICR7ZmlsZS5wYXRofTpgLCBlcnIpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7IHRhc2tzOiBhbGxUYXNrcywgZmlsZVByb2plY3RNYXAgfTtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBQdXNoOiBPYnNpZGlhbiBcdTIxOTIgVmlrdW5qYSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICAvKipcbiAgICogQ3JlYXRlIFZpa3VuamEgdGFza3MgZm9yIGFueSBPYnNpZGlhbiB0YXNrcyB0aGF0IGRvbid0IHlldCBoYXZlIGEgdmlrdW5qYUlkLlxuICAgKiBBZnRlciBjcmVhdGlvbiwgd3JpdGVzIHRoZSB2aWt1bmphSWQgYmFjayBpbnRvIHRoZSBtYXJrZG93biBsaW5lLlxuICAgKlxuICAgKiBQcm9qZWN0IHJlc29sdXRpb24gb3JkZXIgKGhpZ2hlc3QgcHJpb3JpdHkgZmlyc3QpOlxuICAgKiAgIDEuIElubGluZSBgQHByb2plY3Q6TmFtZWAgdG9rZW4gb24gdGhlIHRhc2sgbGluZVxuICAgKiAgIDIuIGB2aWt1bmphX3Byb2plY3RfaWRgIC8gYHZpa3VuamFfcHJvamVjdGAgaW4gdGhlIG5vdGUncyBmcm9udG1hdHRlclxuICAgKiAgIDMuIERlZmF1bHQgcHJvamVjdCBjb25maWd1cmVkIGluIHBsdWdpbiBzZXR0aW5nc1xuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBwdXNoTmV3VGFza3ModGFza3M6IE9ic2lkaWFuVGFza1tdLCByZXN1bHQ6IFN5bmNSZXN1bHQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBuZXdUYXNrcyA9IHRhc2tzLmZpbHRlcigodCkgPT4gdC52aWt1bmphSWQgPT09IG51bGwpO1xuXG4gICAgZm9yIChjb25zdCB0YXNrIG9mIG5ld1Rhc2tzKSB7XG4gICAgICAvLyBSZXNvbHZlIHByb2plY3QgXHUyMDE0IGlubGluZSBAcHJvamVjdDogb3ZlcnJpZGVzIHRoZSBub3RlLWxldmVsIGJpbmRpbmdcbiAgICAgIGxldCBwcm9qZWN0SWQgPSB0YXNrLnByb2plY3RJZCA/PyB0aGlzLnNldHRpbmdzLmRlZmF1bHRQcm9qZWN0SWQ7XG4gICAgICBpZiAodGFzay5wcm9qZWN0TmFtZSkge1xuICAgICAgICBjb25zdCBwcm9qZWN0cyA9IGF3YWl0IHRoaXMuZ2V0Q2FjaGVkUHJvamVjdHMoKTtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBwcm9qZWN0cy5maW5kKFxuICAgICAgICAgIChwKSA9PiBwLnRpdGxlLnRvTG93ZXJDYXNlKCkudHJpbSgpID09PSB0YXNrLnByb2plY3ROYW1lIS50b0xvd2VyQ2FzZSgpLnRyaW0oKVxuICAgICAgICApO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICBwcm9qZWN0SWQgPSBtYXRjaC5pZDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHQuZXJyb3JzLnB1c2goXG4gICAgICAgICAgICBgVW5rbm93biBwcm9qZWN0IFwiQHByb2plY3Q6JHt0YXNrLnByb2plY3ROYW1lfVwiIG9uIHRhc2sgXCIke3Rhc2sudGl0bGV9XCIgYCArXG4gICAgICAgICAgICBgaW4gJHt0YXNrLmZpbGVQYXRofS4gQ2hlY2sgdGhlIG5hbWUgbWF0Y2hlcyBhIHByb2plY3QgaW4gVmlrdW5qYSBleGFjdGx5LmBcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICghcHJvamVjdElkKSB7XG4gICAgICAgIHJlc3VsdC5lcnJvcnMucHVzaChcbiAgICAgICAgICBgU2tpcHBlZCBcIiR7dGFzay50aXRsZX1cIiBpbiAke3Rhc2suZmlsZVBhdGh9IFx1MjAxNCBubyBwcm9qZWN0IGFzc2lnbmVkLiBgICtcbiAgICAgICAgICBgQWRkIHZpa3VuamFfcHJvamVjdF9pZCB0byB0aGUgbm90ZSdzIGZyb250bWF0dGVyLCB1c2UgQHByb2plY3Q6TmFtZSBvbiBgICtcbiAgICAgICAgICBgdGhlIHRhc2sgbGluZSwgb3Igc2V0IGEgRGVmYXVsdCBQcm9qZWN0IGluIHBsdWdpbiBzZXR0aW5ncy5gXG4gICAgICAgICk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjcmVhdGVkID0gYXdhaXQgdGhpcy5jbGllbnQuY3JlYXRlVGFzayhwcm9qZWN0SWQsIHtcbiAgICAgICAgICB0aXRsZTogdGFzay50aXRsZSxcbiAgICAgICAgICBkb25lOiB0YXNrLmRvbmUsXG4gICAgICAgICAgZHVlX2RhdGU6IHRhc2suZHVlRGF0ZSA/IG5ldyBEYXRlKHRhc2suZHVlRGF0ZSkudG9JU09TdHJpbmcoKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgICBzdGFydF9kYXRlOiB0YXNrLnN0YXJ0RGF0ZSA/IG5ldyBEYXRlKHRhc2suc3RhcnREYXRlKS50b0lTT1N0cmluZygpIDogdW5kZWZpbmVkLFxuICAgICAgICAgIHByaW9yaXR5OiB0YXNrLnByaW9yaXR5ID4gMCA/IHRhc2sucHJpb3JpdHkgOiB1bmRlZmluZWQsXG4gICAgICAgICAgcmVwZWF0X2FmdGVyOiBUYXNrUGFyc2VyLnBhcnNlUmVwZWF0QWZ0ZXIodGFzay5yZWN1cnJlbmNlKSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gV3JpdGUgdmlrdW5qYUlkIGJhY2sgdG8gdGhlIGZpbGVcbiAgICAgICAgdGFzay52aWt1bmphSWQgPSBjcmVhdGVkLmlkO1xuICAgICAgICBhd2FpdCB0aGlzLndyaXRlVGFza1RvRmlsZSh0YXNrKTtcbiAgICAgICAgcmVzdWx0LmNyZWF0ZWQrKztcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICByZXN1bHQuZXJyb3JzLnB1c2goYEZhaWxlZCB0byBjcmVhdGUgdGFzayBcIiR7dGFzay50aXRsZX1cIjogJHtTdHJpbmcoZXJyKX1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlIFZpa3VuamEgZm9yIHRhc2tzIHRoYXQgaGF2ZSBhIHZpa3VuamFJZCAoaS5lLiBhbHJlYWR5IHN5bmNlZCkuXG4gICAqIEN1cnJlbnRseSB1cGRhdGVzIGRvbmUgc3RhdHVzIFx1MjAxNCB0aXRsZS9kYXRlIHN5bmMgaXMgaGFuZGxlZCBpbiBwdWxsLlxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBwdXNoVGFza1VwZGF0ZXModGFza3M6IE9ic2lkaWFuVGFza1tdLCByZXN1bHQ6IFN5bmNSZXN1bHQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBleGlzdGluZ1Rhc2tzID0gdGFza3MuZmlsdGVyKCh0KSA9PiB0LnZpa3VuamFJZCAhPT0gbnVsbCk7XG5cbiAgICBmb3IgKGNvbnN0IHRhc2sgb2YgZXhpc3RpbmdUYXNrcykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5jbGllbnQudXBkYXRlVGFzayh0YXNrLnZpa3VuamFJZCEsIHtcbiAgICAgICAgICB0aXRsZTogdGFzay50aXRsZSxcbiAgICAgICAgICBkb25lOiB0YXNrLmRvbmUsXG4gICAgICAgICAgZHVlX2RhdGU6IHRhc2suZHVlRGF0ZSA/IG5ldyBEYXRlKHRhc2suZHVlRGF0ZSkudG9JU09TdHJpbmcoKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgICBzdGFydF9kYXRlOiB0YXNrLnN0YXJ0RGF0ZSA/IG5ldyBEYXRlKHRhc2suc3RhcnREYXRlKS50b0lTT1N0cmluZygpIDogdW5kZWZpbmVkLFxuICAgICAgICAgIHByaW9yaXR5OiB0YXNrLnByaW9yaXR5ID4gMCA/IHRhc2sucHJpb3JpdHkgOiB1bmRlZmluZWQsXG4gICAgICAgICAgcmVwZWF0X2FmdGVyOiBUYXNrUGFyc2VyLnBhcnNlUmVwZWF0QWZ0ZXIodGFzay5yZWN1cnJlbmNlKSxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlc3VsdC51cGRhdGVkKys7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgcmVzdWx0LmVycm9ycy5wdXNoKGBGYWlsZWQgdG8gdXBkYXRlIHRhc2sgXCIke3Rhc2sudGl0bGV9XCI6ICR7U3RyaW5nKGVycil9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFB1bGw6IFZpa3VuamEgXHUyMTkyIE9ic2lkaWFuIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4gIC8qKlxuICAgKiBQdWxsIHJlbW90ZSBjaGFuZ2VzIGZyb20gVmlrdW5qYSBhbmQgd3JpdGUgdGhlbSBiYWNrIHRvIHRoZSB2YXVsdC5cbiAgICpcbiAgICogVHdvIHRoaW5ncyBoYXBwZW4gaGVyZTpcbiAgICpcbiAgICogMS4gKipVcGRhdGUgZXhpc3RpbmcgdGFza3MqKiBcdTIwMTQgdGFza3MgYWxyZWFkeSB0cmFja2VkIGluIE9ic2lkaWFuICh0aG9zZVxuICAgKiAgICB3aXRoIGEgYDwhLS12aWt1bmphOklELS0+YCBjb21tZW50KSBhcmUgY29tcGFyZWQgYWdhaW5zdCBWaWt1bmphIGFuZFxuICAgKiAgICB1cGRhdGVkIGlmIHRoZWlyIHRpdGxlIG9yIGRvbmUgc3RhdGUgY2hhbmdlZCByZW1vdGVseS5cbiAgICpcbiAgICogMi4gKipJbXBvcnQgcmVtb3RlLW9ubHkgdGFza3MqKiBcdTIwMTQgZm9yIGZpbGVzIHRoYXQgaGF2ZSBhbiBleHBsaWNpdCBwcm9qZWN0XG4gICAqICAgIGJpbmRpbmcgaW4gdGhlaXIgZnJvbnRtYXR0ZXIgKGB2aWt1bmphX3Byb2plY3RfaWRgIC8gYHZpa3VuamFfcHJvamVjdGApLFxuICAgKiAgICBhbnkgVmlrdW5qYSB0YXNrcyB0aGF0IGhhdmUgbm8gT2JzaWRpYW4gY291bnRlcnBhcnQgYXJlIGFwcGVuZGVkIHRvXG4gICAqICAgIHRoYXQgZmlsZS4gVGhpcyBpcyB3aGF0IHBvcHVsYXRlcyBhIGZyZXNobHktY3JlYXRlZCBwcm9qZWN0IG5vdGUgd2l0aFxuICAgKiAgICB0YXNrcyBhbHJlYWR5IGluIFZpa3VuamEuXG4gICAqXG4gICAqIEBwYXJhbSBsb2NhbFRhc2tzICAgICAtIEFsbCBPYnNpZGlhblRhc2sgb2JqZWN0cyBmb3VuZCBpbiB0aGUgdmF1bHRcbiAgICogQHBhcmFtIGZpbGVQcm9qZWN0TWFwIC0gRmlsZXMgd2l0aCBleHBsaWNpdCBwcm9qZWN0IGJpbmRpbmdzIChwYXRoIFx1MjE5MiBwcm9qZWN0SWQpXG4gICAqIEBwYXJhbSByZXN1bHQgICAgICAgICAtIE11dGFibGUgcmVzdWx0IG9iamVjdCB0byBhY2N1bXVsYXRlIGNvdW50cy9lcnJvcnNcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgcHVsbFJlbW90ZUNoYW5nZXMoXG4gICAgbG9jYWxUYXNrczogT2JzaWRpYW5UYXNrW10sXG4gICAgZmlsZVByb2plY3RNYXA6IE1hcDxzdHJpbmcsIG51bWJlcj4sXG4gICAgcmVzdWx0OiBTeW5jUmVzdWx0XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIC8vIEJ1aWxkIGEgbWFwIG9mIHZpa3VuamFJZCBcdTIxOTIgT2JzaWRpYW5UYXNrIGZvciBmYXN0IGxvb2t1cFxuICAgIGNvbnN0IGxvY2FsQnlJZCA9IG5ldyBNYXA8bnVtYmVyLCBPYnNpZGlhblRhc2s+KFxuICAgICAgbG9jYWxUYXNrc1xuICAgICAgICAuZmlsdGVyKCh0KSA9PiB0LnZpa3VuamFJZCAhPT0gbnVsbClcbiAgICAgICAgLm1hcCgodCkgPT4gW3QudmlrdW5qYUlkISwgdF0pXG4gICAgKTtcblxuICAgIC8vIFRyYWNrIHdoaWNoIHJlbW90ZSB0YXNrIElEcyB3ZSd2ZSBhbHJlYWR5IHByb2Nlc3NlZCB2aWEgcGVyLXByb2plY3RcbiAgICAvLyBmZXRjaGVzIHNvIHdlIGRvbid0IGRvdWJsZS1jb3VudCB0aGVtIGluIHRoZSBmYWxsYmFjayBnZXRBbGxUYXNrcyBjYWxsLlxuICAgIGNvbnN0IGhhbmRsZWRSZW1vdGVJZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuICAgIC8vIFx1MjUwMFx1MjUwMCBQZXItcHJvamVjdCBpbXBvcnQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gICAgLy8gR3JvdXAgZmlsZXMgYnkgcHJvamVjdCBzbyB3ZSBvbmx5IGZldGNoIGVhY2ggcHJvamVjdCBvbmNlIGV2ZW4gd2hlblxuICAgIC8vIG11bHRpcGxlIG5vdGVzIHNoYXJlIHRoZSBzYW1lIHByb2plY3QgSUQuXG4gICAgY29uc3QgcHJvamVjdFRvRmlsZXMgPSBuZXcgTWFwPG51bWJlciwgc3RyaW5nW10+KCk7XG4gICAgZm9yIChjb25zdCBbZmlsZVBhdGgsIHByb2plY3RJZF0gb2YgZmlsZVByb2plY3RNYXApIHtcbiAgICAgIGNvbnN0IGxpc3QgPSBwcm9qZWN0VG9GaWxlcy5nZXQocHJvamVjdElkKSA/PyBbXTtcbiAgICAgIGxpc3QucHVzaChmaWxlUGF0aCk7XG4gICAgICBwcm9qZWN0VG9GaWxlcy5zZXQocHJvamVjdElkLCBsaXN0KTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IFtwcm9qZWN0SWQsIGZpbGVQYXRoc10gb2YgcHJvamVjdFRvRmlsZXMpIHtcbiAgICAgIGxldCByZW1vdGVUYXNrczogVmlrdW5qYVRhc2tbXSA9IFtdO1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmVtb3RlVGFza3MgPSBhd2FpdCB0aGlzLmNsaWVudC5nZXRQcm9qZWN0VGFza3MocHJvamVjdElkKTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICByZXN1bHQuZXJyb3JzLnB1c2goYEZhaWxlZCB0byBmZXRjaCB0YXNrcyBmb3IgcHJvamVjdCAke3Byb2plY3RJZH06ICR7U3RyaW5nKGVycil9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBDb2xsZWN0IHRhc2tzIHRvIGltcG9ydCAobm90IHlldCBpbiBPYnNpZGlhbikgc28gd2UgY2FuIGJhdGNoLWFwcGVuZFxuICAgICAgLy8gdGhlbSBpbiBhIHNpbmdsZSBmaWxlIHdyaXRlIHJhdGhlciB0aGFuIG9uZSB3cml0ZSBwZXIgdGFzay5cbiAgICAgIGNvbnN0IHRvSW1wb3J0OiBWaWt1bmphVGFza1tdID0gW107XG5cbiAgICAgIGZvciAoY29uc3QgcmVtb3RlIG9mIHJlbW90ZVRhc2tzKSB7XG4gICAgICAgIGhhbmRsZWRSZW1vdGVJZHMuYWRkKHJlbW90ZS5pZCk7XG4gICAgICAgIGNvbnN0IGxvY2FsID0gbG9jYWxCeUlkLmdldChyZW1vdGUuaWQpO1xuXG4gICAgICAgIGlmIChsb2NhbCkge1xuICAgICAgICAgIC8vIFRhc2sgYWxyZWFkeSBpbiBPYnNpZGlhbiBcdTIwMTQgdXBkYXRlIGRvbmUvdGl0bGUgaWYgcmVtb3RlIGNoYW5nZWRcbiAgICAgICAgICBsZXQgY2hhbmdlZCA9IGZhbHNlO1xuICAgICAgICAgIGlmIChyZW1vdGUuZG9uZSAhPT0gbG9jYWwuZG9uZSkge1xuICAgICAgICAgICAgbG9jYWwuZG9uZSA9IHJlbW90ZS5kb25lO1xuICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICByZXN1bHQuY29tcGxldGVkKys7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChyZW1vdGUudGl0bGUgIT09IGxvY2FsLnRpdGxlKSB7XG4gICAgICAgICAgICBsb2NhbC50aXRsZSA9IHJlbW90ZS50aXRsZTtcbiAgICAgICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgICAgICAgcmVzdWx0LnVwZGF0ZWQrKztcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGNoYW5nZWQpIGF3YWl0IHRoaXMud3JpdGVUYXNrVG9GaWxlKGxvY2FsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBUYXNrIGV4aXN0cyBvbmx5IGluIFZpa3VuamEgXHUyMDE0IHF1ZXVlIGl0IGZvciBpbXBvcnRcbiAgICAgICAgICAvLyBTa2lwIGNvbXBsZXRlZCB0YXNrcyB1bmxlc3MgdGhlIHVzZXIgb3B0ZWQgaW5cbiAgICAgICAgICBpZiAoIXJlbW90ZS5kb25lIHx8IHRoaXMuc2V0dGluZ3Muc3luY0NvbXBsZXRlZFRhc2tzKSB7XG4gICAgICAgICAgICB0b0ltcG9ydC5wdXNoKHJlbW90ZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIEFwcGVuZCBhbGwgbmV3IHJlbW90ZSB0YXNrcyB0byB0aGUgcHJpbWFyeSBmaWxlIGZvciB0aGlzIHByb2plY3RcbiAgICAgIC8vICh0aGUgZmlyc3QgZmlsZSB0aGF0IGRlY2xhcmVkIHRoaXMgcHJvamVjdCBiaW5kaW5nKVxuICAgICAgaWYgKHRvSW1wb3J0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHBlbmRUYXNrc1RvRmlsZShmaWxlUGF0aHNbMF0sIHRvSW1wb3J0LCByZXN1bHQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFx1MjUwMFx1MjUwMCBGYWxsYmFjazogdXBkYXRlIHRyYWNrZWQgdGFza3Mgbm90IGNvdmVyZWQgYnkgYW55IGJvdW5kIHByb2plY3QgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gICAgLy8gVGhlc2UgYXJlIHRhc2tzIHRoYXQgaGF2ZSBhIHZpa3VuamFJZCBpbiBPYnNpZGlhbiBidXQgd2hvc2UgcHJvamVjdCBpc1xuICAgIC8vIG5vdCBleHBsaWNpdGx5IGJvdW5kIGluIGZyb250bWF0dGVyIChlLmcuIHRoZXkgdXNlIHRoZSBkZWZhdWx0IHByb2plY3QpLlxuICAgIGNvbnN0IHVuaGFuZGxlZExvY2FsID0gbG9jYWxUYXNrcy5maWx0ZXIoXG4gICAgICAodCkgPT4gdC52aWt1bmphSWQgIT09IG51bGwgJiYgIWhhbmRsZWRSZW1vdGVJZHMuaGFzKHQudmlrdW5qYUlkISlcbiAgICApO1xuXG4gICAgaWYgKHVuaGFuZGxlZExvY2FsLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gICAgbGV0IGFsbFJlbW90ZTogVmlrdW5qYVRhc2tbXSA9IFtdO1xuICAgIHRyeSB7XG4gICAgICBhbGxSZW1vdGUgPSBhd2FpdCB0aGlzLmNsaWVudC5nZXRBbGxUYXNrcygpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgcmVzdWx0LmVycm9ycy5wdXNoKGBGYWlsZWQgdG8gZmV0Y2ggcmVtb3RlIHRhc2tzOiAke1N0cmluZyhlcnIpfWApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgcmVtb3RlIG9mIGFsbFJlbW90ZSkge1xuICAgICAgaWYgKGhhbmRsZWRSZW1vdGVJZHMuaGFzKHJlbW90ZS5pZCkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgbG9jYWwgPSBsb2NhbEJ5SWQuZ2V0KHJlbW90ZS5pZCk7XG4gICAgICBpZiAoIWxvY2FsKSBjb250aW51ZTtcblxuICAgICAgbGV0IGNoYW5nZWQgPSBmYWxzZTtcbiAgICAgIGlmIChyZW1vdGUuZG9uZSAhPT0gbG9jYWwuZG9uZSkge1xuICAgICAgICBsb2NhbC5kb25lID0gcmVtb3RlLmRvbmU7XG4gICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgICByZXN1bHQuY29tcGxldGVkKys7XG4gICAgICB9XG4gICAgICBpZiAocmVtb3RlLnRpdGxlICE9PSBsb2NhbC50aXRsZSkge1xuICAgICAgICBsb2NhbC50aXRsZSA9IHJlbW90ZS50aXRsZTtcbiAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgIHJlc3VsdC51cGRhdGVkKys7XG4gICAgICB9XG4gICAgICBpZiAoY2hhbmdlZCkgYXdhaXQgdGhpcy53cml0ZVRhc2tUb0ZpbGUobG9jYWwpO1xuICAgIH1cbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBGaWxlIFdyaXRpbmcgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgLyoqXG4gICAqIFdyaXRlIGFuIHVwZGF0ZWQgdGFzayBiYWNrIHRvIGl0cyBzb3VyY2UgZmlsZS5cbiAgICogUmVwbGFjZXMgb25seSB0aGUgc3BlY2lmaWMgbGluZSBcdTIwMTQgZG9lcyBub3QgdG91Y2ggdGhlIHJlc3Qgb2YgdGhlIGZpbGUuXG4gICAqXG4gICAqIEBwYXJhbSB0YXNrIC0gVGhlIHRhc2sgd2l0aCB1cGRhdGVkIGZpZWxkc1xuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyB3cml0ZVRhc2tUb0ZpbGUodGFzazogT2JzaWRpYW5UYXNrKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aCh0YXNrLmZpbGVQYXRoKTtcbiAgICBpZiAoIWZpbGUgfHwgIShcImV4dGVuc2lvblwiIGluIGZpbGUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEZpbGUgbm90IGZvdW5kOiAke3Rhc2suZmlsZVBhdGh9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSBhcyBURmlsZSk7XG4gICAgY29uc3QgbmV3TGluZSA9IFRhc2tQYXJzZXIuc2VyaWFsaXNlKHRhc2spO1xuICAgIGNvbnN0IG5ld0NvbnRlbnQgPSBUYXNrUGFyc2VyLnJlcGxhY2VMaW5lKGNvbnRlbnQsIHRhc2subGluZU51bWJlciwgbmV3TGluZSk7XG4gICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUgYXMgVEZpbGUsIG5ld0NvbnRlbnQpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFwcGVuZCBhIGJhdGNoIG9mIFZpa3VuamEgdGFza3MgdG8gYSBmaWxlIGFzIG5ldyBtYXJrZG93biB0YXNrIGxpbmVzLlxuICAgKiBBbGwgdGFza3MgYXJlIHdyaXR0ZW4gaW4gYSBzaW5nbGUgdmF1bHQubW9kaWZ5IGNhbGwgdG8gbWluaW1pc2UgZmlsZSBjaHVybi5cbiAgICpcbiAgICogVXNlZCB3aGVuIGltcG9ydGluZyByZW1vdGUtb25seSB0YXNrcyAodGFza3MgdGhhdCBleGlzdCBpbiBWaWt1bmphIGJ1dCBoYXZlXG4gICAqIG5vIGA8IS0tdmlrdW5qYTpJRC0tPmAgY291bnRlcnBhcnQgaW4gdGhlIHZhdWx0IHlldCkuXG4gICAqXG4gICAqIEBwYXJhbSBmaWxlUGF0aCAgICAtIFZhdWx0LXJlbGF0aXZlIHBhdGggb2YgdGhlIHRhcmdldCBmaWxlXG4gICAqIEBwYXJhbSByZW1vdGVUYXNrcyAtIFZpa3VuamEgdGFza3MgdG8gYXBwZW5kXG4gICAqIEBwYXJhbSByZXN1bHQgICAgICAtIE11dGFibGUgcmVzdWx0IG9iamVjdDsgYGNyZWF0ZWRgIGlzIGluY3JlbWVudGVkIHBlciB0YXNrXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGFwcGVuZFRhc2tzVG9GaWxlKFxuICAgIGZpbGVQYXRoOiBzdHJpbmcsXG4gICAgcmVtb3RlVGFza3M6IFZpa3VuamFUYXNrW10sXG4gICAgcmVzdWx0OiBTeW5jUmVzdWx0XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xuICAgIGlmICghZmlsZSB8fCAhKFwiZXh0ZW5zaW9uXCIgaW4gZmlsZSkpIHJldHVybjtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUgYXMgVEZpbGUpO1xuXG4gICAgY29uc3QgbmV3TGluZXMgPSByZW1vdGVUYXNrcy5tYXAoKHJlbW90ZSkgPT4ge1xuICAgICAgY29uc3QgdGFzazogT2JzaWRpYW5UYXNrID0ge1xuICAgICAgICByYXdMaW5lOiBcIlwiLFxuICAgICAgICBsaW5lTnVtYmVyOiAtMSxcbiAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgIHRpdGxlOiByZW1vdGUudGl0bGUsXG4gICAgICAgIGRvbmU6IHJlbW90ZS5kb25lLFxuICAgICAgICBkdWVEYXRlOiBTeW5jRW5naW5lLmZvcm1hdERhdGUocmVtb3RlLmR1ZV9kYXRlKSxcbiAgICAgICAgc3RhcnREYXRlOiBTeW5jRW5naW5lLmZvcm1hdERhdGUocmVtb3RlLnN0YXJ0X2RhdGUpLFxuICAgICAgICBzY2hlZHVsZWREYXRlOiBudWxsLCAvLyBWaWt1bmphIGhhcyBubyBzY2hlZHVsZWQtZGF0ZSBjb25jZXB0XG4gICAgICAgIHByaW9yaXR5OiByZW1vdGUucHJpb3JpdHksXG4gICAgICAgIHJlY3VycmVuY2U6IFRhc2tQYXJzZXIuZm9ybWF0UmVwZWF0QWZ0ZXIocmVtb3RlLnJlcGVhdF9hZnRlciksXG4gICAgICAgIHZpa3VuamFJZDogcmVtb3RlLmlkLFxuICAgICAgICBwcm9qZWN0SWQ6IHJlbW90ZS5wcm9qZWN0X2lkLFxuICAgICAgICBwcm9qZWN0TmFtZTogbnVsbCxcbiAgICAgIH07XG4gICAgICByZXR1cm4gVGFza1BhcnNlci5zZXJpYWxpc2UodGFzayk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBuZXdDb250ZW50ID0gY29udGVudC50cmltRW5kKCkgKyBcIlxcblwiICsgbmV3TGluZXMuam9pbihcIlxcblwiKSArIFwiXFxuXCI7XG4gICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUgYXMgVEZpbGUsIG5ld0NvbnRlbnQpO1xuXG4gICAgcmVzdWx0LmNyZWF0ZWQgKz0gcmVtb3RlVGFza3MubGVuZ3RoO1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEhlbHBlcnMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgLyoqXG4gICAqIEZldGNoIHRoZSBwcm9qZWN0IGxpc3QsIHVzaW5nIGEgcGVyLXJ1biBpbi1tZW1vcnkgY2FjaGUgc28gdGhhdCBuYW1lLWJhc2VkXG4gICAqIGZyb250bWF0dGVyIGxvb2t1cHMgKGB2aWt1bmphX3Byb2plY3Q6IFwiV29yayBUYXNrc1wiYCkgYWNyb3NzIG1hbnkgZmlsZXNcbiAgICogb25seSByZXN1bHQgaW4gYSBzaW5nbGUgQVBJIGNhbGwgcGVyIHN5bmMgcnVuLlxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBnZXRDYWNoZWRQcm9qZWN0cygpOiBQcm9taXNlPFZpa3VuamFQcm9qZWN0W10+IHtcbiAgICBpZiAoIXRoaXMuY2FjaGVkUHJvamVjdHMpIHtcbiAgICAgIHRoaXMuY2FjaGVkUHJvamVjdHMgPSBhd2FpdCB0aGlzLmNsaWVudC5nZXRQcm9qZWN0cygpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5jYWNoZWRQcm9qZWN0cztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNvbHZlIHRoZSBleHBsaWNpdCBwcm9qZWN0IElEIGRlY2xhcmVkIGluIGEgZmlsZSdzIGZyb250bWF0dGVyLlxuICAgKlxuICAgKiBTdXBwb3J0cyB0d28gZnJvbnRtYXR0ZXIgcHJvcGVydGllczpcbiAgICogLSBgdmlrdW5qYV9wcm9qZWN0X2lkOiAzYCAgXHUyMDE0IG51bWVyaWMgSUQsIHJlc29sdmVkIGRpcmVjdGx5XG4gICAqIC0gYHZpa3VuamFfcHJvamVjdDogXCJXb3JrIFRhc2tzXCJgIFx1MjAxNCBwcm9qZWN0IG5hbWUsIHJlc29sdmVkIHZpYSBBUElcbiAgICogICAoY2FzZS1pbnNlbnNpdGl2ZSBtYXRjaCBhZ2FpbnN0IHRoZSBhdXRoZW50aWNhdGVkIHVzZXIncyBwcm9qZWN0IGxpc3QpXG4gICAqXG4gICAqIFJldHVybnMgYG51bGxgIGlmIHRoZSBmaWxlIGhhcyBubyBleHBsaWNpdCBwcm9qZWN0IGJpbmRpbmcuIERvZXMgTk9UXG4gICAqIGZhbGwgYmFjayB0byB0aGUgZGVmYXVsdCBwcm9qZWN0IFx1MjAxNCB1c2UgYHJlc29sdmVQcm9qZWN0SWRgIGZvciB0aGF0LlxuICAgKlxuICAgKiBAcGFyYW0gZmlsZSAtIFRoZSBmaWxlIHdob3NlIGZyb250bWF0dGVyIHRvIGluc3BlY3RcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgZ2V0RXhwbGljaXRQcm9qZWN0SWQoZmlsZTogVEZpbGUpOiBQcm9taXNlPG51bWJlciB8IG51bGw+IHtcbiAgICBjb25zdCBmcm9udG1hdHRlciA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5mcm9udG1hdHRlcjtcblxuICAgIGlmIChmcm9udG1hdHRlcj8udmlrdW5qYV9wcm9qZWN0X2lkKSB7XG4gICAgICByZXR1cm4gTnVtYmVyKGZyb250bWF0dGVyLnZpa3VuamFfcHJvamVjdF9pZCk7XG4gICAgfVxuXG4gICAgaWYgKGZyb250bWF0dGVyPy52aWt1bmphX3Byb2plY3QpIHtcbiAgICAgIGNvbnN0IG5hbWUgPSBTdHJpbmcoZnJvbnRtYXR0ZXIudmlrdW5qYV9wcm9qZWN0KS50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcbiAgICAgIGNvbnN0IHByb2plY3RzID0gYXdhaXQgdGhpcy5nZXRDYWNoZWRQcm9qZWN0cygpO1xuICAgICAgY29uc3QgbWF0Y2ggPSBwcm9qZWN0cy5maW5kKChwKSA9PiBwLnRpdGxlLnRvTG93ZXJDYXNlKCkudHJpbSgpID09PSBuYW1lKTtcbiAgICAgIGlmIChtYXRjaCkgcmV0dXJuIG1hdGNoLmlkO1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgW1Zpa3VuamFdIE5vIHByb2plY3QgZm91bmQgd2l0aCBuYW1lIFwiJHtmcm9udG1hdHRlci52aWt1bmphX3Byb2plY3R9XCIgaW4gJHtmaWxlLnBhdGh9YFxuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNvbHZlIHRoZSBlZmZlY3RpdmUgVmlrdW5qYSBwcm9qZWN0IElEIGZvciBhIGZpbGUuXG4gICAqIFJldHVybnMgdGhlIGV4cGxpY2l0IGZyb250bWF0dGVyIGJpbmRpbmcgaWYgcHJlc2VudCwgb3RoZXJ3aXNlIHRoZVxuICAgKiBwbHVnaW4td2lkZSBkZWZhdWx0IHByb2plY3QuIFJldHVybnMgbnVsbCBpZiBuZWl0aGVyIGlzIGNvbmZpZ3VyZWQuXG4gICAqXG4gICAqIEBwYXJhbSBmaWxlIC0gVGhlIGZpbGUgdG8gY2hlY2tcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgcmVzb2x2ZVByb2plY3RJZChmaWxlOiBURmlsZSk6IFByb21pc2U8bnVtYmVyIHwgbnVsbD4ge1xuICAgIHJldHVybiAoYXdhaXQgdGhpcy5nZXRFeHBsaWNpdFByb2plY3RJZChmaWxlKSkgPz8gdGhpcy5zZXR0aW5ncy5kZWZhdWx0UHJvamVjdElkO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIGlmIGEgZmlsZSBwYXRoIHNob3VsZCBiZSBleGNsdWRlZCBmcm9tIHN5bmMuXG4gICAqIEBwYXJhbSBwYXRoIC0gVmF1bHQtcmVsYXRpdmUgZmlsZSBwYXRoXG4gICAqL1xuICBwcml2YXRlIGlzRXhjbHVkZWQocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuc2V0dGluZ3MuZXhjbHVkZWRGb2xkZXJzLnNvbWUoKGZvbGRlcikgPT5cbiAgICAgIHBhdGguc3RhcnRzV2l0aChmb2xkZXIudHJpbSgpICsgXCIvXCIpXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBGb3JtYXQgYSBWaWt1bmphIElTTyBkYXRlIHN0cmluZyB0byBZWVlZLU1NLUREIGZvciBPYnNpZGlhbiBUYXNrcyBzeW50YXguXG4gICAqIFJldHVybnMgbnVsbCBmb3IgVmlrdW5qYSdzIG51bGwgZGF0ZSBzZW50aW5lbC5cbiAgICovXG4gIHN0YXRpYyBmb3JtYXREYXRlKGlzb0RhdGU6IHN0cmluZyB8IG51bGwpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBpZiAoIWlzb0RhdGUgfHwgaXNvRGF0ZSA9PT0gVklLVU5KQV9OVUxMX0RBVEUpIHJldHVybiBudWxsO1xuICAgIHJldHVybiBpc29EYXRlLnNwbGl0KFwiVFwiKVswXTtcbiAgfVxufVxuIiwgIi8qKlxuICogQGZpbGUgdWkvU2V0dGluZ3NUYWIudHNcbiAqIEBkZXNjcmlwdGlvbiBQbHVnaW4gc2V0dGluZ3MgdGFiIHJlbmRlcmVkIGluIE9ic2lkaWFuJ3MgU2V0dGluZ3MgcGFuZWwuXG4gKlxuICogUHJvdmlkZXMgY29uZmlndXJhdGlvbiBmb3I6XG4gKiAtIFZpa3VuamEgQVBJIFVSTCBhbmQgdG9rZW5cbiAqIC0gU3luYyBiZWhhdmlvdXIgKGludGVydmFsLCBvbi1zYXZlKVxuICogLSBEZWZhdWx0IHByb2plY3RcbiAqIC0gRXhjbHVkZWQgZm9sZGVyc1xuICovXG5cbmltcG9ydCB7IEFwcCwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZywgTm90aWNlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgdHlwZSBWaWt1bmphUGx1Z2luIGZyb20gXCIuLi9tYWluXCI7XG5pbXBvcnQgdHlwZSB7IFZpa3VuamFQcm9qZWN0IH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5cbmV4cG9ydCBjbGFzcyBWaWt1bmphU2V0dGluZ3NUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IFZpa3VuamFQbHVnaW47XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogVmlrdW5qYVBsdWdpbikge1xuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgfVxuXG4gIGRpc3BsYXkoKTogdm9pZCB7XG4gICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuXG4gICAgLy8gXHUyNTAwXHUyNTAwIENvbm5lY3Rpb24gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiVmlrdW5qYSBDb25uZWN0aW9uXCIgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiVmlrdW5qYSBVUkxcIilcbiAgICAgIC5zZXREZXNjKFwiQmFzZSBVUkwgb2YgeW91ciBWaWt1bmphIGluc3RhbmNlLCBlLmcuIGh0dHBzOi8vdmlrdW5qYS5leGFtcGxlLmNvbVwiKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJodHRwczovL3Zpa3VuamEuZXhhbXBsZS5jb21cIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXBpVXJsKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmFwaVVybCA9IHZhbHVlLnRyaW0oKS5yZXBsYWNlKC9cXC8kLywgXCJcIik7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJBUEkgVG9rZW5cIilcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICBcIlBlcnNvbmFsIGFjY2VzcyB0b2tlbiBmcm9tIFZpa3VuamEgXHUyMTkyIEFjY291bnQgU2V0dGluZ3MgXHUyMTkyIEFQSSBUb2tlbnMuIFwiICtcbiAgICAgICAgXCJHZW5lcmF0ZSBhIHRva2VuIHdpdGggZnVsbCBhY2Nlc3MuXCJcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PiB7XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJQYXN0ZSB5b3VyIHRva2VuIGhlcmVcIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXBpVG9rZW4pXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYXBpVG9rZW4gPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgdGV4dC5pbnB1dEVsLnR5cGUgPSBcInBhc3N3b3JkXCI7XG4gICAgICB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJUZXN0IENvbm5lY3Rpb25cIilcbiAgICAgIC5zZXREZXNjKFwiVmVyaWZ5IHlvdXIgVVJMIGFuZCB0b2tlbiBhcmUgY29ycmVjdC5cIilcbiAgICAgIC5hZGRCdXR0b24oKGJ0bikgPT5cbiAgICAgICAgYnRuXG4gICAgICAgICAgLnNldEJ1dHRvblRleHQoXCJUZXN0XCIpXG4gICAgICAgICAgLnNldEN0YSgpXG4gICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgYnRuLnNldEJ1dHRvblRleHQoXCJUZXN0aW5nXHUyMDI2XCIpO1xuICAgICAgICAgICAgYnRuLnNldERpc2FibGVkKHRydWUpO1xuXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBsdWdpbi50ZXN0Q29ubmVjdGlvbigpO1xuXG4gICAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShcIlx1MjcwNSBDb25uZWN0ZWQgdG8gVmlrdW5qYSBzdWNjZXNzZnVsbHkhXCIpO1xuICAgICAgICAgICAgICAvLyBSZS1yZW5kZXIgdGhlIHNldHRpbmdzIHRhYiBzbyB0aGUgRGVmYXVsdCBQcm9qZWN0IGRyb3Bkb3duXG4gICAgICAgICAgICAgIC8vIGlzIHBvcHVsYXRlZCBub3cgdGhhdCB3ZSBoYXZlIGEgbGl2ZSBjb25uZWN0aW9uLlxuICAgICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5ldyBOb3RpY2UoYFx1Mjc0QyBDb25uZWN0aW9uIGZhaWxlZDogJHtyZXN1bHQuZXJyb3J9YCk7XG4gICAgICAgICAgICAgIGJ0bi5zZXRCdXR0b25UZXh0KFwiVGVzdFwiKTtcbiAgICAgICAgICAgICAgYnRuLnNldERpc2FibGVkKGZhbHNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIC8vIFx1MjUwMFx1MjUwMCBEZWZhdWx0IFByb2plY3QgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiRGVmYXVsdCBQcm9qZWN0XCIgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiRGVmYXVsdCBQcm9qZWN0XCIpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgXCJUYXNrcyBjcmVhdGVkIGluIG5vdGVzIHdpdGhvdXQgYSB2aWt1bmphX3Byb2plY3RfaWQgZnJvbnRtYXR0ZXIgcHJvcGVydHkgXCIgK1xuICAgICAgICBcIndpbGwgYmUgYWRkZWQgdG8gdGhpcyBwcm9qZWN0LlwiXG4gICAgICApXG4gICAgICAuYWRkRHJvcGRvd24oYXN5bmMgKGRyb3Bkb3duKSA9PiB7XG4gICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIlx1MjAxNCBTZWxlY3QgYSBwcm9qZWN0IFx1MjAxNFwiKTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHByb2plY3RzOiBWaWt1bmphUHJvamVjdFtdID0gYXdhaXQgdGhpcy5wbHVnaW4uY2xpZW50Py5nZXRQcm9qZWN0cygpID8/IFtdO1xuICAgICAgICAgIGZvciAoY29uc3QgcHJvamVjdCBvZiBwcm9qZWN0cykge1xuICAgICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKFN0cmluZyhwcm9qZWN0LmlkKSwgcHJvamVjdC50aXRsZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oXCJcIiwgXCJDb3VsZCBub3QgbG9hZCBwcm9qZWN0cyBcdTIwMTQgY2hlY2sgY29ubmVjdGlvblwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRyb3Bkb3duXG4gICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kZWZhdWx0UHJvamVjdElkID8/IFwiXCIpKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmRlZmF1bHRQcm9qZWN0SWQgPSB2YWx1ZSA/IHBhcnNlSW50KHZhbHVlLCAxMCkgOiBudWxsO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgIC8vIFx1MjUwMFx1MjUwMCBQcm9qZWN0IEZpbGVzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIlByb2plY3QgRmlsZXNcIiB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJBdXRvLWNyZWF0ZSBwcm9qZWN0IGZpbGVzXCIpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgXCJBdXRvbWF0aWNhbGx5IGNyZWF0ZSBvbmUgbWFya2Rvd24gZmlsZSBwZXIgVmlrdW5qYSBwcm9qZWN0IGluIHRoZSBcIiArXG4gICAgICAgIFwiZm9sZGVyIGJlbG93LiBFYWNoIGZpbGUgaXMgcHJlLWNvbmZpZ3VyZWQgd2l0aCB0aGUgY29ycmVjdCBwcm9qZWN0IElEIFwiICtcbiAgICAgICAgXCJhbmQgYWN0cyBhcyB0aGUgdGFzayBsaXN0IGZvciB0aGF0IHByb2plY3QuIEZpbGVzIGFyZSBvbmx5IGNyZWF0ZWQgXHUyMDE0IFwiICtcbiAgICAgICAgXCJuZXZlciBkZWxldGVkIG9yIHJlbmFtZWQgXHUyMDE0IHNvIHJlbmFtaW5nIGEgcHJvamVjdCBpbiBWaWt1bmphIHdvbid0IFwiICtcbiAgICAgICAgXCJhZmZlY3QgZXhpc3RpbmcgZmlsZXMuXCJcbiAgICAgIClcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT5cbiAgICAgICAgdG9nZ2xlXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9DcmVhdGVQcm9qZWN0RmlsZXMpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0NyZWF0ZVByb2plY3RGaWxlcyA9IHZhbHVlO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAvLyBTaG93L2hpZGUgdGhlIGZvbGRlciBzZXR0aW5nIHdpdGhvdXQgYSBmdWxsIHJlLXJlbmRlclxuICAgICAgICAgICAgZm9sZGVyU2V0dGluZy5zZXR0aW5nRWwudG9nZ2xlKHZhbHVlKTtcbiAgICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIGNvbnN0IGZvbGRlclNldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiUHJvamVjdHMgZm9sZGVyXCIpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgXCJWYXVsdC1yZWxhdGl2ZSBmb2xkZXIgd2hlcmUgcHJvamVjdCBmaWxlcyBhcmUgY3JlYXRlZC4gXCIgK1xuICAgICAgICBcIlRoZSBmb2xkZXIgaXMgY3JlYXRlZCBhdXRvbWF0aWNhbGx5IGlmIGl0IGRvZXNuJ3QgZXhpc3QuIFwiICtcbiAgICAgICAgXCJFeGFtcGxlOiBWaWt1bmphLCBUYXNrcy9Qcm9qZWN0c1wiXG4gICAgICApXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIlZpa3VuamFcIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucHJvamVjdHNGb2xkZXIpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucHJvamVjdHNGb2xkZXIgPSB2YWx1ZS50cmltKCkucmVwbGFjZSgvXFwvKyQvLCBcIlwiKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgLy8gSGlkZSBmb2xkZXIgc2V0dGluZyB3aGVuIGF1dG8tY3JlYXRlIGlzIG9mZlxuICAgIGZvbGRlclNldHRpbmcuc2V0dGluZ0VsLnRvZ2dsZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvQ3JlYXRlUHJvamVjdEZpbGVzKTtcblxuICAgIC8vIFx1MjUwMFx1MjUwMCBTeW5jIEJlaGF2aW91ciBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJTeW5jIEJlaGF2aW91clwiIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIlN5bmMgb24gc2F2ZVwiKVxuICAgICAgLnNldERlc2MoXCJBdXRvbWF0aWNhbGx5IHN5bmMgdGFza3Mgd2hlbiB5b3Ugc2F2ZSBhIG1hcmtkb3duIGZpbGUuXCIpXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XG4gICAgICAgIHRvZ2dsZVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zeW5jT25TYXZlKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnN5bmNPblNhdmUgPSB2YWx1ZTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIlN5bmMgaW50ZXJ2YWwgKHNlY29uZHMpXCIpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgXCJIb3cgb2Z0ZW4gdG8gcG9sbCBWaWt1bmphIGZvciByZW1vdGUgY2hhbmdlcy4gXCIgK1xuICAgICAgICBcIlNldCB0byAwIHRvIGRpc2FibGUgcG9sbGluZyAoc3luYyBvbiBzYXZlIG9ubHkpLlwiXG4gICAgICApXG4gICAgICAuYWRkU2xpZGVyKChzbGlkZXIpID0+XG4gICAgICAgIHNsaWRlclxuICAgICAgICAgIC5zZXRMaW1pdHMoMCwgMzYwMCwgMzApXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnN5bmNJbnRlcnZhbFNlY29uZHMpXG4gICAgICAgICAgLnNldER5bmFtaWNUb29sdGlwKClcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zeW5jSW50ZXJ2YWxTZWNvbmRzID0gdmFsdWU7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnJlc3RhcnRTeW5jSW50ZXJ2YWwoKTtcbiAgICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJTeW5jIGNvbXBsZXRlZCB0YXNrc1wiKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIFwiUHVsbCB0YXNrcyBjb21wbGV0ZWQgcmVtb3RlbHkgKGUuZy4gYnkgY29sbGFib3JhdG9ycykgYmFjayB0byBPYnNpZGlhbiBcIiArXG4gICAgICAgIFwiYW5kIG1hcmsgdGhlbSBhcyBbeF0uXCJcbiAgICAgIClcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT5cbiAgICAgICAgdG9nZ2xlXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnN5bmNDb21wbGV0ZWRUYXNrcylcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zeW5jQ29tcGxldGVkVGFza3MgPSB2YWx1ZTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgLy8gXHUyNTAwXHUyNTAwIEV4Y2x1c2lvbnMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiRXhjbHVzaW9uc1wiIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIkV4Y2x1ZGVkIGZvbGRlcnNcIilcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICBcIkZvbGRlcnMgdG8gZXhjbHVkZSBmcm9tIHRhc2sgc2Nhbm5pbmcsIG9uZSBwZXIgbGluZS4gXCIgK1xuICAgICAgICBcIlRhc2tzIGluIHRoZXNlIGZvbGRlcnMgd2lsbCBub3QgYmUgc3luY2VkIHRvIFZpa3VuamEuIFwiICtcbiAgICAgICAgXCJFeGFtcGxlOiBUZW1wbGF0ZXMsIEFyY2hpdmVcIlxuICAgICAgKVxuICAgICAgLmFkZFRleHRBcmVhKCh0ZXh0YXJlYSkgPT5cbiAgICAgICAgdGV4dGFyZWFcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJUZW1wbGF0ZXNcXG5BcmNoaXZlXFxuLnRyYXNoXCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmV4Y2x1ZGVkRm9sZGVycy5qb2luKFwiXFxuXCIpKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmV4Y2x1ZGVkRm9sZGVycyA9IHZhbHVlXG4gICAgICAgICAgICAgIC5zcGxpdChcIlxcblwiKVxuICAgICAgICAgICAgICAubWFwKChmKSA9PiBmLnRyaW0oKSlcbiAgICAgICAgICAgICAgLmZpbHRlcihCb29sZWFuKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgLy8gXHUyNTAwXHUyNTAwIFVJIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkludGVyZmFjZVwiIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIlNob3cgcmliYm9uIGljb25cIilcbiAgICAgIC5zZXREZXNjKFwiU2hvdyB0aGUgVmlrdW5qYSBzeW5jIGJ1dHRvbiBpbiB0aGUgbGVmdCBzaWRlYmFyIHJpYmJvbi5cIilcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT5cbiAgICAgICAgdG9nZ2xlXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnNob3dSaWJib25JY29uKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNob3dSaWJib25JY29uID0gdmFsdWU7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIC8vIFJpYmJvbiBjaGFuZ2VzIHJlcXVpcmUgcmVsb2FkXG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiUmVsb2FkIE9ic2lkaWFuIHRvIGFwcGx5IHJpYmJvbiBjaGFuZ2VzLlwiKTtcbiAgICAgICAgICB9KVxuICAgICAgKTtcbiAgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQVlBLElBQUFBLG1CQUtPOzs7QUNlQSxJQUFNLHNCQUFOLGNBQWtDLE1BQU07QUFBQSxFQUM3QyxZQUNrQixRQUNBLFVBQ2hCLFNBQ0E7QUFDQSxVQUFNLE9BQU87QUFKRztBQUNBO0FBSWhCLFNBQUssT0FBTztBQUFBLEVBQ2Q7QUFDRjtBQUlPLElBQU0sZ0JBQU4sTUFBb0I7QUFBQSxFQUNSO0FBQUEsRUFDQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNakIsWUFBWSxTQUFpQixPQUFlO0FBRTFDLFNBQUssVUFBVSxRQUFRLFFBQVEsT0FBTyxFQUFFO0FBQ3hDLFNBQUssUUFBUTtBQUFBLEVBQ2Y7QUFBQTtBQUFBO0FBQUEsRUFLUSxJQUFJLE1BQXNCO0FBQ2hDLFdBQU8sR0FBRyxLQUFLLE9BQU8sVUFBVSxJQUFJO0FBQUEsRUFDdEM7QUFBQTtBQUFBLEVBR0EsSUFBWSxVQUFrQztBQUM1QyxXQUFPO0FBQUEsTUFDTCxlQUFlLFVBQVUsS0FB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QUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRQSxvQkFBMEI7QUFDeEIsU0FBSyxpQkFBaUI7QUFFdEIsUUFBSSxLQUFLLFNBQVMsdUJBQXVCO0FBQUc7QUFFNUMsU0FBSyxxQkFBcUIsT0FBTyxZQUFZLFlBQVk7QUFDdkQsVUFBSSxLQUFLLFlBQVk7QUFDbkIsY0FBTSxLQUFLLFlBQVk7QUFBQSxNQUN6QjtBQUFBLElBQ0YsR0FBRyxLQUFLLFNBQVMsc0JBQXNCLEdBQUk7QUFBQSxFQUM3QztBQUFBO0FBQUEsRUFHQSxtQkFBeUI7QUFDdkIsUUFBSSxLQUFLLHVCQUF1QixNQUFNO0FBQ3BDLGFBQU8sY0FBYyxLQUFLLGtCQUFrQjtBQUM1QyxXQUFLLHFCQUFxQjtBQUFBLElBQzVCO0FBQUEsRUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0Esc0JBQTRCO0FBQzFCLFNBQUssa0JBQWtCO0FBQUEsRUFDekI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVUEsTUFBYyxrQkFBa0IsS0FBZ0M7QUFDOUQsVUFBTSxTQUFTLElBQUk7QUFHbkIsUUFDRSxPQUFPLFlBQVksV0FDbEIsT0FBNEIsU0FBUyxjQUN0QyxDQUFDLE9BQU8sUUFBUSxtQkFBbUIsR0FDbkM7QUFDQTtBQUFBLElBQ0Y7QUFFQSxRQUFJLENBQUMsS0FBSztBQUFZO0FBR3RCLFVBQU0sT0FBTyxLQUFLLElBQUksVUFBVTtBQUFBLE9BQzdCLE1BQU0sT0FBTyxVQUFVLEdBQUc7QUFBQSxJQUM3QjtBQUVBLFFBQUksQ0FBQyxNQUFNO0FBQU07QUFHakIsVUFBTSxXQUFXLE9BQU8sUUFBUSxJQUFJO0FBQ3BDLFFBQUksQ0FBQztBQUFVO0FBR2YsVUFBTSxVQUFVLE1BQU0sS0FBSyxJQUFJLE1BQU0sS0FBSyxLQUFLLElBQUk7QUFDbkQsVUFBTSxRQUFRLFFBQVEsTUFBTSxJQUFJO0FBQ2hDLFVBQU0sT0FBUSxPQUE0QjtBQUcxQyxVQUFNLFdBQVcsU0FBUyxhQUFhLEtBQUssS0FBSztBQUNqRCxVQUFNLGFBQWEsTUFBTSxVQUFVLENBQUMsU0FBUztBQUMzQyxVQUFJLENBQUMsS0FBSyxTQUFTLEdBQUcsS0FBSyxDQUFDLEtBQUssU0FBUyxHQUFHO0FBQUcsZUFBTztBQUV2RCxZQUFNLFdBQVcsS0FBSyxRQUFRLHlCQUF5QixFQUFFLEVBQUUsS0FBSztBQUNoRSxhQUFPLFNBQVMsV0FBVyxTQUFTLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFBQSxJQUNsRCxDQUFDO0FBRUQsUUFBSSxlQUFlO0FBQUk7QUFFdkIsVUFBTSxLQUFLLFdBQVcscUJBQXFCLEtBQUssTUFBTSxZQUFZLElBQUk7QUFBQSxFQUN4RTtBQUNGOyIsCiAgIm5hbWVzIjogWyJpbXBvcnRfb2JzaWRpYW4iXQp9Cg==
