# Usage

## Task syntax

Vikunja Sync understands the same task syntax as the [Obsidian Tasks plugin](https://publish.obsidian.md/tasks/), so your existing task files work without modification.

### Basic tasks

```markdown
- [ ] An incomplete task
- [x] A completed task
* [ ] Bullet-style also works
```

### Dates

Use emoji prefixes to attach dates to a task:

| Emoji | Meaning | Example |
|---|---|---|
| 📅 | Due date | `- [ ] Submit report 📅 2026-05-01` |
| 🛫 | Start date | `- [ ] Begin research 🛫 2026-04-28` |
| ⏳ | Scheduled date | `- [ ] Review draft ⏳ 2026-04-30` |

Dates must be in `YYYY-MM-DD` format.

### Priority

Add a priority emoji anywhere in the task line:

| Emoji | Vikunja priority |
|---|---|
| 🔺 | 5 — Highest |
| ⏫ | 4 — High |
| 🔼 | 3 — Medium |
| 🔽 | 2 — Low |
| ⏬ | 1 — Lowest |

Tasks without a priority emoji are created in Vikunja with priority 0 (no priority).

### Recurrence

Use `🔁` to set a repeating task. The recurrence rule syncs to Vikunja's repeat field:

```markdown
- [ ] Weekly standup 🔁 every week 📅 2026-04-28
- [ ] Daily review 🔁 every day
- [ ] Monthly report 🔁 every month 📅 2026-05-01
- [ ] Every 2 weeks 🔁 every 2 weeks
```

Supported patterns: `every day`, `every week`, `every month`, `every year`, `every N days/weeks/months/years`, `every other day`. When Vikunja tasks with a repeat interval are imported into Obsidian, the `🔁` token is written automatically.

### Obsidian Tasks plugin tokens

If you use the Obsidian Tasks plugin alongside Vikunja Sync, its additional tokens are recognised and **stripped from the title** before the task is pushed to Vikunja — so they don't pollute your task titles there:

| Token | Meaning | Handling |
|---|---|---|
| `🔁 every week` | Recurrence | ✅ Synced to Vikunja `repeat_after` |
| `🛫 YYYY-MM-DD` | Start date | ✅ Synced to Vikunja `start_date` |
| `📅 YYYY-MM-DD` | Due date | ✅ Synced to Vikunja `due_date` |
| `⏳ YYYY-MM-DD` | Scheduled date | ⚠️ Kept in Obsidian only |
| `➕ YYYY-MM-DD` | Created date | Stripped — Vikunja tracks this automatically |
| `✅ YYYY-MM-DD` | Completion date | Stripped — done state synced via checkbox |
| `❌ YYYY-MM-DD` | Cancelled date | Stripped |
| `🆔 <id>` | Tasks plugin ID | Stripped |
| `⛔ <id>` | Blocked-by | Stripped — dependencies coming in v0.4 |
| `🏁 <text>` | On-completion action | Stripped |

### Combining metadata

You can combine dates, priority, and recurrence freely:

```markdown
- [ ] File quarterly taxes 📅 2026-04-30 🔺
- [ ] Review design mockups 🛫 2026-04-28 ⏳ 2026-04-29 📅 2026-05-02 🔼
- [x] Send onboarding email ⏫ <!--vikunja:17-->
```

---

## Tracking IDs

Once a task has been synced to Vikunja, the plugin writes a hidden comment into the line using Obsidian's native `%%` comment syntax:

```markdown
- [ ] My task 📅 2026-04-20 %%vikunja:42%%
```

This comment:
- Is **completely invisible in Reading View and Live Preview** — Obsidian treats `%%...%%` as a native comment and hides it
- Is visible only in Source Mode (where all raw markdown is shown)
- Is the permanent link between the Obsidian task and its Vikunja counterpart
- Must not be edited or removed manually — doing so will cause the plugin to create a duplicate task on the next sync

::: info Migrating from an older version
If your tasks still have the old `<!--vikunja:42-->` format, both formats are recognised during sync. The old format is automatically replaced with `%%vikunja:42%%` the next time each task is written back to the file.
:::

---

## Project files

The easiest way to work with Vikunja Sync is to let the plugin manage project files for you.

### Auto-created project files

When **Auto-create project files** is enabled (the default), the plugin creates one markdown file per Vikunja project inside the configured **Projects folder** (default: `Vikunja/`):

```
Vikunja/
  Work Tasks.md
  Personal.md
  Shopping.md
```

Each file is pre-configured with the correct frontmatter:

```yaml
---
vikunja_project_id: 3
---

# Work Tasks
```

On every sync, all tasks from that project are pulled into the file automatically. New tasks you write there are pushed to Vikunja on save. You never need to set up frontmatter yourself.

::: info Renames are safe
If you rename a project in Vikunja, the existing file keeps working — the `vikunja_project_id` is the real identity, not the filename. The plugin never deletes or renames files it has created.
:::

### Per-note project assignment

For tasks embedded in context-rich notes (daily notes, meeting notes, project plans), you can manually bind any note to a Vikunja project via frontmatter.

**By ID:**

```yaml
---
vikunja_project_id: 3
---
```

**By name** (case-insensitive, resolved at sync time):

```yaml
---
vikunja_project: Work Tasks
---
```

::: tip
`vikunja_project_id` is faster and immune to project renames. `vikunja_project` is more readable. Use whichever feels natural.
:::

### Inline project override with `@project:`

To send a single task to a specific project without changing the note's frontmatter, add `@project:Name` anywhere on the task line:

```markdown
- [ ] Follow up with Alex @project:Work Tasks
- [ ] Buy groceries @project:Personal 📅 2026-05-01
```

The `@project:` token is stripped from the task title before it's pushed to Vikunja, so the task appears with a clean title there. It's preserved in the markdown line so future syncs keep routing it correctly.

This is especially useful in daily notes, meeting notes, or anywhere you want tasks to land in a specific Vikunja project without leaving your current note.

### Remote task import

When a note has a project binding (via auto-created file, frontmatter, or `@project:`), syncing **pulls all tasks from that Vikunja project into the file** — not just tasks you created in Obsidian:

- Tasks created in Vikunja's web UI appear in the file after the next sync.
- Collaborators' tasks show up automatically.
- A freshly connected vault gets populated on the first sync.

Each imported task gets a `<!--vikunja:ID-->` tracking comment so future syncs know it's already linked.

### First install — existing tasks

Tasks in notes with **no project binding** (no frontmatter and no `@project:`) are skipped on sync. They won't be pushed to Vikunja until you assign them to a project. This is intentional — it prevents a bulk accidental import on first run.

To sync existing tasks:
1. Move them into an auto-created project file (`Vikunja/Work Tasks.md`), or
2. Add `vikunja_project_id` or `vikunja_project` to the note's frontmatter, or
3. Add `@project:Name` to individual task lines

If no project is configured at all (no frontmatter, no `@project:`, no Default Project setting), the sync result will list each skipped task with a message explaining how to assign it.

---

## Sync triggers

### On save *(default: on)*
Every time you save a `.md` file, that file's tasks are synced. This is efficient — it only processes the changed file, not the entire vault.

### Periodic polling *(default: every 300 s)*
The plugin polls Vikunja for remote changes on a configurable interval. This is how changes made in the Vikunja web UI (by you or collaborators) flow back to Obsidian. Set the interval to 0 to disable polling.

### Manual sync
- **Command palette**: `Sync all tasks with Vikunja` — full vault scan
- **Command palette**: `Sync current file with Vikunja` — current file only
- **Ribbon icon**: click the refresh icon in the left sidebar

---

## Checkbox toggles

In Obsidian's **Reading view** and **Live Preview**, clicking a task checkbox immediately syncs the done/not-done state to Vikunja — no save required. The file is also updated so the checkbox state persists in Markdown.

---

## Task deletion

**⚠️ Task deletion is currently disabled (v0.1)**

The task deletion feature is disabled in this version to prevent accidental data loss. A proper implementation requires state tracking to safely distinguish between:
- Tasks explicitly deleted by the user
- Tasks that exist in other files (daily notes, meeting notes, etc.)

### Planned for v0.2

- Smart deletion that only deletes tasks you explicitly removed
- Support for tasks created anywhere in the vault with default project binding
- Safe deletion from auto-created project files

### Current behavior

- ✅ Tasks sync from Obsidian → Vikunja (creates/updates)
- ✅ Tasks sync from Vikunja → Obsidian (updates/imports)
- ❌ Task deletion → Vikunja (disabled, prevents data loss)

**To delete a task from both places:**
1. Delete from Obsidian
2. Then manually delete from Vikunja web UI (for now)

---

## Excluded folders

To prevent certain folders from being scanned during full vault syncs, add them to **Settings → Vikunja Sync → Excluded Folders**, one per line:

```
Templates
Archive
.trash
Daily Notes/2025
```

Exclusions are prefix-matched — `Archive` excludes `Archive/`, `Archive/Old/`, etc.

---

## Conflict resolution

When the same task is changed in both Obsidian and Vikunja between syncs, **Vikunja wins**. Vikunja is treated as the source of truth for collaboration — this means a change made by a teammate in Vikunja will overwrite a local Obsidian change if the remote timestamp is newer.

For solo use this rarely matters since syncs happen frequently. For collaborative use, make significant edits in Vikunja's UI where timestamps are more reliable.
