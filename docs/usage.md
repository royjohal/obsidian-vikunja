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

### Combining metadata

You can combine dates and priorities freely:

```markdown
- [ ] File quarterly taxes 📅 2026-04-30 🔺
- [ ] Review design mockups 🛫 2026-04-28 ⏳ 2026-04-29 📅 2026-05-02 🔼
- [x] Send onboarding email ⏫ <!--vikunja:17-->
```

---

## Tracking IDs

Once a task has been synced to Vikunja, the plugin writes a hidden HTML comment into the line:

```markdown
- [ ] My task 📅 2026-04-20 <!--vikunja:42-->
```

This comment:
- Is **invisible in reading view and live preview** — Obsidian renders it as nothing
- Is the permanent link between the Obsidian task and its Vikunja counterpart
- Must not be edited or removed manually — doing so will cause the plugin to create a duplicate task on the next sync

---

## Per-note project assignment

Add `vikunja_project_id` to a note's YAML frontmatter to route all tasks in that note to a specific Vikunja project:

```yaml
---
title: Work Tasks
vikunja_project_id: 3
---

- [ ] Review the quarterly report 📅 2026-04-25
- [ ] Schedule team standup ⏫
```

::: info Project ID lookup
Find a project's ID in Vikunja by opening the project and checking the URL: `vikunja.example.com/projects/3` → ID is `3`.
:::

If a note has no frontmatter project ID, the **Default Project** from plugin settings is used. Tasks with no project at all (no frontmatter and no default configured) are skipped with an error logged to the console.

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
