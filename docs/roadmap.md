# Roadmap

## v0.1 — Core sync ✅ *released*

The foundation: bidirectional task sync between Obsidian Markdown and Vikunja.

- Two-way sync (Obsidian ↔ Vikunja)
- Obsidian Tasks plugin-compatible syntax (`- [ ]`, emoji dates, priority emojis)
- Per-note project assignment via frontmatter (`vikunja_project_id`)
- Persistent task identity via hidden HTML comments (`<!--vikunja:N-->`)
- Sync on save, on a configurable interval, and manually via command palette
- Checkbox toggle detection in reading view / live preview
- Settings tab with connection test, default project picker, and exclusion list
- Ribbon icon

---

## v0.2 — Calendar view 🗓 *in progress*

A full calendar view inside Obsidian powered by [FullCalendar](https://fullcalendar.io/), showing your Vikunja tasks on their due and scheduled dates.

Planned features:
- Leaf-based calendar panel (month, week, agenda views)
- Click a date slot to create a new task
- Drag tasks to reschedule — syncs the new date to Vikunja immediately
- Color-coded by project
- Filter by project or label

---

## v0.3 — Gantt view 📊

A Gantt chart view showing tasks with start dates and due dates as horizontal bars across a timeline.

Planned features:
- Timeline panel with day/week/month zoom
- Tasks grouped by project
- Drag to extend/shift date ranges
- Dependency lines between tasks (requires Vikunja task dependency support)

---

## v0.4 — Sub-tasks

Support for Vikunja's sub-task (related tasks) feature, represented in Obsidian as indented task lists.

Planned features:
- Parse indented `- [ ]` tasks as sub-tasks of their parent
- Create Vikunja task relationships on sync
- Progress rollup — parent task shown as % complete based on sub-task completion

---

## v0.5 — Assignees & comments

Bring Vikunja's collaboration features into Obsidian.

Planned features:
- Show task assignees as inline metadata
- Assign tasks from Obsidian by username
- Read Vikunja comments as a sidebar panel (read-only initially)
- Post comments from Obsidian

---

## Future ideas

These are not committed to a version yet:

- **Labels**: map Obsidian tags (`#tag`) to Vikunja labels
- **Recurring tasks**: sync Vikunja's repeat configuration
- **Search**: full-text search across Vikunja tasks from Obsidian
- **Offline queue**: queue changes made offline and flush on reconnect
- **Community store listing**: submit to the official Obsidian plugin directory

---

## Contributing

Have a feature request or want to contribute? Open an issue or PR on [GitHub](https://github.com/royjohal/obsidian-vikunja). Significant features should be discussed in an issue first.
