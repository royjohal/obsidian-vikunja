/**
 * @file sync/TaskParser.ts
 * @description Parses Obsidian markdown task syntax into structured ObsidianTask objects,
 * and serialises them back to markdown.
 *
 * Supported syntax (own + Obsidian Tasks plugin compatible):
 *   - [ ] Task title                          → incomplete task
 *   - [x] Task title                          → complete task
 *   - [ ] Task title 📅 2026-04-20            → due date
 *   - [ ] Task title 🛫 2026-04-20            → start date
 *   - [ ] Task title ⏳ 2026-04-20            → scheduled date
 *   - [ ] Task title 🔁 every week            → recurrence → Vikunja repeat_after
 *   - [ ] Task title 🔺                       → highest priority
 *   - [ ] Task title ⏫                       → high priority
 *   - [ ] Task title 🔼                       → medium priority
 *   - [ ] Task title 🔽                       → low priority
 *   - [ ] Task title @project:Work Tasks      → inline project override
 *   - [ ] Task title <!--vikunja:42-->        → synced task with Vikunja ID 42
 *
 * Tokens from the Obsidian Tasks plugin that are stripped but not mapped to Vikunja:
 *   ➕ YYYY-MM-DD   created date
 *   ✅ YYYY-MM-DD   completion date
 *   ❌ YYYY-MM-DD   cancelled date
 *   🆔 <id>         Tasks plugin task ID
 *   ⛔ <id>         blocked-by dependency
 *   🏁 <text>       on-completion action
 */

import type { ObsidianTask } from "../types";
import { PRIORITY_MAP, PRIORITY_MAP_REVERSE } from "../types";

// ─── Regex Patterns ───────────────────────────────────────────────────────────

/** Matches a markdown task line: `- [ ] ...` or `- [x] ...` or `* [ ] ...` */
const TASK_LINE_REGEX = /^(\s*)[-*]\s+\[([x ])\]\s+(.+)$/i;

/**
 * Matches the Vikunja tracking ID in both formats:
 *   %%vikunja:42%%      — new format (Obsidian native comment, hidden in all views)
 *   <!--vikunja:42-->   — old format (kept for backward compatibility)
 *
 * Always write the %% format; read both so existing tasks aren't orphaned.
 */
const VIKUNJA_ID_REGEX = /%%vikunja:(\d+)%%|<!--vikunja:(\d+)-->/;

/** Matches due date: `📅 2026-04-20` */
const DUE_DATE_REGEX = /📅\s*(\d{4}-\d{2}-\d{2})/;

/** Matches start date: `🛫 2026-04-20` */
const START_DATE_REGEX = /🛫\s*(\d{4}-\d{2}-\d{2})/;

/** Matches scheduled date: `⏳ 2026-04-20` */
const SCHEDULED_DATE_REGEX = /⏳\s*(\d{4}-\d{2}-\d{2})/;

/**
 * Captures recurrence text after 🔁, stopping at the next metadata emoji.
 * e.g. `🔁 every week` → captures "every week"
 */
const RECURRENCE_EXTRACT_REGEX = /🔁\s*([^🔺⏫🔼🔽⏬📅🛫⏳➕✅❌🆔⛔🏁@<]+)/;

/**
 * Matches an inline project override: `@project:Work Tasks`
 * Stops at the next metadata marker so multi-word names work without quotes.
 */
const PROJECT_OVERRIDE_REGEX = /@project:([^@<📅🛫⏳🔺⏫🔼🔽⏬➕✅❌🆔⛔🏁%]+)/;

/** All priority emojis */
const PRIORITY_EMOJIS = Object.keys(PRIORITY_MAP);

// ─── Strip-only patterns (tokens we don't map to Vikunja) ────────────────────
// CRITICAL: All emoji regex patterns MUST use the 'u' (unicode) flag.
// Without it, JavaScript regex treats multi-byte UTF-8 emoji as individual bytes,
// which can corrupt them into replacement characters (◆) during matching and replacement.

