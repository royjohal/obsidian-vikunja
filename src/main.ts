/**
 * @file main.ts
 * @description Entry point for the Vikunja Sync Obsidian plugin.
 *
 * Responsibilities:
 * - Plugin lifecycle (onload / onunload)
 * - Wiring together the API client, sync engine, and UI
 * - Registering event listeners (file-save, editor-click)
 * - Managing the periodic sync interval
 * - Exposing commands to the Obsidian command palette
 */

import {
  Plugin,
  Notice,
  TFile,
  type MarkdownPostProcessorContext,
} from "obsidian";

import { VikunjaClient } from "./api/VikunjaClient";
import { SyncEngine } from "./sync/SyncEngine";
import { VikunjaSettingsTab } from "./ui/SettingsTab";
import {
  DEFAULT_SETTINGS,
  type VikunjaPluginSettings,
} from "./types";

export default class VikunjaPlugin extends Plugin {
  /** Persisted plugin settings */
  settings!: VikunjaPluginSettings;

  /** HTTP client for the Vikunja API — null until settings are configured */
  client: VikunjaClient | null = null;

  /** Sync engine — null until client is ready */
  private syncEngine: SyncEngine | null = null;

  /** Handle for the periodic sync interval so we can clear/restart it */
  private syncIntervalHandle: number | null = null;

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async onload(): Promise<void> {
    console.log("[Vikunja] Plugin loading…");

    // Load persisted settings
    await this.loadSettings();

    // Initialise API client if credentials are present
    this.initClient();

    // Register settings tab
    this.addSettingTab(new VikunjaSettingsTab(this.app, this));

    // Register ribbon icon
    if (this.settings.showRibbonIcon) {
      this.addRibbonIcon("refresh-cw", "Sync Vikunja tasks", async () => {
        await this.runFullSync();
      });
    }

    // Register commands
    this.addCommand({
      id: "sync-all",
      name: "Sync all tasks with Vikunja",
      callback: async () => {
        await this.runFullSync();
      },
    });

    this.addCommand({
      id: "sync-current-file",
      name: "Sync current file with Vikunja",
      editorCallback: async (editor, view) => {
        if (view.file) await this.syncFile(view.file);
      },
    });

    // Register file-save handler
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (
          this.settings.syncOnSave &&
          this.syncEngine &&
          file instanceof TFile &&
          file.extension === "md"
        ) {
          await this.syncFile(file);
        }
      })
    );

    // Register editor click handler for checkbox toggles
    this.registerDomEvent(document, "click", async (evt) => {
      await this.handleEditorClick(evt);
    });

    // Start periodic sync
    this.startSyncInterval();

    console.log("[Vikunja] Plugin loaded.");
  }

  onunload(): void {
    this.stopSyncInterval();
    console.log("[Vikunja] Plugin unloaded.");
  }

  // ─── Settings ────────────────────────────────────────────────────────────────

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Re-initialise client in case URL/token changed
    this.initClient();
  }

  // ─── Client Initialisation ───────────────────────────────────────────────────

  /**
   * Initialise (or re-initialise) the API client and sync engine.
   * Safe to call multiple times — replaces existing instances.
   */
  private initClient(): void {
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
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.client) {
      return { success: false, error: "No URL or token configured." };
    }
    return this.client.testConnection();
  }

  // ─── Sync ────────────────────────────────────────────────────────────────────

  /**
   * Run a full vault sync and display a Notice with the result.
   */
  async runFullSync(): Promise<void> {
    if (!this.syncEngine) {
      new Notice("⚠️ Vikunja: Please configure your API URL and token in settings.");
      return;
    }

    const notice = new Notice("🔄 Vikunja: Syncing…", 0);

    try {
      const result = await this.syncEngine.sync();
      notice.hide();

      const summary = [
        result.created > 0 ? `${result.created} created` : null,
        result.updated > 0 ? `${result.updated} updated` : null,
        result.completed > 0 ? `${result.completed} completed` : null,
      ]
        .filter(Boolean)
        .join(", ");

      if (result.errors.length > 0) {
        new Notice(`⚠️ Vikunja sync finished with errors:\n${result.errors.join("\n")}`, 8000);
      } else if (summary) {
        new Notice(`✅ Vikunja: ${summary}`);
      } else {
        new Notice("✅ Vikunja: Everything up to date.");
      }
    } catch (err) {
      notice.hide();
      new Notice(`❌ Vikunja sync failed: ${String(err)}`, 8000);
    }
  }

  /**
   * Sync a single file — called on file-save events.
   * Runs silently (no Notice) to avoid interrupting the user.
   */
  async syncFile(file: TFile): Promise<void> {
    if (!this.syncEngine) return;

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
  startSyncInterval(): void {
    this.stopSyncInterval();

    if (this.settings.syncIntervalSeconds <= 0) return;

    this.syncIntervalHandle = window.setInterval(async () => {
      if (this.syncEngine) {
        await this.runFullSync();
      }
    }, this.settings.syncIntervalSeconds * 1000);
  }

  /** Stop the current sync interval if running */
  stopSyncInterval(): void {
    if (this.syncIntervalHandle !== null) {
      window.clearInterval(this.syncIntervalHandle);
      this.syncIntervalHandle = null;
    }
  }

  /**
   * Restart the sync interval — called when interval setting changes.
   */
  restartSyncInterval(): void {
    this.startSyncInterval();
  }

  // ─── Editor Interaction ──────────────────────────────────────────────────────

  /**
   * Handle clicks in the editor to detect checkbox toggles.
   * Intercepts clicks on task checkboxes in reading view and live preview.
   *
   * @param evt - DOM click event
   */
  private async handleEditorClick(evt: MouseEvent): Promise<void> {
    const target = evt.target as HTMLElement;

    // Only care about checkboxes inside task list items
    if (
      target.tagName !== "INPUT" ||
      (target as HTMLInputElement).type !== "checkbox" ||
      !target.closest("li.task-list-item")
    ) {
      return;
    }

    if (!this.syncEngine) return;

    // Find which file this checkbox belongs to
    const view = this.app.workspace.getActiveViewOfType(
      (await import("obsidian")).MarkdownView
    );

    if (!view?.file) return;

    // Find the line number by looking at the DOM context
    const listItem = target.closest("li");
    if (!listItem) return;

    // Read the file and find the matching task line
    const content = await this.app.vault.read(view.file);
    const lines = content.split("\n");
    const done = (target as HTMLInputElement).checked;

    // Find the line by matching the text content of the list item
    const itemText = listItem.textContent?.trim() ?? "";
    const lineNumber = lines.findIndex((line) => {
      if (!line.includes("[") || !line.includes("]")) return false;
      // Strip the checkbox syntax to compare with DOM text
      const stripped = line.replace(/^[\s\-*]+\[[x ]\]\s*/i, "").trim();
      return itemText.startsWith(stripped.slice(0, 30));
    });

    if (lineNumber === -1) return;

    await this.syncEngine.handleCheckboxToggle(view.file, lineNumber, done);
  }
}
