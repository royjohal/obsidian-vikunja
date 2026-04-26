<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/public/wordmark-dark.svg">
  <img src="docs/public/wordmark-light.svg" alt="Vikunja Sync" height="60">
</picture>

[![Tests](https://github.com/royjohal/obsidian-vikunja/actions/workflows/test.yml/badge.svg)](https://github.com/royjohal/obsidian-vikunja/actions/workflows/test.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**[Documentation →](https://obsidian-vikunja.vercel.app)**

A first-class Obsidian plugin for two-way sync between your Obsidian vault and [Vikunja](https://vikunja.io) — the open-source task management platform.

This plugin is designed to **replace the Obsidian Tasks plugin** entirely, using Vikunja as the backend. Your markdown `- [ ]` tasks become Vikunja tasks, giving you:

- ✅ **Create tasks anywhere** — daily notes, meeting notes, any file
- ✅ **Two-way sync** (Obsidian ↔ Vikunja) with automatic reconciliation
- ✅ **Auto-created project files** — one `.md` per Vikunja project, zero setup
- ✅ **Auto-sync on save** and configurable periodic sync
- ✅ **Rich metadata** — dates (📅 🛫 ⏳), priority (🔺), recurrence (🔁)
- ✅ **Collaboration** — share projects via Vikunja's web UI, changes sync back
- ✅ **Project routing** — `@project:Name` to send tasks to specific projects
- 📅 **Calendar view** *(coming in v0.2)*
- 📊 **Gantt view** *(coming in v0.3)*
- 🗑️ **Smart task deletion** *(coming in v0.2 with proper state tracking)*

---

## Requirements

- A running [Vikunja](https://vikunja.io) instance (self-hosted or cloud)
- Obsidian 1.4.0 or later
- Node.js 18+ (for building from source)

---

## Installation

### From BRAT (recommended before community store listing)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the Obsidian Community Plugins
2. In BRAT settings, click **Add Beta Plugin**
3. Enter: `https://github.com/royjohal/obsidian-vikunja`

### Manual

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/royjohal/obsidian-vikunja/releases)
2. Copy both files to `<your-vault>/.obsidian/plugins/obsidian-vikunja/`
3. Enable the plugin in Obsidian Settings → Community Plugins

### From source

```bash
git clone https://github.com/royjohal/obsidian-vikunja
cd obsidian-vikunja
npm install
npm run build
```

Then copy `main.js` and `manifest.json` to your vault's plugin folder.

---

## Setup

1. In Vikunja, go to **Account Settings → API Tokens** and generate a new token with full access
2. In Obsidian, go to **Settings → Vikunja Sync**
3. Enter your Vikunja URL (e.g. `https://vikunja.example.com`)
4. Paste your API token
5. Click **Test Connection** to verify
6. Set a **Default Project** for tasks without an explicit project

---

## Usage

### Task syntax

The plugin understands the same task syntax as the Obsidian Tasks plugin:

```markdown
- [ ] A basic task
- [x] A completed task
- [ ] Task with due date 📅 2026-04-20
- [ ] Task with start date 🛫 2026-04-20
- [ ] Task with scheduled date ⏳ 2026-04-20
- [ ] High priority task ⏫
- [ ] Highest priority 🔺
```

### Auto-created project files

With **Auto-create project files** enabled (the default), the plugin creates one `.md` file per Vikunja project in the configured folder (default: `Vikunja/`). Each file is pre-configured and populated automatically — no manual frontmatter needed.

### Per-note project assignment

Add `vikunja_project_id` or `vikunja_project` to a note's frontmatter to bind all tasks in that note to a specific Vikunja project:

```yaml
---
vikunja_project_id: 3          # by ID
# or
vikunja_project: Work Tasks    # by name (case-insensitive)
---

- [ ] Review the quarterly report 📅 2026-04-25
- [ ] Schedule team meeting
```

### Inline project override

Route a single task to any project from any note with `@project:Name`:

```markdown
- [ ] Follow up with Alex @project:Work Tasks
- [ ] Buy milk @project:Personal 📅 2026-05-01
```

The `@project:` token is stripped from the task title before syncing to Vikunja.

### Synced task IDs

Once a task is synced, the plugin adds a hidden tracking comment using Obsidian's native `%%` comment syntax:

```markdown
- [ ] My task 📅 2026-04-20 %%vikunja:42%%
```

This is invisible in Reading View and Live Preview, and links the Obsidian task to its Vikunja counterpart across future syncs.

---

## Priority mapping

| Obsidian emoji | Vikunja priority |
|---|---|
| 🔺 | 5 — Highest |
| ⏫ | 4 — High |
| 🔼 | 3 — Medium |
| 🔽 | 2 — Low |
| ⏬ | 1 — Lowest |

---

## Roadmap

- [x] v0.1 — Core two-way sync
- [ ] v0.2 — Calendar view
- [ ] v0.3 — Gantt chart view
- [ ] v0.4 — Sub-tasks support
- [ ] v0.5 — Assignees and comments

---

## Development

```bash
npm install
npm run dev   # Watch mode — rebuilds on file change
npm run build # Production build
npm test      # Run test suite with Vitest
```

Copy `main.js` and `manifest.json` to your test vault's plugin folder after building.

### Testing

This project includes comprehensive tests using [Vitest](https://vitest.dev/):

```bash
npm test              # Run tests in watch mode
npm test -- --run     # Run tests once (CI mode)
npm test:ui           # Open interactive test dashboard
npm test:coverage     # Generate coverage report
```

Tests cover:
- **TaskParser** (27 tests) — markdown parsing, serialization, metadata extraction
- **Deletion Safeguards** (20 tests) — preventing accidental data loss

See [docs/testing.md](docs/testing.md) for detailed testing documentation.

---

## Contributing

PRs welcome! Please open an issue first to discuss significant changes.

---

## License

MIT
