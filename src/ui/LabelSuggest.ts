/**
 * @file ui/LabelSuggest.ts
 * @description Provides autocomplete suggestions for Vikunja labels when typing #tagname.
 *
 * When the user types # in a task line, this suggests matching labels from Vikunja.
 */

import {
  EditorSuggest,
  EditorPosition,
  Editor,
  TFile,
  App,
  type EditorSuggestContext,
  type EditorSuggestTriggerInfo,
} from "obsidian";
import type { VikunjaLabel } from "../types";

/**
 * A single label suggestion item (what EditorSuggest works with)
 */
interface LabelSuggestion {
  label: VikunjaLabel;
  displayText: string;
}

export class LabelSuggest extends EditorSuggest<LabelSuggestion> {
  /** Callback to get current labels — allows dynamic updates */
  private getLabels: () => VikunjaLabel[];

  constructor(app: App, getLabels: () => VikunjaLabel[]) {
    super(app);
    this.getLabels = getLabels;
  }

  /**
   * Return trigger info if suggestions should be shown at this cursor position.
   * We show suggestions when:
   * - The cursor is after a `#` character
   * - We're on a task line (starts with `- [ ]` or `- [x]`)
   */
  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);

    // Only suggest on task lines
    if (!line.match(/^\s*[-*]\s+\[.\]\s+/)) {
      return null;
    }

    // Find the last `#` before the cursor
    const lineBeforeCursor = line.substring(0, cursor.ch);
    const hashIndex = lineBeforeCursor.lastIndexOf("#");

    if (hashIndex === -1) {
      return null;
    }

    // Check if the character before `#` is whitespace or start of line
    // (to avoid matching in URLs or other contexts)
    if (hashIndex > 0 && !/\s/.test(line[hashIndex - 1])) {
      return null;
    }

    // Extract the text being typed after `#`
    const queryStart = hashIndex + 1;
    const query = lineBeforeCursor.substring(queryStart).trim();

    // Don't suggest if there's a space after # (user is done typing the tag)
    if (lineBeforeCursor.substring(queryStart).includes(" ") && query.length > 0) {
      return null;
    }

    return {
      start: { line: cursor.line, ch: queryStart },
      end: cursor,
      query: query.toLowerCase(),
    };
  }

  /**
   * Return matching label suggestions for the given query.
   */
  getSuggestions(context: EditorSuggestContext): LabelSuggestion[] {
    const labels = this.getLabels();
    const query = context.query.toLowerCase();

    return labels
      .filter((label) =>
        label.title.toLowerCase().startsWith(query) ||
        label.title.toLowerCase().includes(query)
      )
      .slice(0, 10) // Limit to 10 suggestions
      .map((label) => ({
        label,
        displayText: this.labelToTag(label.title),
      }));
  }

  /**
   * Render a suggestion item in the dropdown.
   */
  renderSuggestion(item: LabelSuggestion, el: HTMLElement): void {
    el.createEl("div", {
      text: `#${item.displayText}`,
      cls: "vikunja-label-suggest",
    });
  }

  /**
   * Insert the selected suggestion into the editor.
   */
  selectSuggestion(item: LabelSuggestion, evt: MouseEvent | KeyboardEvent): void {
    const editor = this.context?.editor;
    if (!editor || !this.context) return;

    const start = this.context.start;
    const end = this.context.end;
    const tagName = this.labelToTag(item.label.title);

    // Replace the text from `#` to cursor with the full tag name
    editor.replaceRange(tagName, start, end);

    // Move cursor to after the tag name so user can continue typing more tags
    const newPos: EditorPosition = {
      line: start.line,
      ch: start.ch + tagName.length,
    };
    editor.setCursor(newPos);
  }

  /**
   * Convert a label title to a tag-safe format (lowercase, hyphens for spaces).
   * Example: "My Important Label" → "my-important-label"
   */
  private labelToTag(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-") // spaces → dashes
      .replace(/[^\w-]/g, ""); // remove special chars
  }
}
