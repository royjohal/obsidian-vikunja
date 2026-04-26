/**
 * @file sync/TaskParser.ts
 * @description Parses Obsidian markdown task syntax into structured ObsidianTask objects,
 * and serialises them back to markdown.
 *
 * Supported syntax:
 *   - [ ] Task title                        → incomplete task
 *   - [x] Task title                        → complete task
 *   - [ ] Task title 📅 2026-04-20          → due date
 *   - [ ] Task title 🛫 2026-04-20          → start date
 *   - [ ] Task title ⏳ 2026-04-20          → scheduled date
 *   - [ ] Task title 🔺                     → highest priority
 *   - [ ] Task title ⏫                     → high priority
 *   - [ ] Task title 🔼                     → medium priority
 *   - [ ] Task title 🔽                     → low priority
 *   - [ ] Task title <!--vikunja:42-->      → synced task with Vikunja ID 42
 *
 * This is compatible with the Obsidian Tasks plugin syntax so existing
 * task files will be understood correctly.
 */

import type { ObsidianTask } from "../types";
import { PRIORITY_MAP, PRIORITY_MAP_REVERSE } from "../types";

// ─── Regex Patterns ───────────────────────────────────────────────────────────

/** Matches a markdown task line: `- [ ] ...` or `- [x] ...` or `* [ ] ...` */
const TASK_LINE_REGEX = /^(\s*)[-*]\s+\[([x ])\]\s+(.+)$/i;

/** Matches the Vikunja ID comment: `<!--vikunja:42-->` */
const VIKUNJA_ID_REGEX = /<!--vikunja:(\d+)-->/;

/** Matches due date emoji: `📅 2026-04-20` */
const DUE_DATE_REGEX = /📅\s*(\d{4}-\d{2}-\d{2})/;

/** Matches start date emoji: `🛫 2026-04-20` */
const START_DATE_REGEX = /🛫\s*(\d{4}-\d{2}-\d{2})/;

/** Matches scheduled date emoji: `⏳ 2026-04-20` */
const SCHEDULED_DATE_REGEX = /⏳\s*(\d{4}-\d{2}-\d{2})/;

/** All priority emojis — used to strip from title */
const PRIORITY_EMOJIS = Object.keys(PRIORITY_MAP);

/** All date emojis and their trailing content — used to strip from title */
const DATE_STRIP_REGEX = /[📅🛫⏳]\s*\d{4}-\d{2}-\d{2}/g;

// ─── Parser ───────────────────────────────────────────────────────────────────

export class TaskParser {
  /**
   * Parse all task lines from a markdown file's content.
   *
   * @param content  - Full file content
   * @param filePath - Vault-relative path to the file
   * @returns Array of parsed ObsidianTask objects
   */
  static parseFile(content: string, filePath: string): ObsidianTask[] {
    const lines = content.split("\n");
    const tasks: ObsidianTask[] = [];

    for (let i = 0; i < lines.length; i++) {
      const task = TaskParser.parseLine(lines[i], i, filePath);
      if (task) tasks.push(task);
    }

    return tasks;
  }

  /**
   * Parse a single line into an ObsidianTask, or return null if it's not a task.
   *
   * @param line       - Raw markdown line
   * @param lineNumber - 0-indexed line number in the file
   * @param filePath   - Vault-relative path to the file
   */
  static parseLine(
    line: string,
    lineNumber: number,
    filePath: string
  ): ObsidianTask | null {
    const match = line.match(TASK_LINE_REGEX);
    if (!match) return null;

    const [, , checkmark, rawContent] = match;
    const done = checkmark.toLowerCase() === "x";

    // Extract Vikunja ID if present
    const vikunjaMatch = rawContent.match(VIKUNJA_ID_REGEX);
    const vikunjaId = vikunjaMatch ? parseInt(vikunjaMatch[1], 10) : null;

    // Extract dates
    const dueDateMatch = rawContent.match(DUE_DATE_REGEX);
    const startDateMatch = rawContent.match(START_DATE_REGEX);
    const scheduledDateMatch = rawContent.match(SCHEDULED_DATE_REGEX);

    // Extract priority
    let priority = 0;
    for (const [emoji, value] of Object.entries(PRIORITY_MAP)) {
      if (rawContent.includes(emoji)) {
        priority = value;
        break;
      }
    }

    // Clean title: strip all metadata markers
    const title = TaskParser.cleanTitle(rawContent);

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
      vikunjaId,
      projectId: null, // Resolved later from frontmatter or folder mapping
    };
  }

  /**
   * Strip all metadata from a task title, leaving only the human-readable text.
   * Removes: date emojis+dates, priority emojis, Vikunja ID comments, extra whitespace.
   *
   * @param raw - Raw task content (after the checkbox)
   */
  static cleanTitle(raw: string): string {
    let title = raw;

    // Remove Vikunja ID comment
    title = title.replace(VIKUNJA_ID_REGEX, "");

    // Remove date emoji + date pairs
    title = title.replace(DATE_STRIP_REGEX, "");

    // Remove priority emojis
    for (const emoji of PRIORITY_EMOJIS) {
      title = title.replace(emoji, "");
    }

    // Normalise whitespace
    return title.trim().replace(/\s+/g, " ");
  }

  // ─── Serialisation ──────────────────────────────────────────────────────────

  /**
   * Serialise an ObsidianTask back to a markdown line.
   * Preserves the original indentation from rawLine if available.
   *
   * @param task - The task to serialise
   */
  static serialise(task: ObsidianTask): string {
    // Preserve original indentation
    const indentMatch = task.rawLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : "";

    const checkmark = task.done ? "x" : " ";
    let line = `${indent}- [${checkmark}] ${task.title}`;

    // Append priority emoji
    if (task.priority > 0 && PRIORITY_MAP_REVERSE[task.priority]) {
      line += ` ${PRIORITY_MAP_REVERSE[task.priority]}`;
    }

    // Append date metadata
    if (task.startDate) line += ` 🛫 ${task.startDate}`;
    if (task.scheduledDate) line += ` ⏳ ${task.scheduledDate}`;
    if (task.dueDate) line += ` 📅 ${task.dueDate}`;

    // Append Vikunja ID as hidden comment — this is how we track which
    // Obsidian task corresponds to which Vikunja task across syncs
    if (task.vikunjaId !== null) {
      line += ` <!--vikunja:${task.vikunjaId}-->`;
    }

    return line;
  }

  /**
   * Update a specific line in a file's content with a new task serialisation.
   *
   * @param content    - Full file content
   * @param lineNumber - Line to replace (0-indexed)
   * @param newLine    - Replacement line
   */
  static replaceLine(content: string, lineNumber: number, newLine: string): string {
    const lines = content.split("\n");
    lines[lineNumber] = newLine;
    return lines.join("\n");
  }

  /**
   * Check whether a line looks like a task (quick check without full parse).
   * Used as a fast pre-filter before full parsing.
   */
  static isTaskLine(line: string): boolean {
    return TASK_LINE_REGEX.test(line);
  }
}