/** `📅 / 🛫 / ⏳` + date — handled separately but listed here for reference */
const DATE_STRIP_REGEX = /[📅🛫⏳]\s*\d{4}-\d{2}-\d{2}/gu;

/** `🔁 every ...` — full recurrence token */
const RECURRENCE_STRIP_REGEX = /🔁\s*[^🔺⏫🔼🔽⏬📅🛫⏳➕✅❌🆔⛔🏁@<]*/gu;

/** `➕ YYYY-MM-DD` — created date (Tasks plugin) */
const CREATED_DATE_STRIP_REGEX = /➕\s*\d{4}-\d{2}-\d{2}/gu;

/** `✅ YYYY-MM-DD` — completion date (Tasks plugin) */
const DONE_DATE_STRIP_REGEX = /✅\s*\d{4}-\d{2}-\d{2}/gu;

/** `❌ YYYY-MM-DD` — cancelled date (Tasks plugin) */
const CANCELLED_DATE_STRIP_REGEX = /❌\s*\d{4}-\d{2}-\d{2}/gu;

/** `🆔 <word>` — Tasks plugin internal task ID */
const TASK_ID_STRIP_REGEX = /🆔\s*\S*/gu;

/** `⛔ <word>` — blocked-by dependency (Tasks plugin) */
const BLOCKED_BY_STRIP_REGEX = /⛔\s*\S*/gu;

/** `🏁 <word>` — on-completion action (Tasks plugin) */
const FINISH_ON_STRIP_REGEX = /🏁\s*\S*/gu;

// ─── Parser ───────────────────────────────────────────────────────────────────

export class TaskParser {
  /**
   * Parse all task lines from a markdown file's content.
   */
  static parseFile(content: string, filePath: string): ObsidianTask[] {
    return content
      .split("\n")
      .map((line, i) => TaskParser.parseLine(line, i, filePath))
      .filter((t): t is ObsidianTask => t !== null);
  }

