/**
 * @file ui/SettingsTab.ts
 * @description Plugin settings tab rendered in Obsidian's Settings panel.
 *
 * Provides configuration for:
 * - Vikunja API URL and token
 * - Sync behaviour (interval, on-save)
 * - Default project
 * - Excluded folders
 */

import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type VikunjaPlugin from "../main";
import type { VikunjaProject } from "../types";

export class VikunjaSettingsTab extends PluginSettingTab {
  private readonly plugin: VikunjaPlugin;

  constructor(app: App, plugin: VikunjaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Connection ────────────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Vikunja Connection" });

    new Setting(containerEl)
      .setName("Vikunja URL")
      .setDesc("Base URL of your Vikunja instance, e.g. https://vikunja.example.com")
      .addText((text) =>
        text
          .setPlaceholder("https://vikunja.example.com")
          .setValue(this.plugin.settings.apiUrl)
          .onChange(async (value) => {
            this.plugin.settings.apiUrl = value.trim().replace(/\/$/, "");
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API Token")
      .setDesc(
        "Personal access token from Vikunja → Account Settings → API Tokens. " +
        "Generate a token with full access."
      )
      .addText((text) => {
        text
          .setPlaceholder("Paste your token here")
          .setValue(this.plugin.settings.apiToken)
          .onChange(async (value) => {
            this.plugin.settings.apiToken = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
      });

    new Setting(containerEl)
      .setName("Test Connection")
      .setDesc("Verify your URL and token are correct.")
      .addButton((btn) =>
        btn
          .setButtonText("Test")
          .setCta()
          .onClick(async () => {
            btn.setButtonText("Testing…");
            btn.setDisabled(true);

            const result = await this.plugin.testConnection();

            if (result.success) {
              new Notice("✅ Connected to Vikunja successfully!");
              // Re-render the settings tab so the Default Project dropdown
              // is populated now that we have a live connection.
              this.display();
            } else {
              new Notice(`❌ Connection failed: ${result.error}`);
              btn.setButtonText("Test");
              btn.setDisabled(false);
            }
          })
      );

    // ── Default Project ───────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Default Project" });

    new Setting(containerEl)
      .setName("Default Project")
      .setDesc(
        "Tasks created in notes without a vikunja_project_id frontmatter property " +
        "will be added to this project."
      )
      .addDropdown(async (dropdown) => {
        dropdown.addOption("", "— Select a project —");

        try {
          const projects: VikunjaProject[] = await this.plugin.client?.getProjects() ?? [];
          for (const project of projects) {
            dropdown.addOption(String(project.id), project.title);
          }
        } catch {
          dropdown.addOption("", "Could not load projects — check connection");
        }

        dropdown
          .setValue(String(this.plugin.settings.defaultProjectId ?? ""))
          .onChange(async (value) => {
            this.plugin.settings.defaultProjectId = value ? parseInt(value, 10) : null;
            await this.plugin.saveSettings();
          });
      });

    // ── Project Files ─────────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Project Files" });

    new Setting(containerEl)
      .setName("Auto-create project files")
      .setDesc(
        "Automatically create one markdown file per Vikunja project in the " +
        "folder below. Each file is pre-configured with the correct project ID " +
        "and acts as the task list for that project. Files are only created — " +
        "never deleted or renamed — so renaming a project in Vikunja won't " +
        "affect existing files."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoCreateProjectFiles)
          .onChange(async (value) => {
            this.plugin.settings.autoCreateProjectFiles = value;
            await this.plugin.saveSettings();
            // Show/hide the folder setting without a full re-render
            folderSetting.settingEl.toggle(value);
          })
      );

    const folderSetting = new Setting(containerEl)
      .setName("Projects folder")
      .setDesc(
        "Vault-relative folder where project files are created. " +
        "The folder is created automatically if it doesn't exist. " +
        "Example: Vikunja, Tasks/Projects"
      )
      .addText((text) =>
        text
          .setPlaceholder("Vikunja")
          .setValue(this.plugin.settings.projectsFolder)
          .onChange(async (value) => {
            this.plugin.settings.projectsFolder = value.trim().replace(/\/+$/, "");
            await this.plugin.saveSettings();
          })
      );

    // Hide folder setting when auto-create is off
    folderSetting.settingEl.toggle(this.plugin.settings.autoCreateProjectFiles);

    // ── Sync Behaviour ────────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Sync Behaviour" });

    new Setting(containerEl)
      .setName("Sync on save")
      .setDesc("Automatically sync tasks when you save a markdown file.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncOnSave)
          .onChange(async (value) => {
            this.plugin.settings.syncOnSave = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync interval (seconds)")
      .setDesc(
        "How often to poll Vikunja for remote changes. " +
        "Set to 0 to disable polling (sync on save only)."
      )
      .addSlider((slider) =>
        slider
          .setLimits(0, 3600, 30)
          .setValue(this.plugin.settings.syncIntervalSeconds)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.syncIntervalSeconds = value;
            await this.plugin.saveSettings();
            this.plugin.restartSyncInterval();
          })
      );

    new Setting(containerEl)
      .setName("Sync completed tasks")
      .setDesc(
        "Pull tasks completed remotely (e.g. by collaborators) back to Obsidian " +
        "and mark them as [x]."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncCompletedTasks)
          .onChange(async (value) => {
            this.plugin.settings.syncCompletedTasks = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Exclusions ────────────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Exclusions" });

    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc(
        "Folders to exclude from task scanning, one per line. " +
        "Tasks in these folders will not be synced to Vikunja. " +
        "Example: Templates, Archive"
      )
      .addTextArea((textarea) =>
        textarea
          .setPlaceholder("Templates\nArchive\n.trash")
          .setValue(this.plugin.settings.excludedFolders.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excludedFolders = value
              .split("\n")
              .map((f) => f.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    // ── UI ────────────────────────────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Interface" });

    new Setting(containerEl)
      .setName("Show ribbon icon")
      .setDesc("Show the Vikunja sync button in the left sidebar ribbon.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRibbonIcon)
          .onChange(async (value) => {
            this.plugin.settings.showRibbonIcon = value;
            await this.plugin.saveSettings();
            // Ribbon changes require reload
            new Notice("Reload Obsidian to apply ribbon changes.");
          })
      );
  }
}
