# Roadmap

## v0.1 — Core sync ✅ *released*

- Two-way sync (Obsidian ↔ Vikunja)
- Obsidian Tasks plugin-compatible syntax (`- [ ]`, emoji dates, priority emojis)
- Per-note project assignment via frontmatter (`vikunja_project_id`)
- Persistent task identity via hidden HTML comments (`<!--vikunja:N-->`)
- Sync on save, on a configurable interval, and manually via command palette
- Checkbox toggle detection in reading view / live preview
- Settings tab with connection test, default project picker, and exclusion list
- Ribbon icon

---

## v0.1.x — Quality of life ✅ *released*

- Auto-created project files — one `.md` per Vikunja project, zero setup
- Project assignment by name (`vikunja_project: Work Tasks`)
- Inline `@project:Name` override on individual task lines
- Remote task import — tasks created in Vikunja web UI appear in the bound file
- Recurrence sync — `🔁 every week` maps to Vikunja `repeat_after`
- Unknown Tasks plugin tokens (`➕ ✅ ❌ 🆔 ⛔ 🏁`) stripped from titles before pushing
- Default project dropdown auto-populates after successful connection test

---

## Vikunja field mapping

This table covers every field in the Vikunja task API and where it stands.

### Currently synced

| Field | Obsidian syntax | Status |
|---|---|---|
| `title` | Task text | ✅ |
| `done` | `- [x]` checkbox | ✅ |
| `due_date` | `📅 YYYY-MM-DD` | ✅ |
| `start_date` | `🛫 YYYY-MM-DD` | ✅ |
| `priority` | `🔺 ⏫ 🔼 🔽 ⏬` | ✅ |
| `repeat_after` | `🔁 every week` | ✅ |
| `project_id` | frontmatter / `@project:` | ✅ |

### Planned — field mappings with clear Obsidian syntax

| Field | Proposed Obsidian syntax | Notes |
|---|---|---|
| `end_date` | `🏁 YYYY-MM-DD` | Vikunja's "deadline" end date, distinct from due date |
| `labels` | `#tag` in task line | Map to Vikunja labels; create label if it doesn't exist |
| `percent_done` | `[50%]` inline token | 0–100 progress; only meaningful for tasks not marked done |
| `description` | Indented block below the task line | Multi-line text; complex to parse reliably |

### Planned — collaboration fields (need new UI)

| Field | Approach | Notes |
|---|---|---|
| `assignees` | `>username` inline token | Assign to Vikunja users; requires knowing their usernames |
| `repeat_mode` | `🔁 every week !done` modifier | 0 = from due date, 1 = from today, 2 = from completion |
| Comments | Sidebar panel (read + write) | Part of v0.5 |
| Attachments | Link in description | Not representable in plain markdown |

### Not planned

| Field | Reason |
|---|---|
| `hex_color` | No natural markdown equivalent; too visual |
| `bucket_id` | Kanban-specific; not a markdown concept |
| Relations (parent/sub-task) | Handled separately in v0.4 |

---

## v0.2 — Calendar view 🗓 *up next*

A full calendar view inside Obsidian powered by [FullCalendar](https://fullcalendar.io/).

- Leaf-based calendar panel (month, week, agenda views)
- Click a date slot to create a new task
- Drag tasks to reschedule — syncs to Vikunja immediately
- Color-coded by project
- Filter by project or label

---

## v0.3 — Gantt view 📊

A Gantt chart showing tasks with start and end dates as horizontal bars.

- Timeline panel with day/week/month zoom
- Tasks grouped by project
- Drag to extend/shift date ranges
- Dependency lines between tasks

---

## v0.4 — Sub-tasks

Indented `- [ ]` tasks become Vikunja sub-tasks.

- Parse indented tasks as children of their parent
- Create Vikunja task relationships on sync
- Progress rollup on parent task

---

## v0.5 — Assignees & comments

- Show assignees as inline metadata
- Assign from Obsidian by username
- Read and post Vikunja comments from a sidebar panel

---

## Future ideas

- **Offline queue** — queue changes made offline, flush on reconnect
- **Labels** — `#tag` → Vikunja labels
- **Search** — full-text search across Vikunja tasks from Obsidian
- **Community store listing** — submit to the official Obsidian plugin directory

---

## Contributing

Have a feature request or want to contribute? Open an issue or PR on [GitHub](https://github.com/royjohal/obsidian-vikunja). Significant features should be discussed in an issue first.
