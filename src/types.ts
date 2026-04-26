/**
 * @file types.ts
 * @description Core TypeScript interfaces representing Vikunja API data shapes.
 * These are used throughout the plugin to ensure type safety when communicating
 * with the Vikunja API and when storing task data locally.
 */

// ─── Vikunja API Types ────────────────────────────────────────────────────────

/** A Vikunja project (formerly called "list") */
export interface VikunjaProject {
  id: number;
  title: string;
  description: string;
  is_archived: boolean;
  hex_color: string;
  parent_project_id: number;
}

/** A label that can be applied to tasks */
export interface VikunjaLabel {
  id: number;
  title: string;
  hex_color: string;
  description: string;
}

/** A user assignee on a task */
export interface VikunjaUser {
  id: number;
  username: string;
  name: string;
  email: string;
}

/** A single Vikunja task */
export interface VikunjaTask {
  id: number;
  title: string;
  description: string;
  done: boolean;
  done_at: string | null;
  due_date: string | null;
  start_date: string | null;
  end_date: string | null;
  priority: number;
  labels: VikunjaLabel[];
  assignees: VikunjaUser[];
  project_id: number;
  created: string;
  updated: string;
  /** Vikunja's null date sentinel value */
  repeat_after: number;
  percent_done: number;
}

/** Payload for creating a new task */
export interface CreateTaskPayload {
  title: string;
  description?: string;
  done?: boolean;
  due_date?: string;
  start_date?: string;
  end_date?: string;
  priority?: number;
  project_id?: number;
}

/** Payload for updating an existing task */
export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  done?: boolean;
  due_date?: string;
  start_date?: string;
  end_date?: string;
  priority?: number;
  labels?: VikunjaLabel[];
}

// ─── Plugin Internal Types ────────────────────────────────────────────────────

/**
 * Represents a task as parsed from an Obsidian markdown file.
 * This is the bridge between Obsidian's `- [ ]` syntax and Vikunja tasks.
 */
export interface ObsidianTask {
  /** Raw markdown line, e.g. `- [ ] My task 📅 2026-04-20` */
  rawLine: string;
  /** Line number in the file (0-indexed) */
  lineNumber: number;
  /** The file path this task was found in */
  filePath: string;
  /** Parsed task title (stripped of metadata) */
  title: string;
  /** Whether the checkbox is checked */
  done: boolean;
  /** Parsed due date if present (📅 emoji syntax) */
  dueDate: string | null;
  /** Parsed start date if present (🛫 emoji syntax) */
  startDate: string | null;
  /** Parsed scheduled date if present (⏳ emoji syntax) */
  scheduledDate: string | null;
  /** Priority if present (🔺 highest, ⏫ high, 🔼 medium, 🔽 low) */
  priority: number;
  /** The Vikunja task ID if this task has been synced (stored as inline metadata) */
  vikunjaId: number | null;
  /** The Vikunja project ID inferred from the file's frontmatter or folder */
  projectId: number | null;
}

/** Plugin settings stored in Obsidian's data.json */
export interface VikunjaPluginSettings {
  /** Base URL of your Vikunja instance, e.g. https://vikunja.example.com */
  apiUrl: string;
  /** Personal access token generated in Vikunja Account Settings */
  apiToken: string;
  /** How often to poll Vikunja for remote changes, in seconds. 0 = disabled */
  syncIntervalSeconds: number;
  /** Whether to sync tasks on file save */
  syncOnSave: boolean;
  /** Default project ID for tasks created without a project context */
  defaultProjectId: number | null;
  /** Whether to show a ribbon icon in the sidebar */
  showRibbonIcon: boolean;
  /** Whether to sync completed tasks back to Obsidian */
  syncCompletedTasks: boolean;
  /** Folders to exclude from task scanning (comma-separated) */
  excludedFolders: string[];
}

/** Default plugin settings */
export const DEFAULT_SETTINGS: VikunjaPluginSettings = {
  apiUrl: "",
  apiToken: "",
  syncIntervalSeconds: 300,
  syncOnSave: true,
  defaultProjectId: null,
  showRibbonIcon: true,
  syncCompletedTasks: true,
  excludedFolders: [],
};

// ─── Sync State Types ─────────────────────────────────────────────────────────

/** Result of a sync operation */
export interface SyncResult {
  created: number;
  updated: number;
  completed: number;
  errors: string[];
  timestamp: Date;
}

/** Maps a Vikunja task ID to its location in the vault */
export interface TaskLocation {
  filePath: string;
  lineNumber: number;
  vikunjaId: number;
}

/** The null date Vikunja uses when no date is set */
export const VIKUNJA_NULL_DATE = "0001-01-01T00:00:00Z";

/** Priority mappings between Obsidian emoji syntax and Vikunja priority numbers */
export const PRIORITY_MAP: Record<string, number> = {
  "🔺": 5, // Highest
  "⏫": 4, // High
  "🔼": 3, // Medium
  "🔽": 2, // Low
  "⏬": 1, // Lowest
};

export const PRIORITY_MAP_REVERSE: Record<number, string> = {
  5: "🔺",
  4: "⏫",
  3: "🔼",
  2: "🔽",
  1: "⏬",
};
