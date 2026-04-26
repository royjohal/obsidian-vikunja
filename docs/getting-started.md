# Getting Started

This guide walks you through installing the plugin and connecting it to your Vikunja instance for the first time.

## Requirements

| Requirement | Version |
|---|---|
| Obsidian | 1.4.0 or later |
| Vikunja | Any self-hosted or cloud instance |
| Node.js | 18+ (only if building from source) |

---

## Step 1 — Install the plugin

### Via BRAT *(recommended)*

[BRAT](https://github.com/TfTHacker/obsidian42-brat) lets you install plugins that aren't yet in the community store.

1. Install BRAT from **Settings → Community Plugins → Browse**
2. Open BRAT settings and click **Add Beta Plugin**
3. Enter `https://github.com/royjohal/obsidian-vikunja`
4. Click **Add Plugin** — BRAT will install and keep it updated automatically

### Manual install

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/royjohal/obsidian-vikunja/releases)
2. Create the folder `<your-vault>/.obsidian/plugins/obsidian-vikunja/`
3. Copy both files into that folder
4. Restart Obsidian (or reload without restarting via the **Reload app without saving** command)

### Build from source

```bash
git clone https://github.com/royjohal/obsidian-vikunja
cd obsidian-vikunja
npm install
npm run build
```

Copy the generated `main.js` and `manifest.json` into your vault's plugin folder.

---

## Step 2 — Enable the plugin

In Obsidian: **Settings → Community Plugins → Installed Plugins**

Find **Vikunja Sync** and toggle it on.

---

## Step 3 — Generate a Vikunja API token

1. Log in to your Vikunja instance
2. Click your avatar → **Account Settings**
3. Go to the **API Tokens** tab
4. Click **Create a token**
5. Give it a name (e.g. "Obsidian") and select **Full Access**
6. Copy the token — you won't be able to see it again

---

## Step 4 — Configure the plugin

Open **Settings → Vikunja Sync**:

| Setting | What to enter |
|---|---|
| **Vikunja URL** | Your instance URL, e.g. `https://vikunja.example.com` |
| **API Token** | The token you just generated |

Click **Test Connection**. You should see a success notice.

---

## Step 5 — Set a default project

After a successful connection, the **Default Project** dropdown will populate with your Vikunja projects. Select the project where tasks should go when a note doesn't specify one explicitly.

::: tip Per-note project assignment
You can override the default for any note by adding `vikunja_project_id` to its frontmatter:

```yaml
---
vikunja_project_id: 5
---
```

See the [Usage guide](/usage#per-note-project-assignment) for details.
:::

---

## Step 6 — Run your first sync

Use any of these methods to trigger a sync:

- **Command palette** (`Cmd/Ctrl+P`) → `Sync all tasks with Vikunja`
- Click the **refresh icon** in the left sidebar ribbon
- Save any markdown file (if **Sync on save** is enabled — it's on by default)

After the sync completes you'll see a notice like:

```
✅ Vikunja: 3 created, 1 updated
```

Your tasks are now in Vikunja. Open the Vikunja web UI to see them.

---

## Sync settings reference

| Setting | Default | Description |
|---|---|---|
| Sync on save | On | Syncs tasks whenever you save a `.md` file |
| Sync interval | 300s | Polls Vikunja for remote changes every N seconds. Set to 0 to disable |
| Sync completed tasks | On | Pulls tasks completed in Vikunja back to Obsidian as `[x]` |
| Default project | — | Fallback project for tasks without a frontmatter project ID |
| Excluded folders | — | Folders to skip during vault scanning (one per line) |
| Show ribbon icon | On | Shows the sync button in the left sidebar |

---

## Troubleshooting

**"No URL or token configured"** — Check that both fields are filled in Settings.

**"Connection failed: 401"** — Your token is invalid or expired. Regenerate it in Vikunja → Account Settings → API Tokens.

**"Connection failed: network error"** — Obsidian can't reach your Vikunja URL. Check that the URL is correct and your instance is running.

**Tasks not syncing** — Make sure the note either has a `vikunja_project_id` frontmatter property or a Default Project is set in settings. Tasks without a project ID are skipped and logged to the console.
