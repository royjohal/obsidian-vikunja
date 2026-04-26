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
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2e4);
    let response;
    try {
      response = await fetch(this.url(path), {
        ...options,
        signal: controller.signal,
        headers: { ...this.headers, ...options.headers ?? {} }
      });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new VikunjaRequestError(0, null, `Request timed out: ${path}`);
      }
      throw err;
    } finally {
      window.clearTimeout(timer);
    }
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
var VIKUNJA_ID_REGEX = /%%vikunja:(\d+)%%|<!--vikunja:(\d+)-->/;
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
    const vikunjaId = vikunjaMatch ? parseInt(vikunjaMatch[1] ?? vikunjaMatch[2], 10) : null;
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
    t = t.replace(/%%vikunja:\d+%%/g, "");
    t = t.replace(/<!--vikunja:\d+-->/g, "");
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
  /** Prevents overlapping sync runs — if a sync is already in progress, new ones are skipped */
  isSyncing = false;
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
    if (this.isSyncing) {
      new import_obsidian2.Notice("\u23F3 Vikunja: Sync already in progress.");
      return;
    }
    this.isSyncing = true;
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
    } finally {
      this.isSyncing = false;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL2FwaS9WaWt1bmphQ2xpZW50LnRzIiwgInNyYy90eXBlcy50cyIsICJzcmMvc3luYy9UYXNrUGFyc2VyLnRzIiwgInNyYy9zeW5jL1N5bmNFbmdpbmUudHMiLCAic3JjL3VpL1NldHRpbmdzVGFiLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcbiAqIEBmaWxlIG1haW4udHNcbiAqIEBkZXNjcmlwdGlvbiBFbnRyeSBwb2ludCBmb3IgdGhlIFZpa3VuamEgU3luYyBPYnNpZGlhbiBwbHVnaW4uXG4gKlxuICogUmVzcG9uc2liaWxpdGllczpcbiAqIC0gUGx1Z2luIGxpZmVjeWNsZSAob25sb2FkIC8gb251bmxvYWQpXG4gKiAtIFdpcmluZyB0b2dldGhlciB0aGUgQVBJIGNsaWVudCwgc3luYyBlbmdpbmUsIGFuZCBVSVxuICogLSBSZWdpc3RlcmluZyBldmVudCBsaXN0ZW5lcnMgKGZpbGUtc2F2ZSwgZWRpdG9yLWNsaWNrKVxuICogLSBNYW5hZ2luZyB0aGUgcGVyaW9kaWMgc3luYyBpbnRlcnZhbFxuICogLSBFeHBvc2luZyBjb21tYW5kcyB0byB0aGUgT2JzaWRpYW4gY29tbWFuZCBwYWxldHRlXG4gKi9cblxuaW1wb3J0IHtcbiAgUGx1Z2luLFxuICBOb3RpY2UsXG4gIFRGaWxlLFxuICB0eXBlIE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQsXG59IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBWaWt1bmphQ2xpZW50IH0gZnJvbSBcIi4vYXBpL1Zpa3VuamFDbGllbnRcIjtcbmltcG9ydCB7IFN5bmNFbmdpbmUgfSBmcm9tIFwiLi9zeW5jL1N5bmNFbmdpbmVcIjtcbmltcG9ydCB7IFZpa3VuamFTZXR0aW5nc1RhYiB9IGZyb20gXCIuL3VpL1NldHRpbmdzVGFiXCI7XG5pbXBvcnQge1xuICBERUZBVUxUX1NFVFRJTkdTLFxuICB0eXBlIFZpa3VuamFQbHVnaW5TZXR0aW5ncyxcbn0gZnJvbSBcIi4vdHlwZXNcIjtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgVmlrdW5qYVBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG4gIC8qKiBQZXJzaXN0ZWQgcGx1Z2luIHNldHRpbmdzICovXG4gIHNldHRpbmdzITogVmlrdW5qYVBsdWdpblNldHRpbmdzO1xuXG4gIC8qKiBIVFRQIGNsaWVudCBmb3IgdGhlIFZpa3VuamEgQVBJIFx1MjAxNCBudWxsIHVudGlsIHNldHRpbmdzIGFyZSBjb25maWd1cmVkICovXG4gIGNsaWVudDogVmlrdW5qYUNsaWVudCB8IG51bGwgPSBudWxsO1xuXG4gIC8qKiBTeW5jIGVuZ2luZSBcdTIwMTQgbnVsbCB1bnRpbCBjbGllbnQgaXMgcmVhZHkgKi9cbiAgcHJpdmF0ZSBzeW5jRW5naW5lOiBTeW5jRW5naW5lIHwgbnVsbCA9IG51bGw7XG5cbiAgLyoqIEhhbmRsZSBmb3IgdGhlIHBlcmlvZGljIHN5bmMgaW50ZXJ2YWwgc28gd2UgY2FuIGNsZWFyL3Jlc3RhcnQgaXQgKi9cbiAgcHJpdmF0ZSBzeW5jSW50ZXJ2YWxIYW5kbGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG4gIC8qKiBQcmV2ZW50cyBvdmVybGFwcGluZyBzeW5jIHJ1bnMgXHUyMDE0IGlmIGEgc3luYyBpcyBhbHJlYWR5IGluIHByb2dyZXNzLCBuZXcgb25lcyBhcmUgc2tpcHBlZCAqL1xuICBwcml2YXRlIGlzU3luY2luZyA9IGZhbHNlO1xuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBMaWZlY3ljbGUgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgYXN5bmMgb25sb2FkKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnNvbGUubG9nKFwiW1Zpa3VuamFdIFBsdWdpbiBsb2FkaW5nXHUyMDI2XCIpO1xuXG4gICAgLy8gTG9hZCBwZXJzaXN0ZWQgc2V0dGluZ3NcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xuXG4gICAgLy8gSW5pdGlhbGlzZSBBUEkgY2xpZW50IGlmIGNyZWRlbnRpYWxzIGFyZSBwcmVzZW50XG4gICAgdGhpcy5pbml0Q2xpZW50KCk7XG5cbiAgICAvLyBSZWdpc3RlciBzZXR0aW5ncyB0YWJcbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IFZpa3VuamFTZXR0aW5nc1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG4gICAgLy8gUmVnaXN0ZXIgcmliYm9uIGljb25cbiAgICBpZiAodGhpcy5zZXR0aW5ncy5zaG93UmliYm9uSWNvbikge1xuICAgICAgdGhpcy5hZGRSaWJib25JY29uKFwicmVmcmVzaC1jd1wiLCBcIlN5bmMgVmlrdW5qYSB0YXNrc1wiLCBhc3luYyAoKSA9PiB7XG4gICAgICAgIGF3YWl0IHRoaXMucnVuRnVsbFN5bmMoKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFJlZ2lzdGVyIGNvbW1hbmRzXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInN5bmMtYWxsXCIsXG4gICAgICBuYW1lOiBcIlN5bmMgYWxsIHRhc2tzIHdpdGggVmlrdW5qYVwiLFxuICAgICAgY2FsbGJhY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgYXdhaXQgdGhpcy5ydW5GdWxsU3luYygpO1xuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJzeW5jLWN1cnJlbnQtZmlsZVwiLFxuICAgICAgbmFtZTogXCJTeW5jIGN1cnJlbnQgZmlsZSB3aXRoIFZpa3VuamFcIixcbiAgICAgIGVkaXRvckNhbGxiYWNrOiBhc3luYyAoZWRpdG9yLCB2aWV3KSA9PiB7XG4gICAgICAgIGlmICh2aWV3LmZpbGUpIGF3YWl0IHRoaXMuc3luY0ZpbGUodmlldy5maWxlKTtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBSZWdpc3RlciBmaWxlLXNhdmUgaGFuZGxlclxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLnZhdWx0Lm9uKFwibW9kaWZ5XCIsIGFzeW5jIChmaWxlKSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLnNldHRpbmdzLnN5bmNPblNhdmUgJiZcbiAgICAgICAgICB0aGlzLnN5bmNFbmdpbmUgJiZcbiAgICAgICAgICBmaWxlIGluc3RhbmNlb2YgVEZpbGUgJiZcbiAgICAgICAgICBmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiXG4gICAgICAgICkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuc3luY0ZpbGUoZmlsZSk7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIFJlZ2lzdGVyIGVkaXRvciBjbGljayBoYW5kbGVyIGZvciBjaGVja2JveCB0b2dnbGVzXG4gICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KGRvY3VtZW50LCBcImNsaWNrXCIsIGFzeW5jIChldnQpID0+IHtcbiAgICAgIGF3YWl0IHRoaXMuaGFuZGxlRWRpdG9yQ2xpY2soZXZ0KTtcbiAgICB9KTtcblxuICAgIC8vIFN0YXJ0IHBlcmlvZGljIHN5bmNcbiAgICB0aGlzLnN0YXJ0U3luY0ludGVydmFsKCk7XG5cbiAgICBjb25zb2xlLmxvZyhcIltWaWt1bmphXSBQbHVnaW4gbG9hZGVkLlwiKTtcbiAgfVxuXG4gIG9udW5sb2FkKCk6IHZvaWQge1xuICAgIHRoaXMuc3RvcFN5bmNJbnRlcnZhbCgpO1xuICAgIGNvbnNvbGUubG9nKFwiW1Zpa3VuamFdIFBsdWdpbiB1bmxvYWRlZC5cIik7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgU2V0dGluZ3MgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgYXN5bmMgbG9hZFNldHRpbmdzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMuc2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVNldHRpbmdzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XG4gICAgLy8gUmUtaW5pdGlhbGlzZSBjbGllbnQgaW4gY2FzZSBVUkwvdG9rZW4gY2hhbmdlZFxuICAgIHRoaXMuaW5pdENsaWVudCgpO1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIENsaWVudCBJbml0aWFsaXNhdGlvbiBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICAvKipcbiAgICogSW5pdGlhbGlzZSAob3IgcmUtaW5pdGlhbGlzZSkgdGhlIEFQSSBjbGllbnQgYW5kIHN5bmMgZW5naW5lLlxuICAgKiBTYWZlIHRvIGNhbGwgbXVsdGlwbGUgdGltZXMgXHUyMDE0IHJlcGxhY2VzIGV4aXN0aW5nIGluc3RhbmNlcy5cbiAgICovXG4gIHByaXZhdGUgaW5pdENsaWVudCgpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MuYXBpVXJsIHx8ICF0aGlzLnNldHRpbmdzLmFwaVRva2VuKSB7XG4gICAgICB0aGlzLmNsaWVudCA9IG51bGw7XG4gICAgICB0aGlzLnN5bmNFbmdpbmUgPSBudWxsO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuY2xpZW50ID0gbmV3IFZpa3VuamFDbGllbnQodGhpcy5zZXR0aW5ncy5hcGlVcmwsIHRoaXMuc2V0dGluZ3MuYXBpVG9rZW4pO1xuICAgIHRoaXMuc3luY0VuZ2luZSA9IG5ldyBTeW5jRW5naW5lKHRoaXMuYXBwLCB0aGlzLmNsaWVudCwgdGhpcy5zZXR0aW5ncyk7XG4gIH1cblxuICAvKipcbiAgICogVGVzdCB0aGUgY3VycmVudCBjb25uZWN0aW9uIHNldHRpbmdzLlxuICAgKiBVc2VkIGJ5IHRoZSBzZXR0aW5ncyB0YWIgXCJUZXN0XCIgYnV0dG9uLlxuICAgKi9cbiAgYXN5bmMgdGVzdENvbm5lY3Rpb24oKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgICBpZiAoIXRoaXMuY2xpZW50KSB7XG4gICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFwiTm8gVVJMIG9yIHRva2VuIGNvbmZpZ3VyZWQuXCIgfTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuY2xpZW50LnRlc3RDb25uZWN0aW9uKCk7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgU3luYyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICAvKipcbiAgICogUnVuIGEgZnVsbCB2YXVsdCBzeW5jIGFuZCBkaXNwbGF5IGEgTm90aWNlIHdpdGggdGhlIHJlc3VsdC5cbiAgICovXG4gIGFzeW5jIHJ1bkZ1bGxTeW5jKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5zeW5jRW5naW5lKSB7XG4gICAgICBuZXcgTm90aWNlKFwiXHUyNkEwXHVGRTBGIFZpa3VuamE6IFBsZWFzZSBjb25maWd1cmUgeW91ciBBUEkgVVJMIGFuZCB0b2tlbiBpbiBzZXR0aW5ncy5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuaXNTeW5jaW5nKSB7XG4gICAgICBuZXcgTm90aWNlKFwiXHUyM0YzIFZpa3VuamE6IFN5bmMgYWxyZWFkeSBpbiBwcm9ncmVzcy5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5pc1N5bmNpbmcgPSB0cnVlO1xuICAgIGNvbnN0IG5vdGljZSA9IG5ldyBOb3RpY2UoXCJcdUQ4M0RcdUREMDQgVmlrdW5qYTogU3luY2luZ1x1MjAyNlwiLCAwKTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnN5bmNFbmdpbmUuc3luYygpO1xuICAgICAgbm90aWNlLmhpZGUoKTtcblxuICAgICAgY29uc3Qgc3VtbWFyeSA9IFtcbiAgICAgICAgcmVzdWx0LmNyZWF0ZWQgPiAwID8gYCR7cmVzdWx0LmNyZWF0ZWR9IGNyZWF0ZWRgIDogbnVsbCxcbiAgICAgICAgcmVzdWx0LnVwZGF0ZWQgPiAwID8gYCR7cmVzdWx0LnVwZGF0ZWR9IHVwZGF0ZWRgIDogbnVsbCxcbiAgICAgICAgcmVzdWx0LmNvbXBsZXRlZCA+IDAgPyBgJHtyZXN1bHQuY29tcGxldGVkfSBjb21wbGV0ZWRgIDogbnVsbCxcbiAgICAgIF1cbiAgICAgICAgLmZpbHRlcihCb29sZWFuKVxuICAgICAgICAuam9pbihcIiwgXCIpO1xuXG4gICAgICBpZiAocmVzdWx0LmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoYFx1MjZBMFx1RkUwRiBWaWt1bmphIHN5bmMgZmluaXNoZWQgd2l0aCBlcnJvcnM6XFxuJHtyZXN1bHQuZXJyb3JzLmpvaW4oXCJcXG5cIil9YCwgODAwMCk7XG4gICAgICB9IGVsc2UgaWYgKHN1bW1hcnkpIHtcbiAgICAgICAgbmV3IE5vdGljZShgXHUyNzA1IFZpa3VuamE6ICR7c3VtbWFyeX1gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXCJcdTI3MDUgVmlrdW5qYTogRXZlcnl0aGluZyB1cCB0byBkYXRlLlwiKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIG5vdGljZS5oaWRlKCk7XG4gICAgICBuZXcgTm90aWNlKGBcdTI3NEMgVmlrdW5qYSBzeW5jIGZhaWxlZDogJHtTdHJpbmcoZXJyKX1gLCA4MDAwKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5pc1N5bmNpbmcgPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU3luYyBhIHNpbmdsZSBmaWxlIFx1MjAxNCBjYWxsZWQgb24gZmlsZS1zYXZlIGV2ZW50cy5cbiAgICogUnVucyBzaWxlbnRseSAobm8gTm90aWNlKSB0byBhdm9pZCBpbnRlcnJ1cHRpbmcgdGhlIHVzZXIuXG4gICAqL1xuICBhc3luYyBzeW5jRmlsZShmaWxlOiBURmlsZSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5zeW5jRW5naW5lKSByZXR1cm47XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zeW5jRW5naW5lLnN5bmNGaWxlKGZpbGUpO1xuICAgICAgaWYgKHJlc3VsdC5lcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiW1Zpa3VuamFdIFN5bmMgZXJyb3JzOlwiLCByZXN1bHQuZXJyb3JzKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJbVmlrdW5qYV0gRmlsZSBzeW5jIGVycm9yOlwiLCBlcnIpO1xuICAgIH1cbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBJbnRlcnZhbCBNYW5hZ2VtZW50IFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4gIC8qKlxuICAgKiBTdGFydCB0aGUgcGVyaW9kaWMgc3luYyBpbnRlcnZhbCBiYXNlZCBvbiBjdXJyZW50IHNldHRpbmdzLlxuICAgKiBJZiBpbnRlcnZhbCBpcyAwLCBkb2VzIG5vdGhpbmcuXG4gICAqL1xuICBzdGFydFN5bmNJbnRlcnZhbCgpOiB2b2lkIHtcbiAgICB0aGlzLnN0b3BTeW5jSW50ZXJ2YWwoKTtcblxuICAgIGlmICh0aGlzLnNldHRpbmdzLnN5bmNJbnRlcnZhbFNlY29uZHMgPD0gMCkgcmV0dXJuO1xuXG4gICAgdGhpcy5zeW5jSW50ZXJ2YWxIYW5kbGUgPSB3aW5kb3cuc2V0SW50ZXJ2YWwoYXN5bmMgKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuc3luY0VuZ2luZSkge1xuICAgICAgICBhd2FpdCB0aGlzLnJ1bkZ1bGxTeW5jKCk7XG4gICAgICB9XG4gICAgfSwgdGhpcy5zZXR0aW5ncy5zeW5jSW50ZXJ2YWxTZWNvbmRzICogMTAwMCk7XG4gIH1cblxuICAvKiogU3RvcCB0aGUgY3VycmVudCBzeW5jIGludGVydmFsIGlmIHJ1bm5pbmcgKi9cbiAgc3RvcFN5bmNJbnRlcnZhbCgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5zeW5jSW50ZXJ2YWxIYW5kbGUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jbGVhckludGVydmFsKHRoaXMuc3luY0ludGVydmFsSGFuZGxlKTtcbiAgICAgIHRoaXMuc3luY0ludGVydmFsSGFuZGxlID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmVzdGFydCB0aGUgc3luYyBpbnRlcnZhbCBcdTIwMTQgY2FsbGVkIHdoZW4gaW50ZXJ2YWwgc2V0dGluZyBjaGFuZ2VzLlxuICAgKi9cbiAgcmVzdGFydFN5bmNJbnRlcnZhbCgpOiB2b2lkIHtcbiAgICB0aGlzLnN0YXJ0U3luY0ludGVydmFsKCk7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgRWRpdG9yIEludGVyYWN0aW9uIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4gIC8qKlxuICAgKiBIYW5kbGUgY2xpY2tzIGluIHRoZSBlZGl0b3IgdG8gZGV0ZWN0IGNoZWNrYm94IHRvZ2dsZXMuXG4gICAqIEludGVyY2VwdHMgY2xpY2tzIG9uIHRhc2sgY2hlY2tib3hlcyBpbiByZWFkaW5nIHZpZXcgYW5kIGxpdmUgcHJldmlldy5cbiAgICpcbiAgICogQHBhcmFtIGV2dCAtIERPTSBjbGljayBldmVudFxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVFZGl0b3JDbGljayhldnQ6IE1vdXNlRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCB0YXJnZXQgPSBldnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXG4gICAgLy8gT25seSBjYXJlIGFib3V0IGNoZWNrYm94ZXMgaW5zaWRlIHRhc2sgbGlzdCBpdGVtc1xuICAgIGlmIChcbiAgICAgIHRhcmdldC50YWdOYW1lICE9PSBcIklOUFVUXCIgfHxcbiAgICAgICh0YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudHlwZSAhPT0gXCJjaGVja2JveFwiIHx8XG4gICAgICAhdGFyZ2V0LmNsb3Nlc3QoXCJsaS50YXNrLWxpc3QtaXRlbVwiKVxuICAgICkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zeW5jRW5naW5lKSByZXR1cm47XG5cbiAgICAvLyBGaW5kIHdoaWNoIGZpbGUgdGhpcyBjaGVja2JveCBiZWxvbmdzIHRvXG4gICAgY29uc3QgdmlldyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKFxuICAgICAgKGF3YWl0IGltcG9ydChcIm9ic2lkaWFuXCIpKS5NYXJrZG93blZpZXdcbiAgICApO1xuXG4gICAgaWYgKCF2aWV3Py5maWxlKSByZXR1cm47XG5cbiAgICAvLyBGaW5kIHRoZSBsaW5lIG51bWJlciBieSBsb29raW5nIGF0IHRoZSBET00gY29udGV4dFxuICAgIGNvbnN0IGxpc3RJdGVtID0gdGFyZ2V0LmNsb3Nlc3QoXCJsaVwiKTtcbiAgICBpZiAoIWxpc3RJdGVtKSByZXR1cm47XG5cbiAgICAvLyBSZWFkIHRoZSBmaWxlIGFuZCBmaW5kIHRoZSBtYXRjaGluZyB0YXNrIGxpbmVcbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZCh2aWV3LmZpbGUpO1xuICAgIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdChcIlxcblwiKTtcbiAgICBjb25zdCBkb25lID0gKHRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkO1xuXG4gICAgLy8gRmluZCB0aGUgbGluZSBieSBtYXRjaGluZyB0aGUgdGV4dCBjb250ZW50IG9mIHRoZSBsaXN0IGl0ZW1cbiAgICBjb25zdCBpdGVtVGV4dCA9IGxpc3RJdGVtLnRleHRDb250ZW50Py50cmltKCkgPz8gXCJcIjtcbiAgICBjb25zdCBsaW5lTnVtYmVyID0gbGluZXMuZmluZEluZGV4KChsaW5lKSA9PiB7XG4gICAgICBpZiAoIWxpbmUuaW5jbHVkZXMoXCJbXCIpIHx8ICFsaW5lLmluY2x1ZGVzKFwiXVwiKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgLy8gU3RyaXAgdGhlIGNoZWNrYm94IHN5bnRheCB0byBjb21wYXJlIHdpdGggRE9NIHRleHRcbiAgICAgIGNvbnN0IHN0cmlwcGVkID0gbGluZS5yZXBsYWNlKC9eW1xcc1xcLSpdK1xcW1t4IF1cXF1cXHMqL2ksIFwiXCIpLnRyaW0oKTtcbiAgICAgIHJldHVybiBpdGVtVGV4dC5zdGFydHNXaXRoKHN0cmlwcGVkLnNsaWNlKDAsIDMwKSk7XG4gICAgfSk7XG5cbiAgICBpZiAobGluZU51bWJlciA9PT0gLTEpIHJldHVybjtcblxuICAgIGF3YWl0IHRoaXMuc3luY0VuZ2luZS5oYW5kbGVDaGVja2JveFRvZ2dsZSh2aWV3LmZpbGUsIGxpbmVOdW1iZXIsIGRvbmUpO1xuICB9XG59XG4iLCAiLyoqXG4gKiBAZmlsZSBhcGkvVmlrdW5qYUNsaWVudC50c1xuICogQGRlc2NyaXB0aW9uIFR5cGVkIEhUVFAgY2xpZW50IGZvciB0aGUgVmlrdW5qYSBSRVNUIEFQSS5cbiAqXG4gKiBBbGwgQVBJIGNvbW11bmljYXRpb24gZ29lcyB0aHJvdWdoIHRoaXMgY2xhc3MuIEl0IGhhbmRsZXM6XG4gKiAtIEF1dGhlbnRpY2F0aW9uIHZpYSBCZWFyZXIgdG9rZW5cbiAqIC0gUmVxdWVzdC9yZXNwb25zZSB0eXBpbmdcbiAqIC0gRXJyb3IgaGFuZGxpbmcgYW5kIG5vcm1hbGlzYXRpb25cbiAqIC0gUmF0ZSBsaW1pdGluZyBhd2FyZW5lc3NcbiAqXG4gKiBVc2FnZTpcbiAqICAgY29uc3QgY2xpZW50ID0gbmV3IFZpa3VuamFDbGllbnQoXCJodHRwczovL3Zpa3VuamEuZXhhbXBsZS5jb21cIiwgXCJteS10b2tlblwiKTtcbiAqICAgY29uc3QgdGFza3MgPSBhd2FpdCBjbGllbnQuZ2V0UHJvamVjdFRhc2tzKDEpO1xuICovXG5cbmltcG9ydCB0eXBlIHtcbiAgVmlrdW5qYVRhc2ssXG4gIFZpa3VuamFQcm9qZWN0LFxuICBWaWt1bmphTGFiZWwsXG4gIENyZWF0ZVRhc2tQYXlsb2FkLFxuICBVcGRhdGVUYXNrUGF5bG9hZCxcbn0gZnJvbSBcIi4uL3R5cGVzXCI7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBFcnJvciBUeXBlcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuLyoqIFN0cnVjdHVyZWQgZXJyb3IgcmV0dXJuZWQgYnkgdGhlIFZpa3VuamEgQVBJICovXG5leHBvcnQgaW50ZXJmYWNlIFZpa3VuamFBcGlFcnJvciB7XG4gIGNvZGU6IG51bWJlcjtcbiAgbWVzc2FnZTogc3RyaW5nO1xufVxuXG4vKiogVGhyb3duIHdoZW4gYW4gQVBJIHJlcXVlc3QgZmFpbHMgKi9cbmV4cG9ydCBjbGFzcyBWaWt1bmphUmVxdWVzdEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihcbiAgICBwdWJsaWMgcmVhZG9ubHkgc3RhdHVzOiBudW1iZXIsXG4gICAgcHVibGljIHJlYWRvbmx5IGFwaUVycm9yOiBWaWt1bmphQXBpRXJyb3IgfCBudWxsLFxuICAgIG1lc3NhZ2U6IHN0cmluZ1xuICApIHtcbiAgICBzdXBlcihtZXNzYWdlKTtcbiAgICB0aGlzLm5hbWUgPSBcIlZpa3VuamFSZXF1ZXN0RXJyb3JcIjtcbiAgfVxufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgQ2xpZW50IFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5leHBvcnQgY2xhc3MgVmlrdW5qYUNsaWVudCB7XG4gIHByaXZhdGUgcmVhZG9ubHkgYmFzZVVybDogc3RyaW5nO1xuICBwcml2YXRlIHJlYWRvbmx5IHRva2VuOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBwYXJhbSBiYXNlVXJsIC0gVmlrdW5qYSBpbnN0YW5jZSBVUkwsIGUuZy4gaHR0cHM6Ly92aWt1bmphLmV4YW1wbGUuY29tXG4gICAqIEBwYXJhbSB0b2tlbiAgIC0gUGVyc29uYWwgYWNjZXNzIHRva2VuIGZyb20gVmlrdW5qYSBBY2NvdW50IFNldHRpbmdzXG4gICAqL1xuICBjb25zdHJ1Y3RvcihiYXNlVXJsOiBzdHJpbmcsIHRva2VuOiBzdHJpbmcpIHtcbiAgICAvLyBOb3JtYWxpc2U6IHN0cmlwIHRyYWlsaW5nIHNsYXNoIHNvIHdlIGNhbiBhbHdheXMgYXBwZW5kIC9hcGkvdjEvLi4uXG4gICAgdGhpcy5iYXNlVXJsID0gYmFzZVVybC5yZXBsYWNlKC9cXC8kLywgXCJcIik7XG4gICAgdGhpcy50b2tlbiA9IHRva2VuO1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFByaXZhdGUgSGVscGVycyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICAvKiogQnVpbGQgdGhlIGZ1bGwgQVBJIFVSTCBmb3IgYSBnaXZlbiBwYXRoICovXG4gIHByaXZhdGUgdXJsKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGAke3RoaXMuYmFzZVVybH0vYXBpL3YxJHtwYXRofWA7XG4gIH1cblxuICAvKiogU3RhbmRhcmQgaGVhZGVycyBzZW50IHdpdGggZXZlcnkgcmVxdWVzdCAqL1xuICBwcml2YXRlIGdldCBoZWFkZXJzKCk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuICAgIHJldHVybiB7XG4gICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7dGhpcy50b2tlbn1gLFxuICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb3JlIGZldGNoIHdyYXBwZXIuIEhhbmRsZXMgbm9uLTJ4eCByZXNwb25zZXMgYnkgdGhyb3dpbmcgVmlrdW5qYVJlcXVlc3RFcnJvci5cbiAgICogQHBhcmFtIHBhdGggICAgLSBBUEkgcGF0aCwgZS5nLiAvcHJvamVjdHMvMS90YXNrc1xuICAgKiBAcGFyYW0gb3B0aW9ucyAtIFN0YW5kYXJkIFJlcXVlc3RJbml0IG9wdGlvbnNcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgcmVxdWVzdDxUPihwYXRoOiBzdHJpbmcsIG9wdGlvbnM6IFJlcXVlc3RJbml0ID0ge30pOiBQcm9taXNlPFQ+IHtcbiAgICAvLyBBYm9ydCBhZnRlciAyMCBzIFx1MjAxNCBwcmV2ZW50cyBzeW5jIGZyb20gaGFuZ2luZyBmb3JldmVyIG9uIGEgc2xvdy91bnJlc3BvbnNpdmUgc2VydmVyXG4gICAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBjb25zdCB0aW1lciA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IGNvbnRyb2xsZXIuYWJvcnQoKSwgMjBfMDAwKTtcblxuICAgIGxldCByZXNwb25zZTogUmVzcG9uc2U7XG4gICAgdHJ5IHtcbiAgICAgIHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godGhpcy51cmwocGF0aCksIHtcbiAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgc2lnbmFsOiBjb250cm9sbGVyLnNpZ25hbCxcbiAgICAgICAgaGVhZGVyczogeyAuLi50aGlzLmhlYWRlcnMsIC4uLihvcHRpb25zLmhlYWRlcnMgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPiA/PyB7fSkgfSxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgaWYgKChlcnIgYXMgRXJyb3IpLm5hbWUgPT09IFwiQWJvcnRFcnJvclwiKSB7XG4gICAgICAgIHRocm93IG5ldyBWaWt1bmphUmVxdWVzdEVycm9yKDAsIG51bGwsIGBSZXF1ZXN0IHRpbWVkIG91dDogJHtwYXRofWApO1xuICAgICAgfVxuICAgICAgdGhyb3cgZXJyO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICB9XG5cbiAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICBsZXQgYXBpRXJyb3I6IFZpa3VuamFBcGlFcnJvciB8IG51bGwgPSBudWxsO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXBpRXJyb3IgPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgVmlrdW5qYUFwaUVycm9yO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIFJlc3BvbnNlIGJvZHkgd2Fzbid0IEpTT04gXHUyMDE0IHRoYXQncyBmaW5lXG4gICAgICB9XG4gICAgICB0aHJvdyBuZXcgVmlrdW5qYVJlcXVlc3RFcnJvcihcbiAgICAgICAgcmVzcG9uc2Uuc3RhdHVzLFxuICAgICAgICBhcGlFcnJvcixcbiAgICAgICAgYXBpRXJyb3I/Lm1lc3NhZ2UgPz8gYEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9IG9uICR7cGF0aH1gXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIDIwNCBObyBDb250ZW50IFx1MjAxNCByZXR1cm4gZW1wdHkgb2JqZWN0XG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gMjA0KSByZXR1cm4ge30gYXMgVDtcblxuICAgIHJldHVybiByZXNwb25zZS5qc29uKCkgYXMgUHJvbWlzZTxUPjtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBDb25uZWN0aW9uIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4gIC8qKlxuICAgKiBUZXN0IGNvbm5lY3Rpdml0eSBhbmQgdG9rZW4gdmFsaWRpdHkuXG4gICAqIENhbGxzIC9pbmZvIHdoaWNoIGlzIHB1YmxpYywgdGhlbiAvdXNlciB3aGljaCByZXF1aXJlcyBhdXRoLlxuICAgKiBAcmV0dXJucyB0cnVlIGlmIGNvbm5lY3Rpb24gYW5kIGF1dGggYXJlIHZhbGlkXG4gICAqL1xuICBhc3luYyB0ZXN0Q29ubmVjdGlvbigpOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4ge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLnJlcXVlc3QoXCIvdXNlclwiKTtcbiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGlmIChlcnIgaW5zdGFuY2VvZiBWaWt1bmphUmVxdWVzdEVycm9yKSB7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycikgfTtcbiAgICB9XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgUHJvamVjdHMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgLyoqXG4gICAqIEZldGNoIGFsbCBwcm9qZWN0cyB0aGUgYXV0aGVudGljYXRlZCB1c2VyIGhhcyBhY2Nlc3MgdG8uXG4gICAqIEByZXR1cm5zIEFycmF5IG9mIFZpa3VuamEgcHJvamVjdHNcbiAgICovXG4gIGFzeW5jIGdldFByb2plY3RzKCk6IFByb21pc2U8VmlrdW5qYVByb2plY3RbXT4ge1xuICAgIHJldHVybiB0aGlzLnJlcXVlc3Q8VmlrdW5qYVByb2plY3RbXT4oXCIvcHJvamVjdHM/cGVyX3BhZ2U9NTAwXCIpO1xuICB9XG5cbiAgLyoqXG4gICAqIEZldGNoIGEgc2luZ2xlIHByb2plY3QgYnkgSUQuXG4gICAqIEBwYXJhbSBwcm9qZWN0SWQgLSBWaWt1bmphIHByb2plY3QgSURcbiAgICovXG4gIGFzeW5jIGdldFByb2plY3QocHJvamVjdElkOiBudW1iZXIpOiBQcm9taXNlPFZpa3VuamFQcm9qZWN0PiB7XG4gICAgcmV0dXJuIHRoaXMucmVxdWVzdDxWaWt1bmphUHJvamVjdD4oYC9wcm9qZWN0cy8ke3Byb2plY3RJZH1gKTtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBUYXNrcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICAvKipcbiAgICogRmV0Y2ggYWxsIHRhc2tzIGluIGEgcHJvamVjdC5cbiAgICogSGFuZGxlcyBwYWdpbmF0aW9uIGF1dG9tYXRpY2FsbHkgXHUyMDE0IGZldGNoZXMgYWxsIHBhZ2VzLlxuICAgKiBAcGFyYW0gcHJvamVjdElkIC0gVmlrdW5qYSBwcm9qZWN0IElEXG4gICAqL1xuICBhc3luYyBnZXRQcm9qZWN0VGFza3MocHJvamVjdElkOiBudW1iZXIpOiBQcm9taXNlPFZpa3VuamFUYXNrW10+IHtcbiAgICBjb25zdCBhbGxUYXNrczogVmlrdW5qYVRhc2tbXSA9IFtdO1xuICAgIGxldCBwYWdlID0gMTtcblxuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBjb25zdCB0YXNrcyA9IGF3YWl0IHRoaXMucmVxdWVzdDxWaWt1bmphVGFza1tdPihcbiAgICAgICAgYC9wcm9qZWN0cy8ke3Byb2plY3RJZH0vdGFza3M/cGVyX3BhZ2U9NTAmcGFnZT0ke3BhZ2V9YFxuICAgICAgKTtcbiAgICAgIGFsbFRhc2tzLnB1c2goLi4udGFza3MpO1xuICAgICAgaWYgKHRhc2tzLmxlbmd0aCA8IDUwKSBicmVhazsgLy8gTGFzdCBwYWdlXG4gICAgICBwYWdlKys7XG4gICAgfVxuXG4gICAgcmV0dXJuIGFsbFRhc2tzO1xuICB9XG5cbiAgLyoqXG4gICAqIEZldGNoIGFsbCB0YXNrcyBhY3Jvc3MgYWxsIHByb2plY3RzLlxuICAgKiBVc2VzIHRoZSAvdGFza3MvYWxsIGVuZHBvaW50IGZvciBlZmZpY2llbmN5LlxuICAgKiBAcGFyYW0gcGFnZSAtIFBhZ2UgbnVtYmVyICgxLWluZGV4ZWQpXG4gICAqL1xuICBhc3luYyBnZXRBbGxUYXNrcyhwYWdlID0gMSk6IFByb21pc2U8VmlrdW5qYVRhc2tbXT4ge1xuICAgIGNvbnN0IGFsbFRhc2tzOiBWaWt1bmphVGFza1tdID0gW107XG4gICAgbGV0IGN1cnJlbnRQYWdlID0gcGFnZTtcblxuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBjb25zdCB0YXNrcyA9IGF3YWl0IHRoaXMucmVxdWVzdDxWaWt1bmphVGFza1tdPihcbiAgICAgICAgYC90YXNrcy9hbGw/cGVyX3BhZ2U9NTAmcGFnZT0ke2N1cnJlbnRQYWdlfWBcbiAgICAgICk7XG4gICAgICBhbGxUYXNrcy5wdXNoKC4uLnRhc2tzKTtcbiAgICAgIGlmICh0YXNrcy5sZW5ndGggPCA1MCkgYnJlYWs7XG4gICAgICBjdXJyZW50UGFnZSsrO1xuICAgIH1cblxuICAgIHJldHVybiBhbGxUYXNrcztcbiAgfVxuXG4gIC8qKlxuICAgKiBGZXRjaCBhIHNpbmdsZSB0YXNrIGJ5IElELlxuICAgKiBAcGFyYW0gdGFza0lkIC0gVmlrdW5qYSB0YXNrIElEXG4gICAqL1xuICBhc3luYyBnZXRUYXNrKHRhc2tJZDogbnVtYmVyKTogUHJvbWlzZTxWaWt1bmphVGFzaz4ge1xuICAgIHJldHVybiB0aGlzLnJlcXVlc3Q8VmlrdW5qYVRhc2s+KGAvdGFza3MvJHt0YXNrSWR9YCk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IHRhc2sgaW4gYSBwcm9qZWN0LlxuICAgKiBAcGFyYW0gcHJvamVjdElkIC0gVGhlIHByb2plY3QgdG8gY3JlYXRlIHRoZSB0YXNrIGluXG4gICAqIEBwYXJhbSBwYXlsb2FkICAgLSBUYXNrIGRhdGFcbiAgICovXG4gIGFzeW5jIGNyZWF0ZVRhc2socHJvamVjdElkOiBudW1iZXIsIHBheWxvYWQ6IENyZWF0ZVRhc2tQYXlsb2FkKTogUHJvbWlzZTxWaWt1bmphVGFzaz4ge1xuICAgIHJldHVybiB0aGlzLnJlcXVlc3Q8VmlrdW5qYVRhc2s+KGAvcHJvamVjdHMvJHtwcm9qZWN0SWR9L3Rhc2tzYCwge1xuICAgICAgbWV0aG9kOiBcIlBVVFwiLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCksXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlIGFuIGV4aXN0aW5nIHRhc2suXG4gICAqIFVzZXMgUE9TVCBhcyBwZXIgVmlrdW5qYSBBUEkgY29udmVudGlvbi5cbiAgICogQHBhcmFtIHRhc2tJZCAgLSBUaGUgdGFzayB0byB1cGRhdGVcbiAgICogQHBhcmFtIHBheWxvYWQgLSBGaWVsZHMgdG8gdXBkYXRlIChwYXJ0aWFsIHVwZGF0ZSBzdXBwb3J0ZWQpXG4gICAqL1xuICBhc3luYyB1cGRhdGVUYXNrKHRhc2tJZDogbnVtYmVyLCBwYXlsb2FkOiBVcGRhdGVUYXNrUGF5bG9hZCk6IFByb21pc2U8VmlrdW5qYVRhc2s+IHtcbiAgICByZXR1cm4gdGhpcy5yZXF1ZXN0PFZpa3VuamFUYXNrPihgL3Rhc2tzLyR7dGFza0lkfWAsIHtcbiAgICAgIG1ldGhvZDogXCJQT1NUXCIsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkKSxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBNYXJrIGEgdGFzayBhcyBkb25lIG9yIG5vdCBkb25lLlxuICAgKiBDb252ZW5pZW5jZSB3cmFwcGVyIGFyb3VuZCB1cGRhdGVUYXNrLlxuICAgKiBAcGFyYW0gdGFza0lkIC0gVGhlIHRhc2sgdG8gdXBkYXRlXG4gICAqIEBwYXJhbSBkb25lICAgLSBXaGV0aGVyIHRoZSB0YXNrIGlzIGNvbXBsZXRlXG4gICAqL1xuICBhc3luYyBzZXRUYXNrRG9uZSh0YXNrSWQ6IG51bWJlciwgZG9uZTogYm9vbGVhbik6IFByb21pc2U8VmlrdW5qYVRhc2s+IHtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVUYXNrKHRhc2tJZCwgeyBkb25lIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIERlbGV0ZSBhIHRhc2sgcGVybWFuZW50bHkuXG4gICAqIEBwYXJhbSB0YXNrSWQgLSBUaGUgdGFzayB0byBkZWxldGVcbiAgICovXG4gIGFzeW5jIGRlbGV0ZVRhc2sodGFza0lkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCB0aGlzLnJlcXVlc3Q8dm9pZD4oYC90YXNrcy8ke3Rhc2tJZH1gLCB7IG1ldGhvZDogXCJERUxFVEVcIiB9KTtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBMYWJlbHMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgLyoqXG4gICAqIEZldGNoIGFsbCBsYWJlbHMgdGhlIGF1dGhlbnRpY2F0ZWQgdXNlciBoYXMgYWNjZXNzIHRvLlxuICAgKi9cbiAgYXN5bmMgZ2V0TGFiZWxzKCk6IFByb21pc2U8VmlrdW5qYUxhYmVsW10+IHtcbiAgICByZXR1cm4gdGhpcy5yZXF1ZXN0PFZpa3VuamFMYWJlbFtdPihcIi9sYWJlbHM/cGVyX3BhZ2U9NTAwXCIpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBhIGxhYmVsIHRvIGEgdGFzay5cbiAgICogQHBhcmFtIHRhc2tJZCAgLSBUaGUgdGFzayB0byBsYWJlbFxuICAgKiBAcGFyYW0gbGFiZWxJZCAtIFRoZSBsYWJlbCB0byBhcHBseVxuICAgKi9cbiAgYXN5bmMgYWRkTGFiZWxUb1Rhc2sodGFza0lkOiBudW1iZXIsIGxhYmVsSWQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMucmVxdWVzdDx2b2lkPihgL3Rhc2tzLyR7dGFza0lkfS9sYWJlbHNgLCB7XG4gICAgICBtZXRob2Q6IFwiUFVUXCIsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGxhYmVsX2lkOiBsYWJlbElkIH0pLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZSBhIGxhYmVsIGZyb20gYSB0YXNrLlxuICAgKiBAcGFyYW0gdGFza0lkICAtIFRoZSB0YXNrXG4gICAqIEBwYXJhbSBsYWJlbElkIC0gVGhlIGxhYmVsIHRvIHJlbW92ZVxuICAgKi9cbiAgYXN5bmMgcmVtb3ZlTGFiZWxGcm9tVGFzayh0YXNrSWQ6IG51bWJlciwgbGFiZWxJZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5yZXF1ZXN0PHZvaWQ+KGAvdGFza3MvJHt0YXNrSWR9L2xhYmVscy8ke2xhYmVsSWR9YCwge1xuICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxuICAgIH0pO1xuICB9XG59XG4iLCAiLyoqXG4gKiBAZmlsZSB0eXBlcy50c1xuICogQGRlc2NyaXB0aW9uIENvcmUgVHlwZVNjcmlwdCBpbnRlcmZhY2VzIHJlcHJlc2VudGluZyBWaWt1bmphIEFQSSBkYXRhIHNoYXBlcy5cbiAqIFRoZXNlIGFyZSB1c2VkIHRocm91Z2hvdXQgdGhlIHBsdWdpbiB0byBlbnN1cmUgdHlwZSBzYWZldHkgd2hlbiBjb21tdW5pY2F0aW5nXG4gKiB3aXRoIHRoZSBWaWt1bmphIEFQSSBhbmQgd2hlbiBzdG9yaW5nIHRhc2sgZGF0YSBsb2NhbGx5LlxuICovXG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBWaWt1bmphIEFQSSBUeXBlcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuLyoqIEEgVmlrdW5qYSBwcm9qZWN0IChmb3JtZXJseSBjYWxsZWQgXCJsaXN0XCIpICovXG5leHBvcnQgaW50ZXJmYWNlIFZpa3VuamFQcm9qZWN0IHtcbiAgaWQ6IG51bWJlcjtcbiAgdGl0bGU6IHN0cmluZztcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgaXNfYXJjaGl2ZWQ6IGJvb2xlYW47XG4gIGhleF9jb2xvcjogc3RyaW5nO1xuICBwYXJlbnRfcHJvamVjdF9pZDogbnVtYmVyO1xufVxuXG4vKiogQSBsYWJlbCB0aGF0IGNhbiBiZSBhcHBsaWVkIHRvIHRhc2tzICovXG5leHBvcnQgaW50ZXJmYWNlIFZpa3VuamFMYWJlbCB7XG4gIGlkOiBudW1iZXI7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGhleF9jb2xvcjogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xufVxuXG4vKiogQSB1c2VyIGFzc2lnbmVlIG9uIGEgdGFzayAqL1xuZXhwb3J0IGludGVyZmFjZSBWaWt1bmphVXNlciB7XG4gIGlkOiBudW1iZXI7XG4gIHVzZXJuYW1lOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgZW1haWw6IHN0cmluZztcbn1cblxuLyoqIEEgc2luZ2xlIFZpa3VuamEgdGFzayAqL1xuZXhwb3J0IGludGVyZmFjZSBWaWt1bmphVGFzayB7XG4gIGlkOiBudW1iZXI7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGRvbmU6IGJvb2xlYW47XG4gIGRvbmVfYXQ6IHN0cmluZyB8IG51bGw7XG4gIGR1ZV9kYXRlOiBzdHJpbmcgfCBudWxsO1xuICBzdGFydF9kYXRlOiBzdHJpbmcgfCBudWxsO1xuICBlbmRfZGF0ZTogc3RyaW5nIHwgbnVsbDtcbiAgcHJpb3JpdHk6IG51bWJlcjtcbiAgbGFiZWxzOiBWaWt1bmphTGFiZWxbXTtcbiAgYXNzaWduZWVzOiBWaWt1bmphVXNlcltdO1xuICBwcm9qZWN0X2lkOiBudW1iZXI7XG4gIGNyZWF0ZWQ6IHN0cmluZztcbiAgdXBkYXRlZDogc3RyaW5nO1xuICAvKiogVmlrdW5qYSdzIG51bGwgZGF0ZSBzZW50aW5lbCB2YWx1ZSAqL1xuICByZXBlYXRfYWZ0ZXI6IG51bWJlcjtcbiAgcGVyY2VudF9kb25lOiBudW1iZXI7XG59XG5cbi8qKiBQYXlsb2FkIGZvciBjcmVhdGluZyBhIG5ldyB0YXNrICovXG5leHBvcnQgaW50ZXJmYWNlIENyZWF0ZVRhc2tQYXlsb2FkIHtcbiAgdGl0bGU6IHN0cmluZztcbiAgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG4gIGRvbmU/OiBib29sZWFuO1xuICBkdWVfZGF0ZT86IHN0cmluZztcbiAgc3RhcnRfZGF0ZT86IHN0cmluZztcbiAgZW5kX2RhdGU/OiBzdHJpbmc7XG4gIHByaW9yaXR5PzogbnVtYmVyO1xuICBwcm9qZWN0X2lkPzogbnVtYmVyO1xuICAvKiogUmVwZWF0IGludGVydmFsIGluIHNlY29uZHMuIDAgPSBubyByZWN1cnJlbmNlLiAqL1xuICByZXBlYXRfYWZ0ZXI/OiBudW1iZXI7XG59XG5cbi8qKiBQYXlsb2FkIGZvciB1cGRhdGluZyBhbiBleGlzdGluZyB0YXNrICovXG5leHBvcnQgaW50ZXJmYWNlIFVwZGF0ZVRhc2tQYXlsb2FkIHtcbiAgdGl0bGU/OiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuICBkb25lPzogYm9vbGVhbjtcbiAgZHVlX2RhdGU/OiBzdHJpbmc7XG4gIHN0YXJ0X2RhdGU/OiBzdHJpbmc7XG4gIGVuZF9kYXRlPzogc3RyaW5nO1xuICBwcmlvcml0eT86IG51bWJlcjtcbiAgbGFiZWxzPzogVmlrdW5qYUxhYmVsW107XG4gIC8qKiBSZXBlYXQgaW50ZXJ2YWwgaW4gc2Vjb25kcy4gMCA9IG5vIHJlY3VycmVuY2UuICovXG4gIHJlcGVhdF9hZnRlcj86IG51bWJlcjtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFBsdWdpbiBJbnRlcm5hbCBUeXBlcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgdGFzayBhcyBwYXJzZWQgZnJvbSBhbiBPYnNpZGlhbiBtYXJrZG93biBmaWxlLlxuICogVGhpcyBpcyB0aGUgYnJpZGdlIGJldHdlZW4gT2JzaWRpYW4ncyBgLSBbIF1gIHN5bnRheCBhbmQgVmlrdW5qYSB0YXNrcy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBPYnNpZGlhblRhc2sge1xuICAvKiogUmF3IG1hcmtkb3duIGxpbmUsIGUuZy4gYC0gWyBdIE15IHRhc2sgXHVEODNEXHVEQ0M1IDIwMjYtMDQtMjBgICovXG4gIHJhd0xpbmU6IHN0cmluZztcbiAgLyoqIExpbmUgbnVtYmVyIGluIHRoZSBmaWxlICgwLWluZGV4ZWQpICovXG4gIGxpbmVOdW1iZXI6IG51bWJlcjtcbiAgLyoqIFRoZSBmaWxlIHBhdGggdGhpcyB0YXNrIHdhcyBmb3VuZCBpbiAqL1xuICBmaWxlUGF0aDogc3RyaW5nO1xuICAvKiogUGFyc2VkIHRhc2sgdGl0bGUgKHN0cmlwcGVkIG9mIG1ldGFkYXRhKSAqL1xuICB0aXRsZTogc3RyaW5nO1xuICAvKiogV2hldGhlciB0aGUgY2hlY2tib3ggaXMgY2hlY2tlZCAqL1xuICBkb25lOiBib29sZWFuO1xuICAvKiogUGFyc2VkIGR1ZSBkYXRlIGlmIHByZXNlbnQgKFx1RDgzRFx1RENDNSBlbW9qaSBzeW50YXgpICovXG4gIGR1ZURhdGU6IHN0cmluZyB8IG51bGw7XG4gIC8qKiBQYXJzZWQgc3RhcnQgZGF0ZSBpZiBwcmVzZW50IChcdUQ4M0RcdURFRUIgZW1vamkgc3ludGF4KSAqL1xuICBzdGFydERhdGU6IHN0cmluZyB8IG51bGw7XG4gIC8qKiBQYXJzZWQgc2NoZWR1bGVkIGRhdGUgaWYgcHJlc2VudCAoXHUyM0YzIGVtb2ppIHN5bnRheCkgKi9cbiAgc2NoZWR1bGVkRGF0ZTogc3RyaW5nIHwgbnVsbDtcbiAgLyoqIFByaW9yaXR5IGlmIHByZXNlbnQgKFx1RDgzRFx1REQzQSBoaWdoZXN0LCBcdTIzRUIgaGlnaCwgXHVEODNEXHVERDNDIG1lZGl1bSwgXHVEODNEXHVERDNEIGxvdykgKi9cbiAgcHJpb3JpdHk6IG51bWJlcjtcbiAgLyoqIFRoZSBWaWt1bmphIHRhc2sgSUQgaWYgdGhpcyB0YXNrIGhhcyBiZWVuIHN5bmNlZCAoc3RvcmVkIGFzIGlubGluZSBtZXRhZGF0YSkgKi9cbiAgdmlrdW5qYUlkOiBudW1iZXIgfCBudWxsO1xuICAvKiogVGhlIFZpa3VuamEgcHJvamVjdCBJRCBpbmZlcnJlZCBmcm9tIHRoZSBmaWxlJ3MgZnJvbnRtYXR0ZXIgb3IgZm9sZGVyICovXG4gIHByb2plY3RJZDogbnVtYmVyIHwgbnVsbDtcbiAgLyoqXG4gICAqIElubGluZSBwcm9qZWN0IG5hbWUgb3ZlcnJpZGUgcGFyc2VkIGZyb20gYEBwcm9qZWN0Ok5hbWVgIHN5bnRheC5cbiAgICogV2hlbiBwcmVzZW50LCB0aGlzIHRha2VzIHByZWNlZGVuY2Ugb3ZlciB0aGUgbm90ZSdzIGZyb250bWF0dGVyIGJpbmRpbmcuXG4gICAqIFN0cmlwcGVkIGZyb20gdGhlIHRhc2sgdGl0bGUgYmVmb3JlIHB1c2hpbmcgdG8gVmlrdW5qYS5cbiAgICovXG4gIHByb2plY3ROYW1lOiBzdHJpbmcgfCBudWxsO1xuICAvKipcbiAgICogUmVjdXJyZW5jZSBydWxlIHBhcnNlZCBmcm9tIGBcdUQ4M0RcdUREMDEgZXZlcnkgd2Vla2Agc3ludGF4LlxuICAgKiBTdG9yZWQgYXMgdGhlIGh1bWFuLXJlYWRhYmxlIHN0cmluZyAoZS5nLiBcImV2ZXJ5IHdlZWtcIikgYW5kIGNvbnZlcnRlZFxuICAgKiB0byBzZWNvbmRzIGZvciBWaWt1bmphJ3MgYHJlcGVhdF9hZnRlcmAgZmllbGQgd2hlbiBwdXNoaW5nLlxuICAgKi9cbiAgcmVjdXJyZW5jZTogc3RyaW5nIHwgbnVsbDtcbn1cblxuLyoqIFBsdWdpbiBzZXR0aW5ncyBzdG9yZWQgaW4gT2JzaWRpYW4ncyBkYXRhLmpzb24gKi9cbmV4cG9ydCBpbnRlcmZhY2UgVmlrdW5qYVBsdWdpblNldHRpbmdzIHtcbiAgLyoqIEJhc2UgVVJMIG9mIHlvdXIgVmlrdW5qYSBpbnN0YW5jZSwgZS5nLiBodHRwczovL3Zpa3VuamEuZXhhbXBsZS5jb20gKi9cbiAgYXBpVXJsOiBzdHJpbmc7XG4gIC8qKiBQZXJzb25hbCBhY2Nlc3MgdG9rZW4gZ2VuZXJhdGVkIGluIFZpa3VuamEgQWNjb3VudCBTZXR0aW5ncyAqL1xuICBhcGlUb2tlbjogc3RyaW5nO1xuICAvKiogSG93IG9mdGVuIHRvIHBvbGwgVmlrdW5qYSBmb3IgcmVtb3RlIGNoYW5nZXMsIGluIHNlY29uZHMuIDAgPSBkaXNhYmxlZCAqL1xuICBzeW5jSW50ZXJ2YWxTZWNvbmRzOiBudW1iZXI7XG4gIC8qKiBXaGV0aGVyIHRvIHN5bmMgdGFza3Mgb24gZmlsZSBzYXZlICovXG4gIHN5bmNPblNhdmU6IGJvb2xlYW47XG4gIC8qKiBEZWZhdWx0IHByb2plY3QgSUQgZm9yIHRhc2tzIGNyZWF0ZWQgd2l0aG91dCBhIHByb2plY3QgY29udGV4dCAqL1xuICBkZWZhdWx0UHJvamVjdElkOiBudW1iZXIgfCBudWxsO1xuICAvKiogV2hldGhlciB0byBzaG93IGEgcmliYm9uIGljb24gaW4gdGhlIHNpZGViYXIgKi9cbiAgc2hvd1JpYmJvbkljb246IGJvb2xlYW47XG4gIC8qKiBXaGV0aGVyIHRvIHN5bmMgY29tcGxldGVkIHRhc2tzIGJhY2sgdG8gT2JzaWRpYW4gKi9cbiAgc3luY0NvbXBsZXRlZFRhc2tzOiBib29sZWFuO1xuICAvKiogRm9sZGVycyB0byBleGNsdWRlIGZyb20gdGFzayBzY2FubmluZyAoY29tbWEtc2VwYXJhdGVkKSAqL1xuICBleGNsdWRlZEZvbGRlcnM6IHN0cmluZ1tdO1xuICAvKipcbiAgICogV2hlbiB0cnVlLCB0aGUgcGx1Z2luIGF1dG9tYXRpY2FsbHkgY3JlYXRlcyBvbmUgbWFya2Rvd24gZmlsZSBwZXJcbiAgICogVmlrdW5qYSBwcm9qZWN0IGluc2lkZSBgcHJvamVjdHNGb2xkZXJgLiBFYWNoIGZpbGUgaXMgcHJlLWNvbmZpZ3VyZWRcbiAgICogd2l0aCB0aGUgY29ycmVjdCBgdmlrdW5qYV9wcm9qZWN0X2lkYCBmcm9udG1hdHRlciBhbmQgYWN0cyBhcyB0aGVcbiAgICogY2Fub25pY2FsIHRhc2sgbGlzdCBmb3IgdGhhdCBwcm9qZWN0LlxuICAgKi9cbiAgYXV0b0NyZWF0ZVByb2plY3RGaWxlczogYm9vbGVhbjtcbiAgLyoqXG4gICAqIFZhdWx0LXJlbGF0aXZlIGZvbGRlciB3aGVyZSBhdXRvLWNyZWF0ZWQgcHJvamVjdCBmaWxlcyBhcmUgcGxhY2VkLlxuICAgKiBUaGUgZm9sZGVyIGlzIGNyZWF0ZWQgaWYgaXQgZG9lcyBub3QgZXhpc3QuXG4gICAqIE9ubHkgdXNlZCB3aGVuIGBhdXRvQ3JlYXRlUHJvamVjdEZpbGVzYCBpcyB0cnVlLlxuICAgKi9cbiAgcHJvamVjdHNGb2xkZXI6IHN0cmluZztcbn1cblxuLyoqIERlZmF1bHQgcGx1Z2luIHNldHRpbmdzICovXG5leHBvcnQgY29uc3QgREVGQVVMVF9TRVRUSU5HUzogVmlrdW5qYVBsdWdpblNldHRpbmdzID0ge1xuICBhcGlVcmw6IFwiXCIsXG4gIGFwaVRva2VuOiBcIlwiLFxuICBzeW5jSW50ZXJ2YWxTZWNvbmRzOiAzMDAsXG4gIHN5bmNPblNhdmU6IHRydWUsXG4gIGRlZmF1bHRQcm9qZWN0SWQ6IG51bGwsXG4gIHNob3dSaWJib25JY29uOiB0cnVlLFxuICBzeW5jQ29tcGxldGVkVGFza3M6IHRydWUsXG4gIGV4Y2x1ZGVkRm9sZGVyczogW10sXG4gIGF1dG9DcmVhdGVQcm9qZWN0RmlsZXM6IHRydWUsXG4gIHByb2plY3RzRm9sZGVyOiBcIlZpa3VuamFcIixcbn07XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBTeW5jIFN0YXRlIFR5cGVzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4vKiogUmVzdWx0IG9mIGEgc3luYyBvcGVyYXRpb24gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU3luY1Jlc3VsdCB7XG4gIGNyZWF0ZWQ6IG51bWJlcjtcbiAgdXBkYXRlZDogbnVtYmVyO1xuICBjb21wbGV0ZWQ6IG51bWJlcjtcbiAgZXJyb3JzOiBzdHJpbmdbXTtcbiAgdGltZXN0YW1wOiBEYXRlO1xufVxuXG4vKiogTWFwcyBhIFZpa3VuamEgdGFzayBJRCB0byBpdHMgbG9jYXRpb24gaW4gdGhlIHZhdWx0ICovXG5leHBvcnQgaW50ZXJmYWNlIFRhc2tMb2NhdGlvbiB7XG4gIGZpbGVQYXRoOiBzdHJpbmc7XG4gIGxpbmVOdW1iZXI6IG51bWJlcjtcbiAgdmlrdW5qYUlkOiBudW1iZXI7XG59XG5cbi8qKiBUaGUgbnVsbCBkYXRlIFZpa3VuamEgdXNlcyB3aGVuIG5vIGRhdGUgaXMgc2V0ICovXG5leHBvcnQgY29uc3QgVklLVU5KQV9OVUxMX0RBVEUgPSBcIjAwMDEtMDEtMDFUMDA6MDA6MDBaXCI7XG5cbi8qKiBQcmlvcml0eSBtYXBwaW5ncyBiZXR3ZWVuIE9ic2lkaWFuIGVtb2ppIHN5bnRheCBhbmQgVmlrdW5qYSBwcmlvcml0eSBudW1iZXJzICovXG5leHBvcnQgY29uc3QgUFJJT1JJVFlfTUFQOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge1xuICBcIlx1RDgzRFx1REQzQVwiOiA1LCAvLyBIaWdoZXN0XG4gIFwiXHUyM0VCXCI6IDQsIC8vIEhpZ2hcbiAgXCJcdUQ4M0RcdUREM0NcIjogMywgLy8gTWVkaXVtXG4gIFwiXHVEODNEXHVERDNEXCI6IDIsIC8vIExvd1xuICBcIlx1MjNFQ1wiOiAxLCAvLyBMb3dlc3Rcbn07XG5cbmV4cG9ydCBjb25zdCBQUklPUklUWV9NQVBfUkVWRVJTRTogUmVjb3JkPG51bWJlciwgc3RyaW5nPiA9IHtcbiAgNTogXCJcdUQ4M0RcdUREM0FcIixcbiAgNDogXCJcdTIzRUJcIixcbiAgMzogXCJcdUQ4M0RcdUREM0NcIixcbiAgMjogXCJcdUQ4M0RcdUREM0RcIixcbiAgMTogXCJcdTIzRUNcIixcbn07XG4iLCAiLyoqXG4gKiBAZmlsZSBzeW5jL1Rhc2tQYXJzZXIudHNcbiAqIEBkZXNjcmlwdGlvbiBQYXJzZXMgT2JzaWRpYW4gbWFya2Rvd24gdGFzayBzeW50YXggaW50byBzdHJ1Y3R1cmVkIE9ic2lkaWFuVGFzayBvYmplY3RzLFxuICogYW5kIHNlcmlhbGlzZXMgdGhlbSBiYWNrIHRvIG1hcmtkb3duLlxuICpcbiAqIFN1cHBvcnRlZCBzeW50YXggKG93biArIE9ic2lkaWFuIFRhc2tzIHBsdWdpbiBjb21wYXRpYmxlKTpcbiAqICAgLSBbIF0gVGFzayB0aXRsZSAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyMTkyIGluY29tcGxldGUgdGFza1xuICogICAtIFt4XSBUYXNrIHRpdGxlICAgICAgICAgICAgICAgICAgICAgICAgICBcdTIxOTIgY29tcGxldGUgdGFza1xuICogICAtIFsgXSBUYXNrIHRpdGxlIFx1RDgzRFx1RENDNSAyMDI2LTA0LTIwICAgICAgICAgICAgXHUyMTkyIGR1ZSBkYXRlXG4gKiAgIC0gWyBdIFRhc2sgdGl0bGUgXHVEODNEXHVERUVCIDIwMjYtMDQtMjAgICAgICAgICAgICBcdTIxOTIgc3RhcnQgZGF0ZVxuICogICAtIFsgXSBUYXNrIHRpdGxlIFx1MjNGMyAyMDI2LTA0LTIwICAgICAgICAgICAgXHUyMTkyIHNjaGVkdWxlZCBkYXRlXG4gKiAgIC0gWyBdIFRhc2sgdGl0bGUgXHVEODNEXHVERDAxIGV2ZXJ5IHdlZWsgICAgICAgICAgICBcdTIxOTIgcmVjdXJyZW5jZSBcdTIxOTIgVmlrdW5qYSByZXBlYXRfYWZ0ZXJcbiAqICAgLSBbIF0gVGFzayB0aXRsZSBcdUQ4M0RcdUREM0EgICAgICAgICAgICAgICAgICAgICAgIFx1MjE5MiBoaWdoZXN0IHByaW9yaXR5XG4gKiAgIC0gWyBdIFRhc2sgdGl0bGUgXHUyM0VCICAgICAgICAgICAgICAgICAgICAgICBcdTIxOTIgaGlnaCBwcmlvcml0eVxuICogICAtIFsgXSBUYXNrIHRpdGxlIFx1RDgzRFx1REQzQyAgICAgICAgICAgICAgICAgICAgICAgXHUyMTkyIG1lZGl1bSBwcmlvcml0eVxuICogICAtIFsgXSBUYXNrIHRpdGxlIFx1RDgzRFx1REQzRCAgICAgICAgICAgICAgICAgICAgICAgXHUyMTkyIGxvdyBwcmlvcml0eVxuICogICAtIFsgXSBUYXNrIHRpdGxlIEBwcm9qZWN0OldvcmsgVGFza3MgICAgICBcdTIxOTIgaW5saW5lIHByb2plY3Qgb3ZlcnJpZGVcbiAqICAgLSBbIF0gVGFzayB0aXRsZSA8IS0tdmlrdW5qYTo0Mi0tPiAgICAgICAgXHUyMTkyIHN5bmNlZCB0YXNrIHdpdGggVmlrdW5qYSBJRCA0MlxuICpcbiAqIFRva2VucyBmcm9tIHRoZSBPYnNpZGlhbiBUYXNrcyBwbHVnaW4gdGhhdCBhcmUgc3RyaXBwZWQgYnV0IG5vdCBtYXBwZWQgdG8gVmlrdW5qYTpcbiAqICAgXHUyNzk1IFlZWVktTU0tREQgICBjcmVhdGVkIGRhdGVcbiAqICAgXHUyNzA1IFlZWVktTU0tREQgICBjb21wbGV0aW9uIGRhdGVcbiAqICAgXHUyNzRDIFlZWVktTU0tREQgICBjYW5jZWxsZWQgZGF0ZVxuICogICBcdUQ4M0NcdUREOTQgPGlkPiAgICAgICAgIFRhc2tzIHBsdWdpbiB0YXNrIElEXG4gKiAgIFx1MjZENCA8aWQ+ICAgICAgICAgYmxvY2tlZC1ieSBkZXBlbmRlbmN5XG4gKiAgIFx1RDgzQ1x1REZDMSA8dGV4dD4gICAgICAgb24tY29tcGxldGlvbiBhY3Rpb25cbiAqL1xuXG5pbXBvcnQgdHlwZSB7IE9ic2lkaWFuVGFzayB9IGZyb20gXCIuLi90eXBlc1wiO1xuaW1wb3J0IHsgUFJJT1JJVFlfTUFQLCBQUklPUklUWV9NQVBfUkVWRVJTRSB9IGZyb20gXCIuLi90eXBlc1wiO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgUmVnZXggUGF0dGVybnMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbi8qKiBNYXRjaGVzIGEgbWFya2Rvd24gdGFzayBsaW5lOiBgLSBbIF0gLi4uYCBvciBgLSBbeF0gLi4uYCBvciBgKiBbIF0gLi4uYCAqL1xuY29uc3QgVEFTS19MSU5FX1JFR0VYID0gL14oXFxzKilbLSpdXFxzK1xcWyhbeCBdKVxcXVxccysoLispJC9pO1xuXG4vKipcbiAqIE1hdGNoZXMgdGhlIFZpa3VuamEgdHJhY2tpbmcgSUQgaW4gYm90aCBmb3JtYXRzOlxuICogICAlJXZpa3VuamE6NDIlJSAgICAgIFx1MjAxNCBuZXcgZm9ybWF0IChPYnNpZGlhbiBuYXRpdmUgY29tbWVudCwgaGlkZGVuIGluIGFsbCB2aWV3cylcbiAqICAgPCEtLXZpa3VuamE6NDItLT4gICBcdTIwMTQgb2xkIGZvcm1hdCAoa2VwdCBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSlcbiAqXG4gKiBBbHdheXMgd3JpdGUgdGhlICUlIGZvcm1hdDsgcmVhZCBib3RoIHNvIGV4aXN0aW5nIHRhc2tzIGFyZW4ndCBvcnBoYW5lZC5cbiAqL1xuY29uc3QgVklLVU5KQV9JRF9SRUdFWCA9IC8lJXZpa3VuamE6KFxcZCspJSV8PCEtLXZpa3VuamE6KFxcZCspLS0+LztcblxuLyoqIE1hdGNoZXMgZHVlIGRhdGU6IGBcdUQ4M0RcdURDQzUgMjAyNi0wNC0yMGAgKi9cbmNvbnN0IERVRV9EQVRFX1JFR0VYID0gL1x1RDgzRFx1RENDNVxccyooXFxkezR9LVxcZHsyfS1cXGR7Mn0pLztcblxuLyoqIE1hdGNoZXMgc3RhcnQgZGF0ZTogYFx1RDgzRFx1REVFQiAyMDI2LTA0LTIwYCAqL1xuY29uc3QgU1RBUlRfREFURV9SRUdFWCA9IC9cdUQ4M0RcdURFRUJcXHMqKFxcZHs0fS1cXGR7Mn0tXFxkezJ9KS87XG5cbi8qKiBNYXRjaGVzIHNjaGVkdWxlZCBkYXRlOiBgXHUyM0YzIDIwMjYtMDQtMjBgICovXG5jb25zdCBTQ0hFRFVMRURfREFURV9SRUdFWCA9IC9cdTIzRjNcXHMqKFxcZHs0fS1cXGR7Mn0tXFxkezJ9KS87XG5cbi8qKlxuICogQ2FwdHVyZXMgcmVjdXJyZW5jZSB0ZXh0IGFmdGVyIFx1RDgzRFx1REQwMSwgc3RvcHBpbmcgYXQgdGhlIG5leHQgbWV0YWRhdGEgZW1vamkuXG4gKiBlLmcuIGBcdUQ4M0RcdUREMDEgZXZlcnkgd2Vla2AgXHUyMTkyIGNhcHR1cmVzIFwiZXZlcnkgd2Vla1wiXG4gKi9cbmNvbnN0IFJFQ1VSUkVOQ0VfRVhUUkFDVF9SRUdFWCA9IC9cdUQ4M0RcdUREMDFcXHMqKFteXHVEODNEXHVERDNBXHUyM0VCXHVEODNEXHVERDNDXHVEODNEXHVERDNEXHUyM0VDXHVEODNEXHVEQ0M1XHVEODNEXHVERUVCXHUyM0YzXHUyNzk1XHUyNzA1XHUyNzRDXHVEODNDXHVERDk0XHUyNkQ0XHVEODNDXHVERkMxQDxdKykvO1xuXG4vKipcbiAqIE1hdGNoZXMgYW4gaW5saW5lIHByb2plY3Qgb3ZlcnJpZGU6IGBAcHJvamVjdDpXb3JrIFRhc2tzYFxuICogU3RvcHMgYXQgdGhlIG5leHQgbWV0YWRhdGEgbWFya2VyIHNvIG11bHRpLXdvcmQgbmFtZXMgd29yayB3aXRob3V0IHF1b3Rlcy5cbiAqL1xuY29uc3QgUFJPSkVDVF9PVkVSUklERV9SRUdFWCA9IC9AcHJvamVjdDooW15APFx1RDgzRFx1RENDNVx1RDgzRFx1REVFQlx1MjNGM1x1RDgzRFx1REQzQVx1MjNFQlx1RDgzRFx1REQzQ1x1RDgzRFx1REQzRFx1MjNFQ1x1Mjc5NVx1MjcwNVx1Mjc0Q1x1RDgzQ1x1REQ5NFx1MjZENFx1RDgzQ1x1REZDMV0rKS87XG5cbi8qKiBBbGwgcHJpb3JpdHkgZW1vamlzICovXG5jb25zdCBQUklPUklUWV9FTU9KSVMgPSBPYmplY3Qua2V5cyhQUklPUklUWV9NQVApO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgU3RyaXAtb25seSBwYXR0ZXJucyAodG9rZW5zIHdlIGRvbid0IG1hcCB0byBWaWt1bmphKSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuLyoqIGBcdUQ4M0RcdURDQzUgLyBcdUQ4M0RcdURFRUIgLyBcdTIzRjNgICsgZGF0ZSBcdTIwMTQgaGFuZGxlZCBzZXBhcmF0ZWx5IGJ1dCBsaXN0ZWQgaGVyZSBmb3IgcmVmZXJlbmNlICovXG5jb25zdCBEQVRFX1NUUklQX1JFR0VYID0gL1tcdUQ4M0RcdURDQzVcdUQ4M0RcdURFRUJcdTIzRjNdXFxzKlxcZHs0fS1cXGR7Mn0tXFxkezJ9L2c7XG5cbi8qKiBgXHVEODNEXHVERDAxIGV2ZXJ5IC4uLmAgXHUyMDE0IGZ1bGwgcmVjdXJyZW5jZSB0b2tlbiAqL1xuY29uc3QgUkVDVVJSRU5DRV9TVFJJUF9SRUdFWCA9IC9cdUQ4M0RcdUREMDFcXHMqW15cdUQ4M0RcdUREM0FcdTIzRUJcdUQ4M0RcdUREM0NcdUQ4M0RcdUREM0RcdTIzRUNcdUQ4M0RcdURDQzVcdUQ4M0RcdURFRUJcdTIzRjNcdTI3OTVcdTI3MDVcdTI3NENcdUQ4M0NcdUREOTRcdTI2RDRcdUQ4M0NcdURGQzFAPF0qL2c7XG5cbi8qKiBgXHUyNzk1IFlZWVktTU0tRERgIFx1MjAxNCBjcmVhdGVkIGRhdGUgKFRhc2tzIHBsdWdpbikgKi9cbmNvbnN0IENSRUFURURfREFURV9TVFJJUF9SRUdFWCA9IC9cdTI3OTVcXHMqXFxkezR9LVxcZHsyfS1cXGR7Mn0vZztcblxuLyoqIGBcdTI3MDUgWVlZWS1NTS1ERGAgXHUyMDE0IGNvbXBsZXRpb24gZGF0ZSAoVGFza3MgcGx1Z2luKSAqL1xuY29uc3QgRE9ORV9EQVRFX1NUUklQX1JFR0VYID0gL1x1MjcwNVxccypcXGR7NH0tXFxkezJ9LVxcZHsyfS9nO1xuXG4vKiogYFx1Mjc0QyBZWVlZLU1NLUREYCBcdTIwMTQgY2FuY2VsbGVkIGRhdGUgKFRhc2tzIHBsdWdpbikgKi9cbmNvbnN0IENBTkNFTExFRF9EQVRFX1NUUklQX1JFR0VYID0gL1x1Mjc0Q1xccypcXGR7NH0tXFxkezJ9LVxcZHsyfS9nO1xuXG4vKiogYFx1RDgzQ1x1REQ5NCA8d29yZD5gIFx1MjAxNCBUYXNrcyBwbHVnaW4gaW50ZXJuYWwgdGFzayBJRCAqL1xuY29uc3QgVEFTS19JRF9TVFJJUF9SRUdFWCA9IC9cdUQ4M0NcdUREOTRcXHMqXFxTKi9nO1xuXG4vKiogYFx1MjZENCA8d29yZD5gIFx1MjAxNCBibG9ja2VkLWJ5IGRlcGVuZGVuY3kgKFRhc2tzIHBsdWdpbikgKi9cbmNvbnN0IEJMT0NLRURfQllfU1RSSVBfUkVHRVggPSAvXHUyNkQ0XFxzKlxcUyovZztcblxuLyoqIGBcdUQ4M0NcdURGQzEgPHdvcmQ+YCBcdTIwMTQgb24tY29tcGxldGlvbiBhY3Rpb24gKFRhc2tzIHBsdWdpbikgKi9cbmNvbnN0IEZJTklTSF9PTl9TVFJJUF9SRUdFWCA9IC9cdUQ4M0NcdURGQzFcXHMqXFxTKi9nO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgUGFyc2VyIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5leHBvcnQgY2xhc3MgVGFza1BhcnNlciB7XG4gIC8qKlxuICAgKiBQYXJzZSBhbGwgdGFzayBsaW5lcyBmcm9tIGEgbWFya2Rvd24gZmlsZSdzIGNvbnRlbnQuXG4gICAqL1xuICBzdGF0aWMgcGFyc2VGaWxlKGNvbnRlbnQ6IHN0cmluZywgZmlsZVBhdGg6IHN0cmluZyk6IE9ic2lkaWFuVGFza1tdIHtcbiAgICByZXR1cm4gY29udGVudFxuICAgICAgLnNwbGl0KFwiXFxuXCIpXG4gICAgICAubWFwKChsaW5lLCBpKSA9PiBUYXNrUGFyc2VyLnBhcnNlTGluZShsaW5lLCBpLCBmaWxlUGF0aCkpXG4gICAgICAuZmlsdGVyKCh0KTogdCBpcyBPYnNpZGlhblRhc2sgPT4gdCAhPT0gbnVsbCk7XG4gIH1cblxuICAvKipcbiAgICogUGFyc2UgYSBzaW5nbGUgbGluZSBpbnRvIGFuIE9ic2lkaWFuVGFzaywgb3IgcmV0dXJuIG51bGwgaWYgbm90IGEgdGFzay5cbiAgICovXG4gIHN0YXRpYyBwYXJzZUxpbmUoXG4gICAgbGluZTogc3RyaW5nLFxuICAgIGxpbmVOdW1iZXI6IG51bWJlcixcbiAgICBmaWxlUGF0aDogc3RyaW5nXG4gICk6IE9ic2lkaWFuVGFzayB8IG51bGwge1xuICAgIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaChUQVNLX0xJTkVfUkVHRVgpO1xuICAgIGlmICghbWF0Y2gpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgWywgLCBjaGVja21hcmssIHJhd0NvbnRlbnRdID0gbWF0Y2g7XG4gICAgY29uc3QgZG9uZSA9IGNoZWNrbWFyay50b0xvd2VyQ2FzZSgpID09PSBcInhcIjtcblxuICAgIC8vIFZpa3VuamEgdHJhY2tpbmcgSUQgXHUyMDE0IGdyb3VwIDEgPSBuZXcgJSUgZm9ybWF0LCBncm91cCAyID0gb2xkIDwhLS0gLS0+IGZvcm1hdFxuICAgIGNvbnN0IHZpa3VuamFNYXRjaCA9IHJhd0NvbnRlbnQubWF0Y2goVklLVU5KQV9JRF9SRUdFWCk7XG4gICAgY29uc3QgdmlrdW5qYUlkID0gdmlrdW5qYU1hdGNoXG4gICAgICA/IHBhcnNlSW50KHZpa3VuamFNYXRjaFsxXSA/PyB2aWt1bmphTWF0Y2hbMl0sIDEwKVxuICAgICAgOiBudWxsO1xuXG4gICAgLy8gRGF0ZXNcbiAgICBjb25zdCBkdWVEYXRlTWF0Y2ggPSByYXdDb250ZW50Lm1hdGNoKERVRV9EQVRFX1JFR0VYKTtcbiAgICBjb25zdCBzdGFydERhdGVNYXRjaCA9IHJhd0NvbnRlbnQubWF0Y2goU1RBUlRfREFURV9SRUdFWCk7XG4gICAgY29uc3Qgc2NoZWR1bGVkRGF0ZU1hdGNoID0gcmF3Q29udGVudC5tYXRjaChTQ0hFRFVMRURfREFURV9SRUdFWCk7XG5cbiAgICAvLyBQcmlvcml0eVxuICAgIGxldCBwcmlvcml0eSA9IDA7XG4gICAgZm9yIChjb25zdCBbZW1vamksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhQUklPUklUWV9NQVApKSB7XG4gICAgICBpZiAocmF3Q29udGVudC5pbmNsdWRlcyhlbW9qaSkpIHtcbiAgICAgICAgcHJpb3JpdHkgPSB2YWx1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVjdXJyZW5jZSAoYFx1RDgzRFx1REQwMSBldmVyeSB3ZWVrYCBldGMuKVxuICAgIGNvbnN0IHJlY3VycmVuY2VNYXRjaCA9IHJhd0NvbnRlbnQubWF0Y2goUkVDVVJSRU5DRV9FWFRSQUNUX1JFR0VYKTtcbiAgICBjb25zdCByZWN1cnJlbmNlID0gcmVjdXJyZW5jZU1hdGNoID8gcmVjdXJyZW5jZU1hdGNoWzFdLnRyaW0oKSA6IG51bGw7XG5cbiAgICAvLyBJbmxpbmUgcHJvamVjdCBvdmVycmlkZSAoYEBwcm9qZWN0Ok5hbWVgKVxuICAgIGNvbnN0IHByb2plY3RNYXRjaCA9IHJhd0NvbnRlbnQubWF0Y2goUFJPSkVDVF9PVkVSUklERV9SRUdFWCk7XG4gICAgY29uc3QgcHJvamVjdE5hbWUgPSBwcm9qZWN0TWF0Y2ggPyBwcm9qZWN0TWF0Y2hbMV0udHJpbSgpIDogbnVsbDtcblxuICAgIGNvbnN0IHRpdGxlID0gVGFza1BhcnNlci5jbGVhblRpdGxlKHJhd0NvbnRlbnQpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJhd0xpbmU6IGxpbmUsXG4gICAgICBsaW5lTnVtYmVyLFxuICAgICAgZmlsZVBhdGgsXG4gICAgICB0aXRsZSxcbiAgICAgIGRvbmUsXG4gICAgICBkdWVEYXRlOiBkdWVEYXRlTWF0Y2ggPyBkdWVEYXRlTWF0Y2hbMV0gOiBudWxsLFxuICAgICAgc3RhcnREYXRlOiBzdGFydERhdGVNYXRjaCA/IHN0YXJ0RGF0ZU1hdGNoWzFdIDogbnVsbCxcbiAgICAgIHNjaGVkdWxlZERhdGU6IHNjaGVkdWxlZERhdGVNYXRjaCA/IHNjaGVkdWxlZERhdGVNYXRjaFsxXSA6IG51bGwsXG4gICAgICBwcmlvcml0eSxcbiAgICAgIHJlY3VycmVuY2UsXG4gICAgICB2aWt1bmphSWQsXG4gICAgICBwcm9qZWN0SWQ6IG51bGwsXG4gICAgICBwcm9qZWN0TmFtZSxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFN0cmlwIGFsbCBtZXRhZGF0YSB0b2tlbnMgZnJvbSBhIHRhc2sgdGl0bGUsIGxlYXZpbmcgb25seSBodW1hbi1yZWFkYWJsZSB0ZXh0LlxuICAgKlxuICAgKiBTdHJpcHM6XG4gICAqIC0gT3VyIG93biB0b2tlbnM6IGRhdGVzLCBwcmlvcml0eSwgQHByb2plY3Q6LCA8IS0tdmlrdW5qYTotLT4sIFx1RDgzRFx1REQwMSByZWN1cnJlbmNlXG4gICAqIC0gT2JzaWRpYW4gVGFza3MgcGx1Z2luIHRva2VuczogXHUyNzk1IFx1MjcwNSBcdTI3NEMgXHVEODNDXHVERDk0IFx1MjZENCBcdUQ4M0NcdURGQzFcbiAgICovXG4gIHN0YXRpYyBjbGVhblRpdGxlKHJhdzogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBsZXQgdCA9IHJhdztcblxuICAgIC8vIE91ciBvd24gdG9rZW5zIFx1MjAxNCBzdHJpcCBib3RoICUlIGFuZCA8IS0tIC0tPiBmb3JtYXRzXG4gICAgdCA9IHQucmVwbGFjZSgvJSV2aWt1bmphOlxcZCslJS9nLCBcIlwiKTtcbiAgICB0ID0gdC5yZXBsYWNlKC88IS0tdmlrdW5qYTpcXGQrLS0+L2csIFwiXCIpO1xuICAgIHQgPSB0LnJlcGxhY2UoREFURV9TVFJJUF9SRUdFWCwgXCJcIik7XG4gICAgdCA9IHQucmVwbGFjZShSRUNVUlJFTkNFX1NUUklQX1JFR0VYLCBcIlwiKTtcbiAgICB0ID0gdC5yZXBsYWNlKFBST0pFQ1RfT1ZFUlJJREVfUkVHRVgsIFwiXCIpO1xuICAgIGZvciAoY29uc3QgZW1vamkgb2YgUFJJT1JJVFlfRU1PSklTKSB0ID0gdC5yZXBsYWNlKGVtb2ppLCBcIlwiKTtcblxuICAgIC8vIFRhc2tzIHBsdWdpbiB0b2tlbnMgKHN0cmlwLW9ubHkgXHUyMDE0IG5vdCBtYXBwZWQgdG8gVmlrdW5qYSlcbiAgICB0ID0gdC5yZXBsYWNlKENSRUFURURfREFURV9TVFJJUF9SRUdFWCwgXCJcIik7XG4gICAgdCA9IHQucmVwbGFjZShET05FX0RBVEVfU1RSSVBfUkVHRVgsIFwiXCIpO1xuICAgIHQgPSB0LnJlcGxhY2UoQ0FOQ0VMTEVEX0RBVEVfU1RSSVBfUkVHRVgsIFwiXCIpO1xuICAgIHQgPSB0LnJlcGxhY2UoVEFTS19JRF9TVFJJUF9SRUdFWCwgXCJcIik7XG4gICAgdCA9IHQucmVwbGFjZShCTE9DS0VEX0JZX1NUUklQX1JFR0VYLCBcIlwiKTtcbiAgICB0ID0gdC5yZXBsYWNlKEZJTklTSF9PTl9TVFJJUF9SRUdFWCwgXCJcIik7XG5cbiAgICByZXR1cm4gdC50cmltKCkucmVwbGFjZSgvXFxzKy9nLCBcIiBcIik7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgU2VyaWFsaXNhdGlvbiBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICAvKipcbiAgICogU2VyaWFsaXNlIGFuIE9ic2lkaWFuVGFzayBiYWNrIHRvIGEgbWFya2Rvd24gbGluZS5cbiAgICogUHJlc2VydmVzIHRoZSBvcmlnaW5hbCBpbmRlbnRhdGlvbiBmcm9tIHJhd0xpbmUuXG4gICAqL1xuICBzdGF0aWMgc2VyaWFsaXNlKHRhc2s6IE9ic2lkaWFuVGFzayk6IHN0cmluZyB7XG4gICAgY29uc3QgaW5kZW50TWF0Y2ggPSB0YXNrLnJhd0xpbmUubWF0Y2goL14oXFxzKikvKTtcbiAgICBjb25zdCBpbmRlbnQgPSBpbmRlbnRNYXRjaCA/IGluZGVudE1hdGNoWzFdIDogXCJcIjtcblxuICAgIGNvbnN0IGNoZWNrbWFyayA9IHRhc2suZG9uZSA/IFwieFwiIDogXCIgXCI7XG4gICAgbGV0IGxpbmUgPSBgJHtpbmRlbnR9LSBbJHtjaGVja21hcmt9XSAke3Rhc2sudGl0bGV9YDtcblxuICAgIC8vIElubGluZSBwcm9qZWN0IG92ZXJyaWRlIFx1MjAxNCBrZXB0IHNvIHJvdXRpbmcgc3Vydml2ZXMgcm91bmQtdHJpcHNcbiAgICBpZiAodGFzay5wcm9qZWN0TmFtZSkgbGluZSArPSBgIEBwcm9qZWN0OiR7dGFzay5wcm9qZWN0TmFtZX1gO1xuXG4gICAgLy8gUmVjdXJyZW5jZVxuICAgIGlmICh0YXNrLnJlY3VycmVuY2UpIGxpbmUgKz0gYCBcdUQ4M0RcdUREMDEgJHt0YXNrLnJlY3VycmVuY2V9YDtcblxuICAgIC8vIFByaW9yaXR5XG4gICAgaWYgKHRhc2sucHJpb3JpdHkgPiAwICYmIFBSSU9SSVRZX01BUF9SRVZFUlNFW3Rhc2sucHJpb3JpdHldKSB7XG4gICAgICBsaW5lICs9IGAgJHtQUklPUklUWV9NQVBfUkVWRVJTRVt0YXNrLnByaW9yaXR5XX1gO1xuICAgIH1cblxuICAgIC8vIERhdGVzXG4gICAgaWYgKHRhc2suc3RhcnREYXRlKSAgICAgbGluZSArPSBgIFx1RDgzRFx1REVFQiAke3Rhc2suc3RhcnREYXRlfWA7XG4gICAgaWYgKHRhc2suc2NoZWR1bGVkRGF0ZSkgbGluZSArPSBgIFx1MjNGMyAke3Rhc2suc2NoZWR1bGVkRGF0ZX1gO1xuICAgIGlmICh0YXNrLmR1ZURhdGUpICAgICAgIGxpbmUgKz0gYCBcdUQ4M0RcdURDQzUgJHt0YXNrLmR1ZURhdGV9YDtcblxuICAgIC8vIFZpa3VuamEgdHJhY2tpbmcgSURcbiAgICBpZiAodGFzay52aWt1bmphSWQgIT09IG51bGwpIGxpbmUgKz0gYCA8IS0tdmlrdW5qYToke3Rhc2sudmlrdW5qYUlkfS0tPmA7XG5cbiAgICByZXR1cm4gbGluZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXBsYWNlIGEgc3BlY2lmaWMgbGluZSBpbiBmaWxlIGNvbnRlbnQgd2l0aCBhIG5ldyB0YXNrIHNlcmlhbGlzYXRpb24uXG4gICAqL1xuICBzdGF0aWMgcmVwbGFjZUxpbmUoY29udGVudDogc3RyaW5nLCBsaW5lTnVtYmVyOiBudW1iZXIsIG5ld0xpbmU6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgY29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KFwiXFxuXCIpO1xuICAgIGxpbmVzW2xpbmVOdW1iZXJdID0gbmV3TGluZTtcbiAgICByZXR1cm4gbGluZXMuam9pbihcIlxcblwiKTtcbiAgfVxuXG4gIC8qKiBRdWljayBjaGVjayBcdTIwMTQgZG9lcyB0aGlzIGxpbmUgbG9vayBsaWtlIGEgdGFzaz8gKi9cbiAgc3RhdGljIGlzVGFza0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIFRBU0tfTElORV9SRUdFWC50ZXN0KGxpbmUpO1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFJlY3VycmVuY2UgaGVscGVycyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICAvKipcbiAgICogQ29udmVydCBhIHJlY3VycmVuY2Ugc3RyaW5nIChlLmcuIFwiZXZlcnkgd2Vla1wiKSB0byBzZWNvbmRzIGZvciBWaWt1bmphJ3NcbiAgICogYHJlcGVhdF9hZnRlcmAgZmllbGQuIFJldHVybnMgdW5kZWZpbmVkIGlmIHRoZSBwYXR0ZXJuIGlzIG5vdCByZWNvZ25pc2VkLlxuICAgKlxuICAgKiBTdXBwb3J0czpcbiAgICogICBldmVyeSBkYXkgLyBkYWlseVxuICAgKiAgIGV2ZXJ5IHdlZWsgLyB3ZWVrbHlcbiAgICogICBldmVyeSBtb250aCAvIG1vbnRobHlcbiAgICogICBldmVyeSB5ZWFyIC8geWVhcmx5XG4gICAqICAgZXZlcnkgb3RoZXIgZGF5XG4gICAqICAgZXZlcnkgTiBkYXlzIC8gd2Vla3MgLyBtb250aHMgLyB5ZWFyc1xuICAgKi9cbiAgc3RhdGljIHBhcnNlUmVwZWF0QWZ0ZXIocmVjdXJyZW5jZTogc3RyaW5nIHwgbnVsbCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG4gICAgaWYgKCFyZWN1cnJlbmNlKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgIGNvbnN0IHIgPSByZWN1cnJlbmNlLnRvTG93ZXJDYXNlKCkudHJpbSgpO1xuXG4gICAgY29uc3QgU0VDT05EID0gMTtcbiAgICBjb25zdCBEQVkgICAgPSA4Nl80MDAgKiBTRUNPTkQ7XG4gICAgY29uc3QgV0VFSyAgID0gNyAgKiBEQVk7XG4gICAgY29uc3QgTU9OVEggID0gMzAgKiBEQVk7XG4gICAgY29uc3QgWUVBUiAgID0gMzY1ICogREFZO1xuXG4gICAgaWYgKHIgPT09IFwiZXZlcnkgZGF5XCIgICB8fCByID09PSBcImRhaWx5XCIpICAgcmV0dXJuIERBWTtcbiAgICBpZiAociA9PT0gXCJldmVyeSB3ZWVrXCIgIHx8IHIgPT09IFwid2Vla2x5XCIpICByZXR1cm4gV0VFSztcbiAgICBpZiAociA9PT0gXCJldmVyeSBtb250aFwiIHx8IHIgPT09IFwibW9udGhseVwiKSByZXR1cm4gTU9OVEg7XG4gICAgaWYgKHIgPT09IFwiZXZlcnkgeWVhclwiICB8fCByID09PSBcInllYXJseVwiKSAgcmV0dXJuIFlFQVI7XG4gICAgaWYgKHIgPT09IFwiZXZlcnkgb3RoZXIgZGF5XCIpICAgICAgICAgICAgICAgIHJldHVybiAyICogREFZO1xuXG4gICAgY29uc3QgbSA9IHIubWF0Y2goL15ldmVyeSAoXFxkKykgKGRheXx3ZWVrfG1vbnRofHllYXIpcz8kLyk7XG4gICAgaWYgKG0pIHtcbiAgICAgIGNvbnN0IG4gPSBwYXJzZUludChtWzFdLCAxMCk7XG4gICAgICBjb25zdCB1bml0czogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHsgZGF5OiBEQVksIHdlZWs6IFdFRUssIG1vbnRoOiBNT05USCwgeWVhcjogWUVBUiB9O1xuICAgICAgcmV0dXJuIG4gKiB1bml0c1ttWzJdXTtcbiAgICB9XG5cbiAgICByZXR1cm4gdW5kZWZpbmVkOyAvLyBQYXR0ZXJuIG5vdCByZWNvZ25pc2VkIFx1MjAxNCB3ZSdsbCBza2lwIHJlcGVhdF9hZnRlclxuICB9XG5cbiAgLyoqXG4gICAqIENvbnZlcnQgVmlrdW5qYSdzIGByZXBlYXRfYWZ0ZXJgIChzZWNvbmRzKSBiYWNrIHRvIGEgaHVtYW4tcmVhZGFibGVcbiAgICogcmVjdXJyZW5jZSBzdHJpbmcgZm9yIGRpc3BsYXkgaW4gT2JzaWRpYW4uXG4gICAqIFJldHVybnMgbnVsbCB3aGVuIHJlcGVhdF9hZnRlciBpcyAwIChubyByZWN1cnJlbmNlKS5cbiAgICovXG4gIHN0YXRpYyBmb3JtYXRSZXBlYXRBZnRlcihzZWNvbmRzOiBudW1iZXIpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBpZiAoIXNlY29uZHMgfHwgc2Vjb25kcyA8PSAwKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IERBWSAgID0gODZfNDAwO1xuICAgIGNvbnN0IFdFRUsgID0gNyAgKiBEQVk7XG4gICAgY29uc3QgTU9OVEggPSAzMCAqIERBWTtcbiAgICBjb25zdCBZRUFSICA9IDM2NSAqIERBWTtcblxuICAgIGlmIChzZWNvbmRzICUgWUVBUiAgPT09IDApIHJldHVybiBzZWNvbmRzID09PSBZRUFSICA/IFwiZXZlcnkgeWVhclwiICA6IGBldmVyeSAke3NlY29uZHMgLyBZRUFSfSB5ZWFyc2A7XG4gICAgaWYgKHNlY29uZHMgJSBNT05USCA9PT0gMCkgcmV0dXJuIHNlY29uZHMgPT09IE1PTlRIID8gXCJldmVyeSBtb250aFwiIDogYGV2ZXJ5ICR7c2Vjb25kcyAvIE1PTlRIfSBtb250aHNgO1xuICAgIGlmIChzZWNvbmRzICUgV0VFSyAgPT09IDApIHJldHVybiBzZWNvbmRzID09PSBXRUVLICA/IFwiZXZlcnkgd2Vla1wiICA6IGBldmVyeSAke3NlY29uZHMgLyBXRUVLfSB3ZWVrc2A7XG4gICAgaWYgKHNlY29uZHMgJSBEQVkgICA9PT0gMCkgcmV0dXJuIHNlY29uZHMgPT09IERBWSAgID8gXCJldmVyeSBkYXlcIiAgIDogYGV2ZXJ5ICR7c2Vjb25kcyAvIERBWX0gZGF5c2A7XG5cbiAgICAvLyBGYWxsIGJhY2sgdG8gZGF5cyAocm91bmRlZCkgZm9yIGlycmVndWxhciB2YWx1ZXNcbiAgICBjb25zdCBkYXlzID0gTWF0aC5yb3VuZChzZWNvbmRzIC8gREFZKTtcbiAgICByZXR1cm4gZGF5cyA9PT0gMSA/IFwiZXZlcnkgZGF5XCIgOiBgZXZlcnkgJHtkYXlzfSBkYXlzYDtcbiAgfVxufVxuIiwgIi8qKlxuICogQGZpbGUgc3luYy9TeW5jRW5naW5lLnRzXG4gKiBAZGVzY3JpcHRpb24gT3JjaGVzdHJhdGVzIGJpZGlyZWN0aW9uYWwgc3luYyBiZXR3ZWVuIE9ic2lkaWFuIHZhdWx0IHRhc2tzXG4gKiBhbmQgVmlrdW5qYS5cbiAqXG4gKiBTeW5jIHN0cmF0ZWd5OlxuICogICAtIE9ic2lkaWFuIFx1MjE5MiBWaWt1bmphOiB0YXNrcyB3aXRob3V0IGEgdmlrdW5qYUlkIGFyZSBjcmVhdGVkOyB0YXNrcyB3aXRoXG4gKiAgICAgYSB2aWt1bmphSWQgYXJlIHVwZGF0ZWQgaWYgdGhlaXIgY29udGVudCBoYXMgY2hhbmdlZC5cbiAqICAgLSBWaWt1bmphIFx1MjE5MiBPYnNpZGlhbjogdGFza3MgdXBkYXRlZCByZW1vdGVseSAoZG9uZSBzdGF0dXMsIHRpdGxlLCBkYXRlcylcbiAqICAgICBhcmUgd3JpdHRlbiBiYWNrIHRvIHRoZSB2YXVsdC5cbiAqXG4gKiBDb25mbGljdCByZXNvbHV0aW9uOlxuICogICAtIExhc3Qtd3JpdGUtd2lucyBiYXNlZCBvbiB0aGUgYHVwZGF0ZWRgIHRpbWVzdGFtcCBmcm9tIFZpa3VuamEuXG4gKiAgIC0gSWYgT2JzaWRpYW4gaGFzIGNoYW5nZXMgYW5kIFZpa3VuamEgaGFzIGNoYW5nZXMgc2luY2UgbGFzdCBzeW5jLFxuICogICAgIFZpa3VuamEgd2lucyAoaXQgaXMgdGhlIHNvdXJjZSBvZiB0cnV0aCBmb3IgY29sbGFib3JhdGlvbikuXG4gKlxuICogVGFzayBpZGVudGl0eTpcbiAqICAgLSBFYWNoIHN5bmNlZCB0YXNrIGNhcnJpZXMgYSBgPCEtLXZpa3VuamE6SUQtLT5gIEhUTUwgY29tbWVudCBpbiB0aGVcbiAqICAgICBtYXJrZG93biBsaW5lLiBUaGlzIGlzIHRoZSBwZXJzaXN0ZW50IGxpbmsgYmV0d2VlbiB0aGUgdHdvIHN5c3RlbXMuXG4gKi9cblxuaW1wb3J0IHR5cGUgeyBBcHAsIFRGaWxlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgdHlwZSB7IFZpa3VuamFDbGllbnQgfSBmcm9tIFwiLi4vYXBpL1Zpa3VuamFDbGllbnRcIjtcbmltcG9ydCB0eXBlIHtcbiAgVmlrdW5qYVBsdWdpblNldHRpbmdzLFxuICBPYnNpZGlhblRhc2ssXG4gIFN5bmNSZXN1bHQsXG4gIFZpa3VuamFUYXNrLFxuICBWaWt1bmphUHJvamVjdCxcbn0gZnJvbSBcIi4uL3R5cGVzXCI7XG5pbXBvcnQgeyBWSUtVTkpBX05VTExfREFURSB9IGZyb20gXCIuLi90eXBlc1wiO1xuaW1wb3J0IHsgVGFza1BhcnNlciB9IGZyb20gXCIuL1Rhc2tQYXJzZXJcIjtcblxuZXhwb3J0IGNsYXNzIFN5bmNFbmdpbmUge1xuICBwcml2YXRlIHJlYWRvbmx5IGFwcDogQXBwO1xuICBwcml2YXRlIHJlYWRvbmx5IGNsaWVudDogVmlrdW5qYUNsaWVudDtcbiAgcHJpdmF0ZSByZWFkb25seSBzZXR0aW5nczogVmlrdW5qYVBsdWdpblNldHRpbmdzO1xuXG4gIC8qKiBUcmFja3MgdGhlIGxhc3Qgc3luYyB0aW1lc3RhbXAgdG8gZGV0ZWN0IHJlbW90ZSBjaGFuZ2VzICovXG4gIHByaXZhdGUgbGFzdFN5bmNUaW1lOiBEYXRlIHwgbnVsbCA9IG51bGw7XG5cbiAgLyoqXG4gICAqIFByb2plY3QgbGlzdCBjYWNoZSBcdTIwMTQgcG9wdWxhdGVkIG9uY2UgcGVyIHN5bmMgcnVuIHRvIGF2b2lkIHJlcGVhdGVkIEFQSSBjYWxsc1xuICAgKiB3aGVuIHJlc29sdmluZyBwcm9qZWN0IG5hbWVzIGZyb20gZnJvbnRtYXR0ZXIgYWNyb3NzIG1hbnkgZmlsZXMuXG4gICAqL1xuICBwcml2YXRlIGNhY2hlZFByb2plY3RzOiBWaWt1bmphUHJvamVjdFtdIHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIGNsaWVudDogVmlrdW5qYUNsaWVudCwgc2V0dGluZ3M6IFZpa3VuamFQbHVnaW5TZXR0aW5ncykge1xuICAgIHRoaXMuYXBwID0gYXBwO1xuICAgIHRoaXMuY2xpZW50ID0gY2xpZW50O1xuICAgIHRoaXMuc2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBQdWJsaWMgQVBJIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4gIC8qKlxuICAgKiBSdW4gYSBmdWxsIGJpZGlyZWN0aW9uYWwgc3luYy5cbiAgICogVGhpcyBpcyB0aGUgbWFpbiBlbnRyeSBwb2ludCBjYWxsZWQgYnkgdGhlIHBsdWdpbiBvbiBzYXZlLCBvbiBzY2hlZHVsZSxcbiAgICogb3IgbWFudWFsbHkgYnkgdGhlIHVzZXIuXG4gICAqXG4gICAqIEByZXR1cm5zIFN5bmNSZXN1bHQgd2l0aCBjb3VudHMgb2YgY2hhbmdlcyBtYWRlXG4gICAqL1xuICBhc3luYyBzeW5jKCk6IFByb21pc2U8U3luY1Jlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdDogU3luY1Jlc3VsdCA9IHtcbiAgICAgIGNyZWF0ZWQ6IDAsXG4gICAgICB1cGRhdGVkOiAwLFxuICAgICAgY29tcGxldGVkOiAwLFxuICAgICAgZXJyb3JzOiBbXSxcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKSxcbiAgICB9O1xuXG4gICAgLy8gUmVzZXQgcHJvamVjdCBjYWNoZSBzbyB3ZSBnZXQgYSBmcmVzaCBsaXN0IGZvciB0aGlzIHJ1blxuICAgIHRoaXMuY2FjaGVkUHJvamVjdHMgPSBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIFN0ZXAgMTogRW5zdXJlIGV2ZXJ5IFZpa3VuamEgcHJvamVjdCBoYXMgYSBtYXJrZG93biBmaWxlIGluIHRoZSB2YXVsdC5cbiAgICAgIC8vIFJldHVybnMgYSBtYXAgb2YgbmV3bHktY3JlYXRlZCBmaWxlIHBhdGhzIFx1MjE5MiBwcm9qZWN0IElEcyBzbyB3ZSBjYW5cbiAgICAgIC8vIGltcG9ydCB0YXNrcyBpbnRvIHRoZW0gaW1tZWRpYXRlbHksIGJlZm9yZSBPYnNpZGlhbidzIG1ldGFkYXRhIGNhY2hlXG4gICAgICAvLyBoYXMgaGFkIGEgY2hhbmNlIHRvIGluZGV4IHRoZWlyIGZyb250bWF0dGVyLlxuICAgICAgY29uc3QgbmV3UHJvamVjdEZpbGVzID0gYXdhaXQgdGhpcy5lbnN1cmVQcm9qZWN0RmlsZXMoKTtcblxuICAgICAgLy8gU3RlcCAyOiBTY2FuIHRoZSB2YXVsdCBmb3IgYWxsIHRhc2sgbGluZXMgKyBjb2xsZWN0IGZpbGVcdTIxOTJwcm9qZWN0IGJpbmRpbmdzXG4gICAgICBjb25zdCB7IHRhc2tzOiBvYnNpZGlhblRhc2tzLCBmaWxlUHJvamVjdE1hcCB9ID0gYXdhaXQgdGhpcy5zY2FuVmF1bHQoKTtcblxuICAgICAgLy8gTWVyZ2UgbmV3bHktY3JlYXRlZCBwcm9qZWN0IGZpbGVzIGludG8gdGhlIG1hcCBcdTIwMTQgbWV0YWRhdGEgY2FjaGUgd29uJ3RcbiAgICAgIC8vIGhhdmUgdGhlaXIgZnJvbnRtYXR0ZXIgeWV0IHNvIHNjYW5WYXVsdCBjYW4ndCBkZXRlY3QgdGhlbSBvbiBpdHMgb3duLlxuICAgICAgZm9yIChjb25zdCBbcGF0aCwgaWRdIG9mIG5ld1Byb2plY3RGaWxlcykge1xuICAgICAgICBpZiAoIWZpbGVQcm9qZWN0TWFwLmhhcyhwYXRoKSkgZmlsZVByb2plY3RNYXAuc2V0KHBhdGgsIGlkKTtcbiAgICAgIH1cblxuICAgICAgLy8gU3RlcCAzOiBQdXNoIG5ldyBPYnNpZGlhbiB0YXNrcyAobm8gdmlrdW5qYUlkKSB0byBWaWt1bmphXG4gICAgICBhd2FpdCB0aGlzLnB1c2hOZXdUYXNrcyhvYnNpZGlhblRhc2tzLCByZXN1bHQpO1xuXG4gICAgICAvLyBTdGVwIDQ6IFB1c2ggdXBkYXRlcyB0byBleGlzdGluZyB0YXNrcyAoaGF2ZSB2aWt1bmphSWQsIGNvbnRlbnQgY2hhbmdlZClcbiAgICAgIGF3YWl0IHRoaXMucHVzaFRhc2tVcGRhdGVzKG9ic2lkaWFuVGFza3MsIHJlc3VsdCk7XG5cbiAgICAgIC8vIFN0ZXAgNTogUHVsbCByZW1vdGUgY2hhbmdlcyBmcm9tIFZpa3VuamEgYmFjayB0byB0aGUgdmF1bHQsXG4gICAgICAvLyAgICAgICAgIGFuZCBpbXBvcnQgcmVtb3RlLW9ubHkgdGFza3MgaW50byB0aGVpciBib3VuZCBmaWxlc1xuICAgICAgYXdhaXQgdGhpcy5wdWxsUmVtb3RlQ2hhbmdlcyhvYnNpZGlhblRhc2tzLCBmaWxlUHJvamVjdE1hcCwgcmVzdWx0KTtcblxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgcmVzdWx0LmVycm9ycy5wdXNoKFN0cmluZyhlcnIpKTtcbiAgICB9XG5cbiAgICB0aGlzLmxhc3RTeW5jVGltZSA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBTeW5jIGEgc2luZ2xlIGZpbGUuIENhbGxlZCBvbiBmaWxlLXNhdmUgZXZlbnRzIGZvciBlZmZpY2llbmN5IFx1MjAxNFxuICAgKiBhdm9pZHMgcmUtc2Nhbm5pbmcgdGhlIGVudGlyZSB2YXVsdCB3aGVuIG9ubHkgb25lIGZpbGUgY2hhbmdlZC5cbiAgICpcbiAgICogQWxzbyBwdWxscyByZW1vdGUtb25seSB0YXNrcyBmcm9tIFZpa3VuamEgaW50byB0aGUgZmlsZSB3aGVuIHRoZSBub3RlXG4gICAqIGhhcyBhbiBleHBsaWNpdCBwcm9qZWN0IGJpbmRpbmcgKGB2aWt1bmphX3Byb2plY3RfaWRgIG9yIGB2aWt1bmphX3Byb2plY3RgXG4gICAqIGZyb250bWF0dGVyKS4gVGhpcyBpcyB3aGF0IHBvcHVsYXRlcyBhIG5ld2x5LWNyZWF0ZWQgcHJvamVjdCBub3RlIHdpdGhcbiAgICogdGFza3MgdGhhdCBhbHJlYWR5IGV4aXN0IGluIFZpa3VuamEuXG4gICAqXG4gICAqIEBwYXJhbSBmaWxlIC0gVGhlIE9ic2lkaWFuIFRGaWxlIHRoYXQgd2FzIHNhdmVkXG4gICAqL1xuICBhc3luYyBzeW5jRmlsZShmaWxlOiBURmlsZSk6IFByb21pc2U8U3luY1Jlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdDogU3luY1Jlc3VsdCA9IHtcbiAgICAgIGNyZWF0ZWQ6IDAsXG4gICAgICB1cGRhdGVkOiAwLFxuICAgICAgY29tcGxldGVkOiAwLFxuICAgICAgZXJyb3JzOiBbXSxcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKSxcbiAgICB9O1xuXG4gICAgaWYgKHRoaXMuaXNFeGNsdWRlZChmaWxlLnBhdGgpKSByZXR1cm4gcmVzdWx0O1xuXG4gICAgLy8gUmVzZXQgcHJvamVjdCBjYWNoZSBmb3IgdGhpcyBydW5cbiAgICB0aGlzLmNhY2hlZFByb2plY3RzID0gbnVsbDtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgIGNvbnN0IHRhc2tzID0gVGFza1BhcnNlci5wYXJzZUZpbGUoY29udGVudCwgZmlsZS5wYXRoKTtcblxuICAgICAgLy8gUmVzb2x2ZSBwcm9qZWN0IElEcyBmcm9tIGZyb250bWF0dGVyIChleHBsaWNpdCkgb3IgZGVmYXVsdFxuICAgICAgY29uc3QgZXhwbGljaXRJZCA9IGF3YWl0IHRoaXMuZ2V0RXhwbGljaXRQcm9qZWN0SWQoZmlsZSk7XG4gICAgICBjb25zdCBlZmZlY3RpdmVJZCA9IGV4cGxpY2l0SWQgPz8gdGhpcy5zZXR0aW5ncy5kZWZhdWx0UHJvamVjdElkO1xuICAgICAgZm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG4gICAgICAgIHRhc2sucHJvamVjdElkID0gZWZmZWN0aXZlSWQ7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMucHVzaE5ld1Rhc2tzKHRhc2tzLCByZXN1bHQpO1xuICAgICAgYXdhaXQgdGhpcy5wdXNoVGFza1VwZGF0ZXModGFza3MsIHJlc3VsdCk7XG5cbiAgICAgIC8vIFB1bGwgcmVtb3RlIHRhc2tzIGZvciB0aGlzIGZpbGUncyBleHBsaWNpdGx5LWJvdW5kIHByb2plY3QuXG4gICAgICAvLyBUaGlzIGltcG9ydHMgdGFza3MgdGhhdCBleGlzdCBpbiBWaWt1bmphIGJ1dCBoYXZlbid0IGJlZW4gc3luY2VkXG4gICAgICAvLyB0byB0aGlzIG5vdGUgeWV0IChlLmcuIHRhc2tzIGNyZWF0ZWQgaW4gdGhlIFZpa3VuamEgd2ViIFVJKS5cbiAgICAgIGlmIChleHBsaWNpdElkICE9PSBudWxsKSB7XG4gICAgICAgIGNvbnN0IGZpbGVQcm9qZWN0TWFwID0gbmV3IE1hcChbW2ZpbGUucGF0aCwgZXhwbGljaXRJZF1dKTtcbiAgICAgICAgYXdhaXQgdGhpcy5wdWxsUmVtb3RlQ2hhbmdlcyh0YXNrcywgZmlsZVByb2plY3RNYXAsIHJlc3VsdCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICByZXN1bHQuZXJyb3JzLnB1c2goYEVycm9yIHN5bmNpbmcgJHtmaWxlLnBhdGh9OiAke1N0cmluZyhlcnIpfWApO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlIGEgY2hlY2tib3ggdG9nZ2xlIGluIHRoZSBlZGl0b3IuXG4gICAqIENhbGxlZCB3aGVuIHRoZSB1c2VyIGNsaWNrcyBhIGNoZWNrYm94IGluIHJlYWRpbmcvbGl2ZS1wcmV2aWV3IG1vZGUuXG4gICAqXG4gICAqIEBwYXJhbSBmaWxlICAgICAgIC0gRmlsZSBjb250YWluaW5nIHRoZSB0YXNrXG4gICAqIEBwYXJhbSBsaW5lTnVtYmVyIC0gTGluZSB0aGF0IHdhcyB0b2dnbGVkXG4gICAqIEBwYXJhbSBkb25lICAgICAgIC0gTmV3IGRvbmUgc3RhdGVcbiAgICovXG4gIGFzeW5jIGhhbmRsZUNoZWNrYm94VG9nZ2xlKFxuICAgIGZpbGU6IFRGaWxlLFxuICAgIGxpbmVOdW1iZXI6IG51bWJlcixcbiAgICBkb25lOiBib29sZWFuXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdChcIlxcblwiKTtcbiAgICBjb25zdCBsaW5lID0gbGluZXNbbGluZU51bWJlcl07XG5cbiAgICBpZiAoIVRhc2tQYXJzZXIuaXNUYXNrTGluZShsaW5lKSkgcmV0dXJuO1xuXG4gICAgY29uc3QgdGFzayA9IFRhc2tQYXJzZXIucGFyc2VMaW5lKGxpbmUsIGxpbmVOdW1iZXIsIGZpbGUucGF0aCk7XG4gICAgaWYgKCF0YXNrKSByZXR1cm47XG5cbiAgICB0YXNrLmRvbmUgPSBkb25lO1xuXG4gICAgLy8gSWYgdGhlIHRhc2sgaXMgYWxyZWFkeSBsaW5rZWQgdG8gVmlrdW5qYSwgdXBkYXRlIGl0IHRoZXJlXG4gICAgaWYgKHRhc2sudmlrdW5qYUlkICE9PSBudWxsKSB7XG4gICAgICBhd2FpdCB0aGlzLmNsaWVudC5zZXRUYXNrRG9uZSh0YXNrLnZpa3VuamFJZCwgZG9uZSk7XG4gICAgfVxuXG4gICAgLy8gV3JpdGUgdGhlIHVwZGF0ZWQgbGluZSBiYWNrIHRvIHRoZSBmaWxlXG4gICAgY29uc3QgbmV3Q29udGVudCA9IFRhc2tQYXJzZXIucmVwbGFjZUxpbmUoY29udGVudCwgbGluZU51bWJlciwgVGFza1BhcnNlci5zZXJpYWxpc2UodGFzaykpO1xuICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBuZXdDb250ZW50KTtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBQcm9qZWN0IEZpbGUgTWFuYWdlbWVudCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICAvKipcbiAgICogRW5zdXJlIGV2ZXJ5IG5vbi1hcmNoaXZlZCBWaWt1bmphIHByb2plY3QgaGFzIGEgY29ycmVzcG9uZGluZyBtYXJrZG93blxuICAgKiBmaWxlIGluIHRoZSBjb25maWd1cmVkIHByb2plY3RzIGZvbGRlci5cbiAgICpcbiAgICogRWFjaCBmaWxlIGlzIGNyZWF0ZWQgd2l0aCBgdmlrdW5qYV9wcm9qZWN0X2lkYCBmcm9udG1hdHRlciBwcmUtZmlsbGVkIHNvXG4gICAqIHRoZSBzeW5jIGVuZ2luZSBjYW4gcm91dGUgdGFza3MgY29ycmVjdGx5IHdpdGhvdXQgYW55IG1hbnVhbCBzZXR1cC5cbiAgICpcbiAgICogRmlsZXMgdGhhdCBhbHJlYWR5IGV4aXN0IGFyZSBsZWZ0IHVudG91Y2hlZCBcdTIwMTQgdGhpcyBvbmx5IGNyZWF0ZXMgbWlzc2luZyBvbmVzLlxuICAgKiBJZiBhIHByb2plY3QgaXMgcmVuYW1lZCBpbiBWaWt1bmphIHRoZSBvcmlnaW5hbCBmaWxlIGtlZXBzIHdvcmtpbmcgYmVjYXVzZVxuICAgKiB0aGUgZnJvbnRtYXR0ZXIgSUQgaXMgdGhlIHJlYWwgaWRlbnRpdHksIG5vdCB0aGUgZmlsZW5hbWUuXG4gICAqXG4gICAqIEByZXR1cm5zIEEgbWFwIG9mIG5ld2x5LWNyZWF0ZWQgZmlsZSBwYXRocyBcdTIxOTIgcHJvamVjdCBJRHMuIFVzZWQgYnkgc3luYygpXG4gICAqICAgICAgICAgIHRvIHNlZWQgdGhlIGZpbGVQcm9qZWN0TWFwIGJlZm9yZSB0aGUgbWV0YWRhdGEgY2FjaGUgaGFzIGluZGV4ZWRcbiAgICogICAgICAgICAgdGhlIG5ldyBmaWxlcy5cbiAgICovXG4gIHByaXZhdGUgYXN5bmMgZW5zdXJlUHJvamVjdEZpbGVzKCk6IFByb21pc2U8TWFwPHN0cmluZywgbnVtYmVyPj4ge1xuICAgIGNvbnN0IGNyZWF0ZWQgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmF1dG9DcmVhdGVQcm9qZWN0RmlsZXMpIHJldHVybiBjcmVhdGVkO1xuXG4gICAgY29uc3QgZm9sZGVyID0gdGhpcy5zZXR0aW5ncy5wcm9qZWN0c0ZvbGRlci50cmltKCkucmVwbGFjZSgvXFwvKyQvLCBcIlwiKTtcbiAgICBpZiAoIWZvbGRlcikgcmV0dXJuIGNyZWF0ZWQ7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGZvbGRlciBpZiBpdCBkb2Vzbid0IGV4aXN0IHlldFxuICAgIGlmICghdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZvbGRlcikpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZUZvbGRlcihmb2xkZXIpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIEZvbGRlciBtYXkgaGF2ZSBiZWVuIGNyZWF0ZWQgYnkgYSBjb25jdXJyZW50IG9wZXJhdGlvbiBcdTIwMTQgc2FmZSB0byBpZ25vcmVcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBwcm9qZWN0cyA9IGF3YWl0IHRoaXMuZ2V0Q2FjaGVkUHJvamVjdHMoKTtcblxuICAgIGZvciAoY29uc3QgcHJvamVjdCBvZiBwcm9qZWN0cykge1xuICAgICAgaWYgKHByb2plY3QuaXNfYXJjaGl2ZWQpIGNvbnRpbnVlO1xuXG4gICAgICAvLyBTYW5pdGlzZSBwcm9qZWN0IHRpdGxlOiByZXBsYWNlIGNoYXJhY3RlcnMgZm9yYmlkZGVuIGluIG1vc3QgZmlsZXN5c3RlbXNcbiAgICAgIGNvbnN0IHNhZmVOYW1lID0gcHJvamVjdC50aXRsZS5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fCNeW1xcXV0vZywgXCItXCIpLnRyaW0oKTtcbiAgICAgIGlmICghc2FmZU5hbWUpIGNvbnRpbnVlO1xuXG4gICAgICBjb25zdCBmaWxlUGF0aCA9IGAke2ZvbGRlcn0vJHtzYWZlTmFtZX0ubWRgO1xuXG4gICAgICBpZiAodGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZpbGVQYXRoKSkgY29udGludWU7IC8vIEFscmVhZHkgZXhpc3RzXG5cbiAgICAgIGNvbnN0IGNvbnRlbnQgPVxuICAgICAgICBgLS0tXFxudmlrdW5qYV9wcm9qZWN0X2lkOiAke3Byb2plY3QuaWR9XFxuLS0tXFxuXFxuIyAke3Byb2plY3QudGl0bGV9XFxuXFxuYDtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKGZpbGVQYXRoLCBjb250ZW50KTtcbiAgICAgICAgY3JlYXRlZC5zZXQoZmlsZVBhdGgsIHByb2plY3QuaWQpO1xuICAgICAgICBjb25zb2xlLmxvZyhgW1Zpa3VuamFdIENyZWF0ZWQgcHJvamVjdCBmaWxlOiAke2ZpbGVQYXRofWApO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYFtWaWt1bmphXSBGYWlsZWQgdG8gY3JlYXRlIHByb2plY3QgZmlsZSAke2ZpbGVQYXRofTpgLCBlcnIpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBjcmVhdGVkO1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFZhdWx0IFNjYW5uaW5nIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4gIC8qKlxuICAgKiBTY2FuIGFsbCBtYXJrZG93biBmaWxlcyBpbiB0aGUgdmF1bHQgZm9yIHRhc2sgbGluZXMuXG4gICAqIFJlc3BlY3RzIHRoZSBleGNsdWRlZEZvbGRlcnMgc2V0dGluZy5cbiAgICpcbiAgICogQWxzbyBidWlsZHMgYSBtYXAgb2YgZmlsZXMgdGhhdCBoYXZlIGFuIGV4cGxpY2l0IHByb2plY3QgYmluZGluZyBpbiB0aGVpclxuICAgKiBmcm9udG1hdHRlciAoYHZpa3VuamFfcHJvamVjdF9pZGAgb3IgYHZpa3VuamFfcHJvamVjdGApLiBUaGlzIG1hcCBkcml2ZXNcbiAgICogdGhlIHJlbW90ZS1pbXBvcnQgc3RlcCBpbiBwdWxsUmVtb3RlQ2hhbmdlcy5cbiAgICpcbiAgICogQHJldHVybnMgdGFza3MgXHUyMDE0IGFsbCBPYnNpZGlhblRhc2sgb2JqZWN0cyBmb3VuZCBpbiB0aGUgdmF1bHRcbiAgICogICAgICAgICAgZmlsZVByb2plY3RNYXAgXHUyMDE0IGZpbGUgcGF0aCBcdTIxOTIgVmlrdW5qYSBwcm9qZWN0IElELCBmb3IgZmlsZXMgd2l0aFxuICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGxpY2l0IGZyb250bWF0dGVyIHByb2plY3QgYmluZGluZ3Mgb25seVxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBzY2FuVmF1bHQoKTogUHJvbWlzZTx7XG4gICAgdGFza3M6IE9ic2lkaWFuVGFza1tdO1xuICAgIGZpbGVQcm9qZWN0TWFwOiBNYXA8c3RyaW5nLCBudW1iZXI+O1xuICB9PiB7XG4gICAgY29uc3QgYWxsVGFza3M6IE9ic2lkaWFuVGFza1tdID0gW107XG4gICAgY29uc3QgZmlsZVByb2plY3RNYXAgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICAgIGNvbnN0IGZpbGVzID0gdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpO1xuXG4gICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICBpZiAodGhpcy5pc0V4Y2x1ZGVkKGZpbGUucGF0aCkpIGNvbnRpbnVlO1xuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgY29uc3QgdGFza3MgPSBUYXNrUGFyc2VyLnBhcnNlRmlsZShjb250ZW50LCBmaWxlLnBhdGgpO1xuXG4gICAgICAgIC8vIFJlc29sdmUgZXhwbGljaXQgZnJvbnRtYXR0ZXIgYmluZGluZyAodmlrdW5qYV9wcm9qZWN0X2lkIG9yIHZpa3VuamFfcHJvamVjdClcbiAgICAgICAgY29uc3QgZXhwbGljaXRJZCA9IGF3YWl0IHRoaXMuZ2V0RXhwbGljaXRQcm9qZWN0SWQoZmlsZSk7XG4gICAgICAgIGNvbnN0IGVmZmVjdGl2ZUlkID0gZXhwbGljaXRJZCA/PyB0aGlzLnNldHRpbmdzLmRlZmF1bHRQcm9qZWN0SWQ7XG5cbiAgICAgICAgZm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG4gICAgICAgICAgdGFzay5wcm9qZWN0SWQgPSBlZmZlY3RpdmVJZDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRyYWNrIGV4cGxpY2l0IGJpbmRpbmdzIHNvIHB1bGxSZW1vdGVDaGFuZ2VzIGtub3dzIHdoaWNoIGZpbGVzXG4gICAgICAgIC8vIHRvIGltcG9ydCByZW1vdGUtb25seSB0YXNrcyBpbnRvXG4gICAgICAgIGlmIChleHBsaWNpdElkICE9PSBudWxsKSB7XG4gICAgICAgICAgZmlsZVByb2plY3RNYXAuc2V0KGZpbGUucGF0aCwgZXhwbGljaXRJZCk7XG4gICAgICAgIH1cblxuICAgICAgICBhbGxUYXNrcy5wdXNoKC4uLnRhc2tzKTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBbVmlrdW5qYV0gRXJyb3Igc2Nhbm5pbmcgJHtmaWxlLnBhdGh9OmAsIGVycik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgdGFza3M6IGFsbFRhc2tzLCBmaWxlUHJvamVjdE1hcCB9O1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFB1c2g6IE9ic2lkaWFuIFx1MjE5MiBWaWt1bmphIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4gIC8qKlxuICAgKiBDcmVhdGUgVmlrdW5qYSB0YXNrcyBmb3IgYW55IE9ic2lkaWFuIHRhc2tzIHRoYXQgZG9uJ3QgeWV0IGhhdmUgYSB2aWt1bmphSWQuXG4gICAqIEFmdGVyIGNyZWF0aW9uLCB3cml0ZXMgdGhlIHZpa3VuamFJZCBiYWNrIGludG8gdGhlIG1hcmtkb3duIGxpbmUuXG4gICAqXG4gICAqIFByb2plY3QgcmVzb2x1dGlvbiBvcmRlciAoaGlnaGVzdCBwcmlvcml0eSBmaXJzdCk6XG4gICAqICAgMS4gSW5saW5lIGBAcHJvamVjdDpOYW1lYCB0b2tlbiBvbiB0aGUgdGFzayBsaW5lXG4gICAqICAgMi4gYHZpa3VuamFfcHJvamVjdF9pZGAgLyBgdmlrdW5qYV9wcm9qZWN0YCBpbiB0aGUgbm90ZSdzIGZyb250bWF0dGVyXG4gICAqICAgMy4gRGVmYXVsdCBwcm9qZWN0IGNvbmZpZ3VyZWQgaW4gcGx1Z2luIHNldHRpbmdzXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHB1c2hOZXdUYXNrcyh0YXNrczogT2JzaWRpYW5UYXNrW10sIHJlc3VsdDogU3luY1Jlc3VsdCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG5ld1Rhc2tzID0gdGFza3MuZmlsdGVyKCh0KSA9PiB0LnZpa3VuamFJZCA9PT0gbnVsbCk7XG5cbiAgICBmb3IgKGNvbnN0IHRhc2sgb2YgbmV3VGFza3MpIHtcbiAgICAgIC8vIFJlc29sdmUgcHJvamVjdCBcdTIwMTQgaW5saW5lIEBwcm9qZWN0OiBvdmVycmlkZXMgdGhlIG5vdGUtbGV2ZWwgYmluZGluZ1xuICAgICAgbGV0IHByb2plY3RJZCA9IHRhc2sucHJvamVjdElkID8/IHRoaXMuc2V0dGluZ3MuZGVmYXVsdFByb2plY3RJZDtcbiAgICAgIGlmICh0YXNrLnByb2plY3ROYW1lKSB7XG4gICAgICAgIGNvbnN0IHByb2plY3RzID0gYXdhaXQgdGhpcy5nZXRDYWNoZWRQcm9qZWN0cygpO1xuICAgICAgICBjb25zdCBtYXRjaCA9IHByb2plY3RzLmZpbmQoXG4gICAgICAgICAgKHApID0+IHAudGl0bGUudG9Mb3dlckNhc2UoKS50cmltKCkgPT09IHRhc2sucHJvamVjdE5hbWUhLnRvTG93ZXJDYXNlKCkudHJpbSgpXG4gICAgICAgICk7XG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgIHByb2plY3RJZCA9IG1hdGNoLmlkO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3VsdC5lcnJvcnMucHVzaChcbiAgICAgICAgICAgIGBVbmtub3duIHByb2plY3QgXCJAcHJvamVjdDoke3Rhc2sucHJvamVjdE5hbWV9XCIgb24gdGFzayBcIiR7dGFzay50aXRsZX1cIiBgICtcbiAgICAgICAgICAgIGBpbiAke3Rhc2suZmlsZVBhdGh9LiBDaGVjayB0aGUgbmFtZSBtYXRjaGVzIGEgcHJvamVjdCBpbiBWaWt1bmphIGV4YWN0bHkuYFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKCFwcm9qZWN0SWQpIHtcbiAgICAgICAgcmVzdWx0LmVycm9ycy5wdXNoKFxuICAgICAgICAgIGBTa2lwcGVkIFwiJHt0YXNrLnRpdGxlfVwiIGluICR7dGFzay5maWxlUGF0aH0gXHUyMDE0IG5vIHByb2plY3QgYXNzaWduZWQuIGAgK1xuICAgICAgICAgIGBBZGQgdmlrdW5qYV9wcm9qZWN0X2lkIHRvIHRoZSBub3RlJ3MgZnJvbnRtYXR0ZXIsIHVzZSBAcHJvamVjdDpOYW1lIG9uIGAgK1xuICAgICAgICAgIGB0aGUgdGFzayBsaW5lLCBvciBzZXQgYSBEZWZhdWx0IFByb2plY3QgaW4gcGx1Z2luIHNldHRpbmdzLmBcbiAgICAgICAgKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCB0aGlzLmNsaWVudC5jcmVhdGVUYXNrKHByb2plY3RJZCwge1xuICAgICAgICAgIHRpdGxlOiB0YXNrLnRpdGxlLFxuICAgICAgICAgIGRvbmU6IHRhc2suZG9uZSxcbiAgICAgICAgICBkdWVfZGF0ZTogdGFzay5kdWVEYXRlID8gbmV3IERhdGUodGFzay5kdWVEYXRlKS50b0lTT1N0cmluZygpIDogdW5kZWZpbmVkLFxuICAgICAgICAgIHN0YXJ0X2RhdGU6IHRhc2suc3RhcnREYXRlID8gbmV3IERhdGUodGFzay5zdGFydERhdGUpLnRvSVNPU3RyaW5nKCkgOiB1bmRlZmluZWQsXG4gICAgICAgICAgcHJpb3JpdHk6IHRhc2sucHJpb3JpdHkgPiAwID8gdGFzay5wcmlvcml0eSA6IHVuZGVmaW5lZCxcbiAgICAgICAgICByZXBlYXRfYWZ0ZXI6IFRhc2tQYXJzZXIucGFyc2VSZXBlYXRBZnRlcih0YXNrLnJlY3VycmVuY2UpLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBXcml0ZSB2aWt1bmphSWQgYmFjayB0byB0aGUgZmlsZVxuICAgICAgICB0YXNrLnZpa3VuamFJZCA9IGNyZWF0ZWQuaWQ7XG4gICAgICAgIGF3YWl0IHRoaXMud3JpdGVUYXNrVG9GaWxlKHRhc2spO1xuICAgICAgICByZXN1bHQuY3JlYXRlZCsrO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHJlc3VsdC5lcnJvcnMucHVzaChgRmFpbGVkIHRvIGNyZWF0ZSB0YXNrIFwiJHt0YXNrLnRpdGxlfVwiOiAke1N0cmluZyhlcnIpfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgVmlrdW5qYSBmb3IgdGFza3MgdGhhdCBoYXZlIGEgdmlrdW5qYUlkIChpLmUuIGFscmVhZHkgc3luY2VkKS5cbiAgICogQ3VycmVudGx5IHVwZGF0ZXMgZG9uZSBzdGF0dXMgXHUyMDE0IHRpdGxlL2RhdGUgc3luYyBpcyBoYW5kbGVkIGluIHB1bGwuXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHB1c2hUYXNrVXBkYXRlcyh0YXNrczogT2JzaWRpYW5UYXNrW10sIHJlc3VsdDogU3luY1Jlc3VsdCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGV4aXN0aW5nVGFza3MgPSB0YXNrcy5maWx0ZXIoKHQpID0+IHQudmlrdW5qYUlkICE9PSBudWxsKTtcblxuICAgIGZvciAoY29uc3QgdGFzayBvZiBleGlzdGluZ1Rhc2tzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLmNsaWVudC51cGRhdGVUYXNrKHRhc2sudmlrdW5qYUlkISwge1xuICAgICAgICAgIHRpdGxlOiB0YXNrLnRpdGxlLFxuICAgICAgICAgIGRvbmU6IHRhc2suZG9uZSxcbiAgICAgICAgICBkdWVfZGF0ZTogdGFzay5kdWVEYXRlID8gbmV3IERhdGUodGFzay5kdWVEYXRlKS50b0lTT1N0cmluZygpIDogdW5kZWZpbmVkLFxuICAgICAgICAgIHN0YXJ0X2RhdGU6IHRhc2suc3RhcnREYXRlID8gbmV3IERhdGUodGFzay5zdGFydERhdGUpLnRvSVNPU3RyaW5nKCkgOiB1bmRlZmluZWQsXG4gICAgICAgICAgcHJpb3JpdHk6IHRhc2sucHJpb3JpdHkgPiAwID8gdGFzay5wcmlvcml0eSA6IHVuZGVmaW5lZCxcbiAgICAgICAgICByZXBlYXRfYWZ0ZXI6IFRhc2tQYXJzZXIucGFyc2VSZXBlYXRBZnRlcih0YXNrLnJlY3VycmVuY2UpLFxuICAgICAgICB9KTtcbiAgICAgICAgcmVzdWx0LnVwZGF0ZWQrKztcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICByZXN1bHQuZXJyb3JzLnB1c2goYEZhaWxlZCB0byB1cGRhdGUgdGFzayBcIiR7dGFzay50aXRsZX1cIjogJHtTdHJpbmcoZXJyKX1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgUHVsbDogVmlrdW5qYSBcdTIxOTIgT2JzaWRpYW4gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgLyoqXG4gICAqIFB1bGwgcmVtb3RlIGNoYW5nZXMgZnJvbSBWaWt1bmphIGFuZCB3cml0ZSB0aGVtIGJhY2sgdG8gdGhlIHZhdWx0LlxuICAgKlxuICAgKiBUd28gdGhpbmdzIGhhcHBlbiBoZXJlOlxuICAgKlxuICAgKiAxLiAqKlVwZGF0ZSBleGlzdGluZyB0YXNrcyoqIFx1MjAxNCB0YXNrcyBhbHJlYWR5IHRyYWNrZWQgaW4gT2JzaWRpYW4gKHRob3NlXG4gICAqICAgIHdpdGggYSBgPCEtLXZpa3VuamE6SUQtLT5gIGNvbW1lbnQpIGFyZSBjb21wYXJlZCBhZ2FpbnN0IFZpa3VuamEgYW5kXG4gICAqICAgIHVwZGF0ZWQgaWYgdGhlaXIgdGl0bGUgb3IgZG9uZSBzdGF0ZSBjaGFuZ2VkIHJlbW90ZWx5LlxuICAgKlxuICAgKiAyLiAqKkltcG9ydCByZW1vdGUtb25seSB0YXNrcyoqIFx1MjAxNCBmb3IgZmlsZXMgdGhhdCBoYXZlIGFuIGV4cGxpY2l0IHByb2plY3RcbiAgICogICAgYmluZGluZyBpbiB0aGVpciBmcm9udG1hdHRlciAoYHZpa3VuamFfcHJvamVjdF9pZGAgLyBgdmlrdW5qYV9wcm9qZWN0YCksXG4gICAqICAgIGFueSBWaWt1bmphIHRhc2tzIHRoYXQgaGF2ZSBubyBPYnNpZGlhbiBjb3VudGVycGFydCBhcmUgYXBwZW5kZWQgdG9cbiAgICogICAgdGhhdCBmaWxlLiBUaGlzIGlzIHdoYXQgcG9wdWxhdGVzIGEgZnJlc2hseS1jcmVhdGVkIHByb2plY3Qgbm90ZSB3aXRoXG4gICAqICAgIHRhc2tzIGFscmVhZHkgaW4gVmlrdW5qYS5cbiAgICpcbiAgICogQHBhcmFtIGxvY2FsVGFza3MgICAgIC0gQWxsIE9ic2lkaWFuVGFzayBvYmplY3RzIGZvdW5kIGluIHRoZSB2YXVsdFxuICAgKiBAcGFyYW0gZmlsZVByb2plY3RNYXAgLSBGaWxlcyB3aXRoIGV4cGxpY2l0IHByb2plY3QgYmluZGluZ3MgKHBhdGggXHUyMTkyIHByb2plY3RJZClcbiAgICogQHBhcmFtIHJlc3VsdCAgICAgICAgIC0gTXV0YWJsZSByZXN1bHQgb2JqZWN0IHRvIGFjY3VtdWxhdGUgY291bnRzL2Vycm9yc1xuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBwdWxsUmVtb3RlQ2hhbmdlcyhcbiAgICBsb2NhbFRhc2tzOiBPYnNpZGlhblRhc2tbXSxcbiAgICBmaWxlUHJvamVjdE1hcDogTWFwPHN0cmluZywgbnVtYmVyPixcbiAgICByZXN1bHQ6IFN5bmNSZXN1bHRcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gQnVpbGQgYSBtYXAgb2YgdmlrdW5qYUlkIFx1MjE5MiBPYnNpZGlhblRhc2sgZm9yIGZhc3QgbG9va3VwXG4gICAgY29uc3QgbG9jYWxCeUlkID0gbmV3IE1hcDxudW1iZXIsIE9ic2lkaWFuVGFzaz4oXG4gICAgICBsb2NhbFRhc2tzXG4gICAgICAgIC5maWx0ZXIoKHQpID0+IHQudmlrdW5qYUlkICE9PSBudWxsKVxuICAgICAgICAubWFwKCh0KSA9PiBbdC52aWt1bmphSWQhLCB0XSlcbiAgICApO1xuXG4gICAgLy8gVHJhY2sgd2hpY2ggcmVtb3RlIHRhc2sgSURzIHdlJ3ZlIGFscmVhZHkgcHJvY2Vzc2VkIHZpYSBwZXItcHJvamVjdFxuICAgIC8vIGZldGNoZXMgc28gd2UgZG9uJ3QgZG91YmxlLWNvdW50IHRoZW0gaW4gdGhlIGZhbGxiYWNrIGdldEFsbFRhc2tzIGNhbGwuXG4gICAgY29uc3QgaGFuZGxlZFJlbW90ZUlkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG4gICAgLy8gXHUyNTAwXHUyNTAwIFBlci1wcm9qZWN0IGltcG9ydCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgICAvLyBHcm91cCBmaWxlcyBieSBwcm9qZWN0IHNvIHdlIG9ubHkgZmV0Y2ggZWFjaCBwcm9qZWN0IG9uY2UgZXZlbiB3aGVuXG4gICAgLy8gbXVsdGlwbGUgbm90ZXMgc2hhcmUgdGhlIHNhbWUgcHJvamVjdCBJRC5cbiAgICBjb25zdCBwcm9qZWN0VG9GaWxlcyA9IG5ldyBNYXA8bnVtYmVyLCBzdHJpbmdbXT4oKTtcbiAgICBmb3IgKGNvbnN0IFtmaWxlUGF0aCwgcHJvamVjdElkXSBvZiBmaWxlUHJvamVjdE1hcCkge1xuICAgICAgY29uc3QgbGlzdCA9IHByb2plY3RUb0ZpbGVzLmdldChwcm9qZWN0SWQpID8/IFtdO1xuICAgICAgbGlzdC5wdXNoKGZpbGVQYXRoKTtcbiAgICAgIHByb2plY3RUb0ZpbGVzLnNldChwcm9qZWN0SWQsIGxpc3QpO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgW3Byb2plY3RJZCwgZmlsZVBhdGhzXSBvZiBwcm9qZWN0VG9GaWxlcykge1xuICAgICAgbGV0IHJlbW90ZVRhc2tzOiBWaWt1bmphVGFza1tdID0gW107XG4gICAgICB0cnkge1xuICAgICAgICByZW1vdGVUYXNrcyA9IGF3YWl0IHRoaXMuY2xpZW50LmdldFByb2plY3RUYXNrcyhwcm9qZWN0SWQpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHJlc3VsdC5lcnJvcnMucHVzaChgRmFpbGVkIHRvIGZldGNoIHRhc2tzIGZvciBwcm9qZWN0ICR7cHJvamVjdElkfTogJHtTdHJpbmcoZXJyKX1gKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIENvbGxlY3QgdGFza3MgdG8gaW1wb3J0IChub3QgeWV0IGluIE9ic2lkaWFuKSBzbyB3ZSBjYW4gYmF0Y2gtYXBwZW5kXG4gICAgICAvLyB0aGVtIGluIGEgc2luZ2xlIGZpbGUgd3JpdGUgcmF0aGVyIHRoYW4gb25lIHdyaXRlIHBlciB0YXNrLlxuICAgICAgY29uc3QgdG9JbXBvcnQ6IFZpa3VuamFUYXNrW10gPSBbXTtcblxuICAgICAgZm9yIChjb25zdCByZW1vdGUgb2YgcmVtb3RlVGFza3MpIHtcbiAgICAgICAgaGFuZGxlZFJlbW90ZUlkcy5hZGQocmVtb3RlLmlkKTtcbiAgICAgICAgY29uc3QgbG9jYWwgPSBsb2NhbEJ5SWQuZ2V0KHJlbW90ZS5pZCk7XG5cbiAgICAgICAgaWYgKGxvY2FsKSB7XG4gICAgICAgICAgLy8gVGFzayBhbHJlYWR5IGluIE9ic2lkaWFuIFx1MjAxNCB1cGRhdGUgZG9uZS90aXRsZSBpZiByZW1vdGUgY2hhbmdlZFxuICAgICAgICAgIGxldCBjaGFuZ2VkID0gZmFsc2U7XG4gICAgICAgICAgaWYgKHJlbW90ZS5kb25lICE9PSBsb2NhbC5kb25lKSB7XG4gICAgICAgICAgICBsb2NhbC5kb25lID0gcmVtb3RlLmRvbmU7XG4gICAgICAgICAgICBjaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlc3VsdC5jb21wbGV0ZWQrKztcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHJlbW90ZS50aXRsZSAhPT0gbG9jYWwudGl0bGUpIHtcbiAgICAgICAgICAgIGxvY2FsLnRpdGxlID0gcmVtb3RlLnRpdGxlO1xuICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICByZXN1bHQudXBkYXRlZCsrO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoY2hhbmdlZCkgYXdhaXQgdGhpcy53cml0ZVRhc2tUb0ZpbGUobG9jYWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFRhc2sgZXhpc3RzIG9ubHkgaW4gVmlrdW5qYSBcdTIwMTQgcXVldWUgaXQgZm9yIGltcG9ydFxuICAgICAgICAgIC8vIFNraXAgY29tcGxldGVkIHRhc2tzIHVubGVzcyB0aGUgdXNlciBvcHRlZCBpblxuICAgICAgICAgIGlmICghcmVtb3RlLmRvbmUgfHwgdGhpcy5zZXR0aW5ncy5zeW5jQ29tcGxldGVkVGFza3MpIHtcbiAgICAgICAgICAgIHRvSW1wb3J0LnB1c2gocmVtb3RlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQXBwZW5kIGFsbCBuZXcgcmVtb3RlIHRhc2tzIHRvIHRoZSBwcmltYXJ5IGZpbGUgZm9yIHRoaXMgcHJvamVjdFxuICAgICAgLy8gKHRoZSBmaXJzdCBmaWxlIHRoYXQgZGVjbGFyZWQgdGhpcyBwcm9qZWN0IGJpbmRpbmcpXG4gICAgICBpZiAodG9JbXBvcnQubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcGVuZFRhc2tzVG9GaWxlKGZpbGVQYXRoc1swXSwgdG9JbXBvcnQsIHJlc3VsdCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gXHUyNTAwXHUyNTAwIEZhbGxiYWNrOiB1cGRhdGUgdHJhY2tlZCB0YXNrcyBub3QgY292ZXJlZCBieSBhbnkgYm91bmQgcHJvamVjdCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgICAvLyBUaGVzZSBhcmUgdGFza3MgdGhhdCBoYXZlIGEgdmlrdW5qYUlkIGluIE9ic2lkaWFuIGJ1dCB3aG9zZSBwcm9qZWN0IGlzXG4gICAgLy8gbm90IGV4cGxpY2l0bHkgYm91bmQgaW4gZnJvbnRtYXR0ZXIgKGUuZy4gdGhleSB1c2UgdGhlIGRlZmF1bHQgcHJvamVjdCkuXG4gICAgY29uc3QgdW5oYW5kbGVkTG9jYWwgPSBsb2NhbFRhc2tzLmZpbHRlcihcbiAgICAgICh0KSA9PiB0LnZpa3VuamFJZCAhPT0gbnVsbCAmJiAhaGFuZGxlZFJlbW90ZUlkcy5oYXModC52aWt1bmphSWQhKVxuICAgICk7XG5cbiAgICBpZiAodW5oYW5kbGVkTG9jYWwubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgICBsZXQgYWxsUmVtb3RlOiBWaWt1bmphVGFza1tdID0gW107XG4gICAgdHJ5IHtcbiAgICAgIGFsbFJlbW90ZSA9IGF3YWl0IHRoaXMuY2xpZW50LmdldEFsbFRhc2tzKCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICByZXN1bHQuZXJyb3JzLnB1c2goYEZhaWxlZCB0byBmZXRjaCByZW1vdGUgdGFza3M6ICR7U3RyaW5nKGVycil9YCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCByZW1vdGUgb2YgYWxsUmVtb3RlKSB7XG4gICAgICBpZiAoaGFuZGxlZFJlbW90ZUlkcy5oYXMocmVtb3RlLmlkKSkgY29udGludWU7XG4gICAgICBjb25zdCBsb2NhbCA9IGxvY2FsQnlJZC5nZXQocmVtb3RlLmlkKTtcbiAgICAgIGlmICghbG9jYWwpIGNvbnRpbnVlO1xuXG4gICAgICBsZXQgY2hhbmdlZCA9IGZhbHNlO1xuICAgICAgaWYgKHJlbW90ZS5kb25lICE9PSBsb2NhbC5kb25lKSB7XG4gICAgICAgIGxvY2FsLmRvbmUgPSByZW1vdGUuZG9uZTtcbiAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgIHJlc3VsdC5jb21wbGV0ZWQrKztcbiAgICAgIH1cbiAgICAgIGlmIChyZW1vdGUudGl0bGUgIT09IGxvY2FsLnRpdGxlKSB7XG4gICAgICAgIGxvY2FsLnRpdGxlID0gcmVtb3RlLnRpdGxlO1xuICAgICAgICBjaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgcmVzdWx0LnVwZGF0ZWQrKztcbiAgICAgIH1cbiAgICAgIGlmIChjaGFuZ2VkKSBhd2FpdCB0aGlzLndyaXRlVGFza1RvRmlsZShsb2NhbCk7XG4gICAgfVxuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEZpbGUgV3JpdGluZyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICAvKipcbiAgICogV3JpdGUgYW4gdXBkYXRlZCB0YXNrIGJhY2sgdG8gaXRzIHNvdXJjZSBmaWxlLlxuICAgKiBSZXBsYWNlcyBvbmx5IHRoZSBzcGVjaWZpYyBsaW5lIFx1MjAxNCBkb2VzIG5vdCB0b3VjaCB0aGUgcmVzdCBvZiB0aGUgZmlsZS5cbiAgICpcbiAgICogQHBhcmFtIHRhc2sgLSBUaGUgdGFzayB3aXRoIHVwZGF0ZWQgZmllbGRzXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHdyaXRlVGFza1RvRmlsZSh0YXNrOiBPYnNpZGlhblRhc2spOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHRhc2suZmlsZVBhdGgpO1xuICAgIGlmICghZmlsZSB8fCAhKFwiZXh0ZW5zaW9uXCIgaW4gZmlsZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRmlsZSBub3QgZm91bmQ6ICR7dGFzay5maWxlUGF0aH1gKTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlIGFzIFRGaWxlKTtcbiAgICBjb25zdCBuZXdMaW5lID0gVGFza1BhcnNlci5zZXJpYWxpc2UodGFzayk7XG4gICAgY29uc3QgbmV3Q29udGVudCA9IFRhc2tQYXJzZXIucmVwbGFjZUxpbmUoY29udGVudCwgdGFzay5saW5lTnVtYmVyLCBuZXdMaW5lKTtcbiAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSBhcyBURmlsZSwgbmV3Q29udGVudCk7XG4gIH1cblxuICAvKipcbiAgICogQXBwZW5kIGEgYmF0Y2ggb2YgVmlrdW5qYSB0YXNrcyB0byBhIGZpbGUgYXMgbmV3IG1hcmtkb3duIHRhc2sgbGluZXMuXG4gICAqIEFsbCB0YXNrcyBhcmUgd3JpdHRlbiBpbiBhIHNpbmdsZSB2YXVsdC5tb2RpZnkgY2FsbCB0byBtaW5pbWlzZSBmaWxlIGNodXJuLlxuICAgKlxuICAgKiBVc2VkIHdoZW4gaW1wb3J0aW5nIHJlbW90ZS1vbmx5IHRhc2tzICh0YXNrcyB0aGF0IGV4aXN0IGluIFZpa3VuamEgYnV0IGhhdmVcbiAgICogbm8gYDwhLS12aWt1bmphOklELS0+YCBjb3VudGVycGFydCBpbiB0aGUgdmF1bHQgeWV0KS5cbiAgICpcbiAgICogQHBhcmFtIGZpbGVQYXRoICAgIC0gVmF1bHQtcmVsYXRpdmUgcGF0aCBvZiB0aGUgdGFyZ2V0IGZpbGVcbiAgICogQHBhcmFtIHJlbW90ZVRhc2tzIC0gVmlrdW5qYSB0YXNrcyB0byBhcHBlbmRcbiAgICogQHBhcmFtIHJlc3VsdCAgICAgIC0gTXV0YWJsZSByZXN1bHQgb2JqZWN0OyBgY3JlYXRlZGAgaXMgaW5jcmVtZW50ZWQgcGVyIHRhc2tcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgYXBwZW5kVGFza3NUb0ZpbGUoXG4gICAgZmlsZVBhdGg6IHN0cmluZyxcbiAgICByZW1vdGVUYXNrczogVmlrdW5qYVRhc2tbXSxcbiAgICByZXN1bHQ6IFN5bmNSZXN1bHRcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmaWxlUGF0aCk7XG4gICAgaWYgKCFmaWxlIHx8ICEoXCJleHRlbnNpb25cIiBpbiBmaWxlKSkgcmV0dXJuO1xuXG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSBhcyBURmlsZSk7XG5cbiAgICBjb25zdCBuZXdMaW5lcyA9IHJlbW90ZVRhc2tzLm1hcCgocmVtb3RlKSA9PiB7XG4gICAgICBjb25zdCB0YXNrOiBPYnNpZGlhblRhc2sgPSB7XG4gICAgICAgIHJhd0xpbmU6IFwiXCIsXG4gICAgICAgIGxpbmVOdW1iZXI6IC0xLFxuICAgICAgICBmaWxlUGF0aCxcbiAgICAgICAgdGl0bGU6IHJlbW90ZS50aXRsZSxcbiAgICAgICAgZG9uZTogcmVtb3RlLmRvbmUsXG4gICAgICAgIGR1ZURhdGU6IFN5bmNFbmdpbmUuZm9ybWF0RGF0ZShyZW1vdGUuZHVlX2RhdGUpLFxuICAgICAgICBzdGFydERhdGU6IFN5bmNFbmdpbmUuZm9ybWF0RGF0ZShyZW1vdGUuc3RhcnRfZGF0ZSksXG4gICAgICAgIHNjaGVkdWxlZERhdGU6IG51bGwsIC8vIFZpa3VuamEgaGFzIG5vIHNjaGVkdWxlZC1kYXRlIGNvbmNlcHRcbiAgICAgICAgcHJpb3JpdHk6IHJlbW90ZS5wcmlvcml0eSxcbiAgICAgICAgcmVjdXJyZW5jZTogVGFza1BhcnNlci5mb3JtYXRSZXBlYXRBZnRlcihyZW1vdGUucmVwZWF0X2FmdGVyKSxcbiAgICAgICAgdmlrdW5qYUlkOiByZW1vdGUuaWQsXG4gICAgICAgIHByb2plY3RJZDogcmVtb3RlLnByb2plY3RfaWQsXG4gICAgICAgIHByb2plY3ROYW1lOiBudWxsLFxuICAgICAgfTtcbiAgICAgIHJldHVybiBUYXNrUGFyc2VyLnNlcmlhbGlzZSh0YXNrKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IG5ld0NvbnRlbnQgPSBjb250ZW50LnRyaW1FbmQoKSArIFwiXFxuXCIgKyBuZXdMaW5lcy5qb2luKFwiXFxuXCIpICsgXCJcXG5cIjtcbiAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSBhcyBURmlsZSwgbmV3Q29udGVudCk7XG5cbiAgICByZXN1bHQuY3JlYXRlZCArPSByZW1vdGVUYXNrcy5sZW5ndGg7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgSGVscGVycyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICAvKipcbiAgICogRmV0Y2ggdGhlIHByb2plY3QgbGlzdCwgdXNpbmcgYSBwZXItcnVuIGluLW1lbW9yeSBjYWNoZSBzbyB0aGF0IG5hbWUtYmFzZWRcbiAgICogZnJvbnRtYXR0ZXIgbG9va3VwcyAoYHZpa3VuamFfcHJvamVjdDogXCJXb3JrIFRhc2tzXCJgKSBhY3Jvc3MgbWFueSBmaWxlc1xuICAgKiBvbmx5IHJlc3VsdCBpbiBhIHNpbmdsZSBBUEkgY2FsbCBwZXIgc3luYyBydW4uXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGdldENhY2hlZFByb2plY3RzKCk6IFByb21pc2U8VmlrdW5qYVByb2plY3RbXT4ge1xuICAgIGlmICghdGhpcy5jYWNoZWRQcm9qZWN0cykge1xuICAgICAgdGhpcy5jYWNoZWRQcm9qZWN0cyA9IGF3YWl0IHRoaXMuY2xpZW50LmdldFByb2plY3RzKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmNhY2hlZFByb2plY3RzO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlc29sdmUgdGhlIGV4cGxpY2l0IHByb2plY3QgSUQgZGVjbGFyZWQgaW4gYSBmaWxlJ3MgZnJvbnRtYXR0ZXIuXG4gICAqXG4gICAqIFN1cHBvcnRzIHR3byBmcm9udG1hdHRlciBwcm9wZXJ0aWVzOlxuICAgKiAtIGB2aWt1bmphX3Byb2plY3RfaWQ6IDNgICBcdTIwMTQgbnVtZXJpYyBJRCwgcmVzb2x2ZWQgZGlyZWN0bHlcbiAgICogLSBgdmlrdW5qYV9wcm9qZWN0OiBcIldvcmsgVGFza3NcImAgXHUyMDE0IHByb2plY3QgbmFtZSwgcmVzb2x2ZWQgdmlhIEFQSVxuICAgKiAgIChjYXNlLWluc2Vuc2l0aXZlIG1hdGNoIGFnYWluc3QgdGhlIGF1dGhlbnRpY2F0ZWQgdXNlcidzIHByb2plY3QgbGlzdClcbiAgICpcbiAgICogUmV0dXJucyBgbnVsbGAgaWYgdGhlIGZpbGUgaGFzIG5vIGV4cGxpY2l0IHByb2plY3QgYmluZGluZy4gRG9lcyBOT1RcbiAgICogZmFsbCBiYWNrIHRvIHRoZSBkZWZhdWx0IHByb2plY3QgXHUyMDE0IHVzZSBgcmVzb2x2ZVByb2plY3RJZGAgZm9yIHRoYXQuXG4gICAqXG4gICAqIEBwYXJhbSBmaWxlIC0gVGhlIGZpbGUgd2hvc2UgZnJvbnRtYXR0ZXIgdG8gaW5zcGVjdFxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBnZXRFeHBsaWNpdFByb2plY3RJZChmaWxlOiBURmlsZSk6IFByb21pc2U8bnVtYmVyIHwgbnVsbD4ge1xuICAgIGNvbnN0IGZyb250bWF0dGVyID0gdGhpcy5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZmlsZSk/LmZyb250bWF0dGVyO1xuXG4gICAgaWYgKGZyb250bWF0dGVyPy52aWt1bmphX3Byb2plY3RfaWQpIHtcbiAgICAgIHJldHVybiBOdW1iZXIoZnJvbnRtYXR0ZXIudmlrdW5qYV9wcm9qZWN0X2lkKTtcbiAgICB9XG5cbiAgICBpZiAoZnJvbnRtYXR0ZXI/LnZpa3VuamFfcHJvamVjdCkge1xuICAgICAgY29uc3QgbmFtZSA9IFN0cmluZyhmcm9udG1hdHRlci52aWt1bmphX3Byb2plY3QpLnRvTG93ZXJDYXNlKCkudHJpbSgpO1xuICAgICAgY29uc3QgcHJvamVjdHMgPSBhd2FpdCB0aGlzLmdldENhY2hlZFByb2plY3RzKCk7XG4gICAgICBjb25zdCBtYXRjaCA9IHByb2plY3RzLmZpbmQoKHApID0+IHAudGl0bGUudG9Mb3dlckNhc2UoKS50cmltKCkgPT09IG5hbWUpO1xuICAgICAgaWYgKG1hdGNoKSByZXR1cm4gbWF0Y2guaWQ7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBbVmlrdW5qYV0gTm8gcHJvamVjdCBmb3VuZCB3aXRoIG5hbWUgXCIke2Zyb250bWF0dGVyLnZpa3VuamFfcHJvamVjdH1cIiBpbiAke2ZpbGUucGF0aH1gXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlc29sdmUgdGhlIGVmZmVjdGl2ZSBWaWt1bmphIHByb2plY3QgSUQgZm9yIGEgZmlsZS5cbiAgICogUmV0dXJucyB0aGUgZXhwbGljaXQgZnJvbnRtYXR0ZXIgYmluZGluZyBpZiBwcmVzZW50LCBvdGhlcndpc2UgdGhlXG4gICAqIHBsdWdpbi13aWRlIGRlZmF1bHQgcHJvamVjdC4gUmV0dXJucyBudWxsIGlmIG5laXRoZXIgaXMgY29uZmlndXJlZC5cbiAgICpcbiAgICogQHBhcmFtIGZpbGUgLSBUaGUgZmlsZSB0byBjaGVja1xuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyByZXNvbHZlUHJvamVjdElkKGZpbGU6IFRGaWxlKTogUHJvbWlzZTxudW1iZXIgfCBudWxsPiB7XG4gICAgcmV0dXJuIChhd2FpdCB0aGlzLmdldEV4cGxpY2l0UHJvamVjdElkKGZpbGUpKSA/PyB0aGlzLnNldHRpbmdzLmRlZmF1bHRQcm9qZWN0SWQ7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgYSBmaWxlIHBhdGggc2hvdWxkIGJlIGV4Y2x1ZGVkIGZyb20gc3luYy5cbiAgICogQHBhcmFtIHBhdGggLSBWYXVsdC1yZWxhdGl2ZSBmaWxlIHBhdGhcbiAgICovXG4gIHByaXZhdGUgaXNFeGNsdWRlZChwYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5zZXR0aW5ncy5leGNsdWRlZEZvbGRlcnMuc29tZSgoZm9sZGVyKSA9PlxuICAgICAgcGF0aC5zdGFydHNXaXRoKGZvbGRlci50cmltKCkgKyBcIi9cIilcbiAgICApO1xuICB9XG5cbiAgLyoqXG4gICAqIEZvcm1hdCBhIFZpa3VuamEgSVNPIGRhdGUgc3RyaW5nIHRvIFlZWVktTU0tREQgZm9yIE9ic2lkaWFuIFRhc2tzIHN5bnRheC5cbiAgICogUmV0dXJucyBudWxsIGZvciBWaWt1bmphJ3MgbnVsbCBkYXRlIHNlbnRpbmVsLlxuICAgKi9cbiAgc3RhdGljIGZvcm1hdERhdGUoaXNvRGF0ZTogc3RyaW5nIHwgbnVsbCk6IHN0cmluZyB8IG51bGwge1xuICAgIGlmICghaXNvRGF0ZSB8fCBpc29EYXRlID09PSBWSUtVTkpBX05VTExfREFURSkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIGlzb0RhdGUuc3BsaXQoXCJUXCIpWzBdO1xuICB9XG59XG4iLCAiLyoqXG4gKiBAZmlsZSB1aS9TZXR0aW5nc1RhYi50c1xuICogQGRlc2NyaXB0aW9uIFBsdWdpbiBzZXR0aW5ncyB0YWIgcmVuZGVyZWQgaW4gT2JzaWRpYW4ncyBTZXR0aW5ncyBwYW5lbC5cbiAqXG4gKiBQcm92aWRlcyBjb25maWd1cmF0aW9uIGZvcjpcbiAqIC0gVmlrdW5qYSBBUEkgVVJMIGFuZCB0b2tlblxuICogLSBTeW5jIGJlaGF2aW91ciAoaW50ZXJ2YWwsIG9uLXNhdmUpXG4gKiAtIERlZmF1bHQgcHJvamVjdFxuICogLSBFeGNsdWRlZCBmb2xkZXJzXG4gKi9cblxuaW1wb3J0IHsgQXBwLCBQbHVnaW5TZXR0aW5nVGFiLCBTZXR0aW5nLCBOb3RpY2UgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB0eXBlIFZpa3VuamFQbHVnaW4gZnJvbSBcIi4uL21haW5cIjtcbmltcG9ydCB0eXBlIHsgVmlrdW5qYVByb2plY3QgfSBmcm9tIFwiLi4vdHlwZXNcIjtcblxuZXhwb3J0IGNsYXNzIFZpa3VuamFTZXR0aW5nc1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogVmlrdW5qYVBsdWdpbjtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBWaWt1bmphUGx1Z2luKSB7XG4gICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICB9XG5cbiAgZGlzcGxheSgpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XG5cbiAgICAvLyBcdTI1MDBcdTI1MDAgQ29ubmVjdGlvbiBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJWaWt1bmphIENvbm5lY3Rpb25cIiB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJWaWt1bmphIFVSTFwiKVxuICAgICAgLnNldERlc2MoXCJCYXNlIFVSTCBvZiB5b3VyIFZpa3VuamEgaW5zdGFuY2UsIGUuZy4gaHR0cHM6Ly92aWt1bmphLmV4YW1wbGUuY29tXCIpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImh0dHBzOi8vdmlrdW5qYS5leGFtcGxlLmNvbVwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hcGlVcmwpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYXBpVXJsID0gdmFsdWUudHJpbSgpLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIkFQSSBUb2tlblwiKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIFwiUGVyc29uYWwgYWNjZXNzIHRva2VuIGZyb20gVmlrdW5qYSBcdTIxOTIgQWNjb3VudCBTZXR0aW5ncyBcdTIxOTIgQVBJIFRva2Vucy4gXCIgK1xuICAgICAgICBcIkdlbmVyYXRlIGEgdG9rZW4gd2l0aCBmdWxsIGFjY2Vzcy5cIlxuICAgICAgKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+IHtcbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIlBhc3RlIHlvdXIgdG9rZW4gaGVyZVwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hcGlUb2tlbilcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5hcGlUb2tlbiA9IHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB0ZXh0LmlucHV0RWwudHlwZSA9IFwicGFzc3dvcmRcIjtcbiAgICAgIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIlRlc3QgQ29ubmVjdGlvblwiKVxuICAgICAgLnNldERlc2MoXCJWZXJpZnkgeW91ciBVUkwgYW5kIHRva2VuIGFyZSBjb3JyZWN0LlwiKVxuICAgICAgLmFkZEJ1dHRvbigoYnRuKSA9PlxuICAgICAgICBidG5cbiAgICAgICAgICAuc2V0QnV0dG9uVGV4dChcIlRlc3RcIilcbiAgICAgICAgICAuc2V0Q3RhKClcbiAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBidG4uc2V0QnV0dG9uVGV4dChcIlRlc3RpbmdcdTIwMjZcIik7XG4gICAgICAgICAgICBidG4uc2V0RGlzYWJsZWQodHJ1ZSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucGx1Z2luLnRlc3RDb25uZWN0aW9uKCk7XG5cbiAgICAgICAgICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiXHUyNzA1IENvbm5lY3RlZCB0byBWaWt1bmphIHN1Y2Nlc3NmdWxseSFcIik7XG4gICAgICAgICAgICAgIC8vIFJlLXJlbmRlciB0aGUgc2V0dGluZ3MgdGFiIHNvIHRoZSBEZWZhdWx0IFByb2plY3QgZHJvcGRvd25cbiAgICAgICAgICAgICAgLy8gaXMgcG9wdWxhdGVkIG5vdyB0aGF0IHdlIGhhdmUgYSBsaXZlIGNvbm5lY3Rpb24uXG4gICAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShgXHUyNzRDIENvbm5lY3Rpb24gZmFpbGVkOiAke3Jlc3VsdC5lcnJvcn1gKTtcbiAgICAgICAgICAgICAgYnRuLnNldEJ1dHRvblRleHQoXCJUZXN0XCIpO1xuICAgICAgICAgICAgICBidG4uc2V0RGlzYWJsZWQoZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgLy8gXHUyNTAwXHUyNTAwIERlZmF1bHQgUHJvamVjdCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJEZWZhdWx0IFByb2plY3RcIiB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJEZWZhdWx0IFByb2plY3RcIilcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICBcIlRhc2tzIGNyZWF0ZWQgaW4gbm90ZXMgd2l0aG91dCBhIHZpa3VuamFfcHJvamVjdF9pZCBmcm9udG1hdHRlciBwcm9wZXJ0eSBcIiArXG4gICAgICAgIFwid2lsbCBiZSBhZGRlZCB0byB0aGlzIHByb2plY3QuXCJcbiAgICAgIClcbiAgICAgIC5hZGREcm9wZG93bihhc3luYyAoZHJvcGRvd24pID0+IHtcbiAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKFwiXCIsIFwiXHUyMDE0IFNlbGVjdCBhIHByb2plY3QgXHUyMDE0XCIpO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcHJvamVjdHM6IFZpa3VuamFQcm9qZWN0W10gPSBhd2FpdCB0aGlzLnBsdWdpbi5jbGllbnQ/LmdldFByb2plY3RzKCkgPz8gW107XG4gICAgICAgICAgZm9yIChjb25zdCBwcm9qZWN0IG9mIHByb2plY3RzKSB7XG4gICAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oU3RyaW5nKHByb2plY3QuaWQpLCBwcm9qZWN0LnRpdGxlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIkNvdWxkIG5vdCBsb2FkIHByb2plY3RzIFx1MjAxNCBjaGVjayBjb25uZWN0aW9uXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgZHJvcGRvd25cbiAgICAgICAgICAuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLmRlZmF1bHRQcm9qZWN0SWQgPz8gXCJcIikpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZGVmYXVsdFByb2plY3RJZCA9IHZhbHVlID8gcGFyc2VJbnQodmFsdWUsIDEwKSA6IG51bGw7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgLy8gXHUyNTAwXHUyNTAwIFByb2plY3QgRmlsZXMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiUHJvamVjdCBGaWxlc1wiIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIkF1dG8tY3JlYXRlIHByb2plY3QgZmlsZXNcIilcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICBcIkF1dG9tYXRpY2FsbHkgY3JlYXRlIG9uZSBtYXJrZG93biBmaWxlIHBlciBWaWt1bmphIHByb2plY3QgaW4gdGhlIFwiICtcbiAgICAgICAgXCJmb2xkZXIgYmVsb3cuIEVhY2ggZmlsZSBpcyBwcmUtY29uZmlndXJlZCB3aXRoIHRoZSBjb3JyZWN0IHByb2plY3QgSUQgXCIgK1xuICAgICAgICBcImFuZCBhY3RzIGFzIHRoZSB0YXNrIGxpc3QgZm9yIHRoYXQgcHJvamVjdC4gRmlsZXMgYXJlIG9ubHkgY3JlYXRlZCBcdTIwMTQgXCIgK1xuICAgICAgICBcIm5ldmVyIGRlbGV0ZWQgb3IgcmVuYW1lZCBcdTIwMTQgc28gcmVuYW1pbmcgYSBwcm9qZWN0IGluIFZpa3VuamEgd29uJ3QgXCIgK1xuICAgICAgICBcImFmZmVjdCBleGlzdGluZyBmaWxlcy5cIlxuICAgICAgKVxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxuICAgICAgICB0b2dnbGVcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0NyZWF0ZVByb2plY3RGaWxlcylcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvQ3JlYXRlUHJvamVjdEZpbGVzID0gdmFsdWU7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIC8vIFNob3cvaGlkZSB0aGUgZm9sZGVyIHNldHRpbmcgd2l0aG91dCBhIGZ1bGwgcmUtcmVuZGVyXG4gICAgICAgICAgICBmb2xkZXJTZXR0aW5nLnNldHRpbmdFbC50b2dnbGUodmFsdWUpO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgY29uc3QgZm9sZGVyU2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJQcm9qZWN0cyBmb2xkZXJcIilcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICBcIlZhdWx0LXJlbGF0aXZlIGZvbGRlciB3aGVyZSBwcm9qZWN0IGZpbGVzIGFyZSBjcmVhdGVkLiBcIiArXG4gICAgICAgIFwiVGhlIGZvbGRlciBpcyBjcmVhdGVkIGF1dG9tYXRpY2FsbHkgaWYgaXQgZG9lc24ndCBleGlzdC4gXCIgK1xuICAgICAgICBcIkV4YW1wbGU6IFZpa3VuamEsIFRhc2tzL1Byb2plY3RzXCJcbiAgICAgIClcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiVmlrdW5qYVwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm9qZWN0c0ZvbGRlcilcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm9qZWN0c0ZvbGRlciA9IHZhbHVlLnRyaW0oKS5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICAvLyBIaWRlIGZvbGRlciBzZXR0aW5nIHdoZW4gYXV0by1jcmVhdGUgaXMgb2ZmXG4gICAgZm9sZGVyU2V0dGluZy5zZXR0aW5nRWwudG9nZ2xlKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9DcmVhdGVQcm9qZWN0RmlsZXMpO1xuXG4gICAgLy8gXHUyNTAwXHUyNTAwIFN5bmMgQmVoYXZpb3VyIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIlN5bmMgQmVoYXZpb3VyXCIgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiU3luYyBvbiBzYXZlXCIpXG4gICAgICAuc2V0RGVzYyhcIkF1dG9tYXRpY2FsbHkgc3luYyB0YXNrcyB3aGVuIHlvdSBzYXZlIGEgbWFya2Rvd24gZmlsZS5cIilcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT5cbiAgICAgICAgdG9nZ2xlXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnN5bmNPblNhdmUpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc3luY09uU2F2ZSA9IHZhbHVlO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiU3luYyBpbnRlcnZhbCAoc2Vjb25kcylcIilcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICBcIkhvdyBvZnRlbiB0byBwb2xsIFZpa3VuamEgZm9yIHJlbW90ZSBjaGFuZ2VzLiBcIiArXG4gICAgICAgIFwiU2V0IHRvIDAgdG8gZGlzYWJsZSBwb2xsaW5nIChzeW5jIG9uIHNhdmUgb25seSkuXCJcbiAgICAgIClcbiAgICAgIC5hZGRTbGlkZXIoKHNsaWRlcikgPT5cbiAgICAgICAgc2xpZGVyXG4gICAgICAgICAgLnNldExpbWl0cygwLCAzNjAwLCAzMClcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc3luY0ludGVydmFsU2Vjb25kcylcbiAgICAgICAgICAuc2V0RHluYW1pY1Rvb2x0aXAoKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnN5bmNJbnRlcnZhbFNlY29uZHMgPSB2YWx1ZTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4ucmVzdGFydFN5bmNJbnRlcnZhbCgpO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIlN5bmMgY29tcGxldGVkIHRhc2tzXCIpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgXCJQdWxsIHRhc2tzIGNvbXBsZXRlZCByZW1vdGVseSAoZS5nLiBieSBjb2xsYWJvcmF0b3JzKSBiYWNrIHRvIE9ic2lkaWFuIFwiICtcbiAgICAgICAgXCJhbmQgbWFyayB0aGVtIGFzIFt4XS5cIlxuICAgICAgKVxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxuICAgICAgICB0b2dnbGVcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc3luY0NvbXBsZXRlZFRhc2tzKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnN5bmNDb21wbGV0ZWRUYXNrcyA9IHZhbHVlO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICAvLyBcdTI1MDBcdTI1MDAgRXhjbHVzaW9ucyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJFeGNsdXNpb25zXCIgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiRXhjbHVkZWQgZm9sZGVyc1wiKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIFwiRm9sZGVycyB0byBleGNsdWRlIGZyb20gdGFzayBzY2FubmluZywgb25lIHBlciBsaW5lLiBcIiArXG4gICAgICAgIFwiVGFza3MgaW4gdGhlc2UgZm9sZGVycyB3aWxsIG5vdCBiZSBzeW5jZWQgdG8gVmlrdW5qYS4gXCIgK1xuICAgICAgICBcIkV4YW1wbGU6IFRlbXBsYXRlcywgQXJjaGl2ZVwiXG4gICAgICApXG4gICAgICAuYWRkVGV4dEFyZWEoKHRleHRhcmVhKSA9PlxuICAgICAgICB0ZXh0YXJlYVxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIlRlbXBsYXRlc1xcbkFyY2hpdmVcXG4udHJhc2hcIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZXhjbHVkZWRGb2xkZXJzLmpvaW4oXCJcXG5cIikpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZXhjbHVkZWRGb2xkZXJzID0gdmFsdWVcbiAgICAgICAgICAgICAgLnNwbGl0KFwiXFxuXCIpXG4gICAgICAgICAgICAgIC5tYXAoKGYpID0+IGYudHJpbSgpKVxuICAgICAgICAgICAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICAvLyBcdTI1MDBcdTI1MDAgVUkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiSW50ZXJmYWNlXCIgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiU2hvdyByaWJib24gaWNvblwiKVxuICAgICAgLnNldERlc2MoXCJTaG93IHRoZSBWaWt1bmphIHN5bmMgYnV0dG9uIGluIHRoZSBsZWZ0IHNpZGViYXIgcmliYm9uLlwiKVxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxuICAgICAgICB0b2dnbGVcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc2hvd1JpYmJvbkljb24pXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2hvd1JpYmJvbkljb24gPSB2YWx1ZTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgLy8gUmliYm9uIGNoYW5nZXMgcmVxdWlyZSByZWxvYWRcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJSZWxvYWQgT2JzaWRpYW4gdG8gYXBwbHkgcmliYm9uIGNoYW5nZXMuXCIpO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFB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QUE7QUFBQTtBQUFBO0FBQUEsRUFRQSxvQkFBMEI7QUFDeEIsU0FBSyxpQkFBaUI7QUFFdEIsUUFBSSxLQUFLLFNBQVMsdUJBQXVCO0FBQUc7QUFFNUMsU0FBSyxxQkFBcUIsT0FBTyxZQUFZLFlBQVk7QUFDdkQsVUFBSSxLQUFLLFlBQVk7QUFDbkIsY0FBTSxLQUFLLFlBQVk7QUFBQSxNQUN6QjtBQUFBLElBQ0YsR0FBRyxLQUFLLFNBQVMsc0JBQXNCLEdBQUk7QUFBQSxFQUM3QztBQUFBO0FBQUEsRUFHQSxtQkFBeUI7QUFDdkIsUUFBSSxLQUFLLHVCQUF1QixNQUFNO0FBQ3BDLGFBQU8sY0FBYyxLQUFLLGtCQUFrQjtBQUM1QyxXQUFLLHFCQUFxQjtBQUFBLElBQzVCO0FBQUEsRUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0Esc0JBQTRCO0FBQzFCLFNBQUssa0JBQWtCO0FBQUEsRUFDekI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVUEsTUFBYyxrQkFBa0IsS0FBZ0M7QUFDOUQsVUFBTSxTQUFTLElBQUk7QUFHbkIsUUFDRSxPQUFPLFlBQVksV0FDbEIsT0FBNEIsU0FBUyxjQUN0QyxDQUFDLE9BQU8sUUFBUSxtQkFBbUIsR0FDbkM7QUFDQTtBQUFBLElBQ0Y7QUFFQSxRQUFJLENBQUMsS0FBSztBQUFZO0FBR3RCLFVBQU0sT0FBTyxLQUFLLElBQUksVUFBVTtBQUFBLE9BQzdCLE1BQU0sT0FBTyxVQUFVLEdBQUc7QUFBQSxJQUM3QjtBQUVBLFFBQUksQ0FBQyxNQUFNO0FBQU07QUFHakIsVUFBTSxXQUFXLE9BQU8sUUFBUSxJQUFJO0FBQ3BDLFFBQUksQ0FBQztBQUFVO0FBR2YsVUFBTSxVQUFVLE1BQU0sS0FBSyxJQUFJLE1BQU0sS0FBSyxLQUFLLElBQUk7QUFDbkQsVUFBTSxRQUFRLFFBQVEsTUFBTSxJQUFJO0FBQ2hDLFVBQU0sT0FBUSxPQUE0QjtBQUcxQyxVQUFNLFdBQVcsU0FBUyxhQUFhLEtBQUssS0FBSztBQUNqRCxVQUFNLGFBQWEsTUFBTSxVQUFVLENBQUMsU0FBUztBQUMzQyxVQUFJLENBQUMsS0FBSyxTQUFTLEdBQUcsS0FBSyxDQUFDLEtBQUssU0FBUyxHQUFHO0FBQUcsZUFBTztBQUV2RCxZQUFNLFdBQVcsS0FBSyxRQUFRLHlCQUF5QixFQUFFLEVBQUUsS0FBSztBQUNoRSxhQUFPLFNBQVMsV0FBVyxTQUFTLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFBQSxJQUNsRCxDQUFDO0FBRUQsUUFBSSxlQUFlO0FBQUk7QUFFdkIsVUFBTSxLQUFLLFdBQVcscUJBQXFCLEtBQUssTUFBTSxZQUFZLElBQUk7QUFBQSxFQUN4RTtBQUNGOyIsCiAgIm5hbWVzIjogWyJpbXBvcnRfb2JzaWRpYW4iXQp9Cg==