  /**
   * Parse a single line into an ObsidianTask, or return null if not a task.
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

    // Vikunja tracking ID — group 1 = new %% format, group 2 = old <!-- --> format
    const vikunjaMatch = rawContent.match(VIKUNJA_ID_REGEX);
    const vikunjaId = vikunjaMatch
      ? parseInt(vikunjaMatch[1] ?? vikunjaMatch[2], 10)
      : null;

    // Dates
    const dueDateMatch = rawContent.match(DUE_DATE_REGEX);
    const startDateMatch = rawContent.match(START_DATE_REGEX);
    const scheduledDateMatch = rawContent.match(SCHEDULED_DATE_REGEX);

    // Priority
    let priority = 0;
    for (const [emoji, value] of Object.entries(PRIORITY_MAP)) {
      if (rawContent.includes(emoji)) {
        priority = value;
        break;
      }
    }

    // Recurrence (`🔁 every week` etc.)
    const recurrenceMatch = rawContent.match(RECURRENCE_EXTRACT_REGEX);
    const recurrence = recurrenceMatch ? recurrenceMatch[1].trim() : null;

    // Inline project override (`@project:Name`)
    const projectMatch = rawContent.match(PROJECT_OVERRIDE_REGEX);
    const projectName = projectMatch ? projectMatch[1].trim() : null;

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
      recurrence,
      vikunjaId,
      projectId: null,
      projectName,
    };
  }

  /**
   * Strip all metadata tokens from a task title, leaving only human-readable text.
   *
   * Strips:
   * - Our own tokens: dates, priority, @project:, <!--vikunja:-->, 🔁 recurrence
   * - Obsidian Tasks plugin tokens: ➕ ✅ ❌ 🆔 ⛔ 🏁
   */
  static cleanTitle(raw: string): string {
    let t = raw;

    // Our own tokens — strip both %% and <!-- --> formats
    t = t.replace(/%%vikunja:\d+%%/g, "");
    t = t.replace(/<!--vikunja:\d+-->/g, "");
    t = t.replace(DATE_STRIP_REGEX, "");
    t = t.replace(RECURRENCE_STRIP_REGEX, "");
    t = t.replace(PROJECT_OVERRIDE_REGEX, "");
    // CRITICAL: Use replaceAll instead of replace for emoji to handle multiple occurrences
    // If a title has multiple emoji (e.g. both priority and date), .replace() only removes
    // the first one, leaving others behind as replacement characters (◆).
    for (const emoji of PRIORITY_EMOJIS) {
      t = t.replaceAll(emoji, "");
    }

    // Tasks plugin tokens (strip-only — not mapped to Vikunja)
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
  static serialise(task: ObsidianTask): string {
    const indentMatch = task.rawLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : "";

    const checkmark = task.done ? "x" : " ";
    let line = `${indent}- [${checkmark}] ${task.title}`;

    // Inline project override — kept so routing survives round-trips
    if (task.projectName) line += ` @project:${task.projectName}`;

    // Recurrence
    if (task.recurrence) line += ` 🔁 ${task.recurrence}`;

    // Priority
    if (task.priority > 0 && PRIORITY_MAP_REVERSE[task.priority]) {
      line += ` ${PRIORITY_MAP_REVERSE[task.priority]}`;
    }

    // Dates
    if (task.startDate)     line += ` 🛫 ${task.startDate}`;
    if (task.scheduledDate) line += ` ⏳ ${task.scheduledDate}`;
    if (task.dueDate)       line += ` 📅 ${task.dueDate}`;

    // Vikunja tracking ID — %% is Obsidian's native comment syntax, hidden in all rendered views
    if (task.vikunjaId !== null) line += ` %%vikunja:${task.vikunjaId}%%`;

    return line;
  }

  /**
   * Replace a specific line in file content with a new task serialisation.
   */
  static replaceLine(content: string, lineNumber: number, newLine: string): string {
    const lines = content.split("\n");
    lines[lineNumber] = newLine;
    return lines.join("\n");
  }

  /** Quick check — does this line look like a task? */
  static isTaskLine(line: string): boolean {
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
  static parseRepeatAfter(recurrence: string | null): number | undefined {
    if (!recurrence) return undefined;
    const r = recurrence.toLowerCase().trim();

    const SECOND = 1;
    const DAY    = 86_400 * SECOND;
    const WEEK   = 7  * DAY;
    const MONTH  = 30 * DAY;
    const YEAR   = 365 * DAY;

    if (r === "every day"   || r === "daily")   return DAY;
    if (r === "every week"  || r === "weekly")  return WEEK;
    if (r === "every month" || r === "monthly") return MONTH;
    if (r === "every year"  || r === "yearly")  return YEAR;
    if (r === "every other day")                return 2 * DAY;

    const m = r.match(/^every (\d+) (day|week|month|year)s?$/);
    if (m) {
      const n = parseInt(m[1], 10);
      const units: Record<string, number> = { day: DAY, week: WEEK, month: MONTH, year: YEAR };
      return n * units[m[2]];
    }

    return undefined; // Pattern not recognised — we'll skip repeat_after
  }

  /**
   * Convert Vikunja's `repeat_after` (seconds) back to a human-readable
   * recurrence string for display in Obsidian.
   * Returns null when repeat_after is 0 (no recurrence).
   */
  static formatRepeatAfter(seconds: number): string | null {
    if (!seconds || seconds <= 0) return null;

    const DAY   = 86_400;
    const WEEK  = 7  * DAY;
    const MONTH = 30 * DAY;
    const YEAR  = 365 * DAY;

    if (seconds % YEAR  === 0) return seconds === YEAR  ? "every year"  : `every ${seconds / YEAR} years`;
    if (seconds % MONTH === 0) return seconds === MONTH ? "every month" : `every ${seconds / MONTH} months`;
    if (seconds % WEEK  === 0) return seconds === WEEK  ? "every week"  : `every ${seconds / WEEK} weeks`;
    if (seconds % DAY   === 0) return seconds === DAY   ? "every day"   : `every ${seconds / DAY} days`;

    // Fall back to days (rounded) for irregular values
    const days = Math.round(seconds / DAY);
    return days === 1 ? "every day" : `every ${days} days`;
  }
}
