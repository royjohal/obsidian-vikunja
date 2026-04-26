---
layout: home

hero:
  name: "Vikunja Sync"
  text: "Obsidian tasks, powered by Vikunja"
  tagline: Two-way sync between your Obsidian vault and Vikunja — the open-source task management platform. Write tasks in Markdown, collaborate in Vikunja.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/royjohal/obsidian-vikunja

features:
  - icon: 🔄
    title: Two-way sync
    details: Tasks flow both ways. Write in Obsidian, complete in Vikunja's web UI — changes appear everywhere automatically.

  - icon: ✍️
    title: Native Markdown syntax
    details: Uses the same emoji-based task syntax as the Obsidian Tasks plugin. No new syntax to learn — your existing task files work out of the box.

  - icon: 👥
    title: Real collaboration
    details: Share Vikunja projects with teammates. Tasks completed by collaborators sync back to your vault automatically.

  - icon: 📁
    title: Per-note project assignment
    details: Add vikunja_project_id to a note's frontmatter to route its tasks to a specific Vikunja project. Or set a vault-wide default.

  - icon: ⚡
    title: Smart sync triggers
    details: Sync on save, on a configurable interval, via the command palette, or by clicking the ribbon icon. You control when syncs happen.

  - icon: 🔒
    title: Self-hosted & private
    details: Works with any Vikunja instance — self-hosted or cloud. Your data stays on your server.
---

## How it works

Vikunja Sync bridges Obsidian's `- [ ]` task syntax with Vikunja's REST API. When you write a task in Obsidian, the plugin creates a matching task in Vikunja and embeds a hidden tracking ID:

```markdown
- [ ] Review the quarterly report 📅 2026-04-25 ⏫ <!--vikunja:42-->
```

That comment is invisible in reading view but lets the plugin map each Markdown line to its Vikunja counterpart across every future sync. Complete the task anywhere — Obsidian or Vikunja — and the other side updates automatically.

---

## Quick start

```bash
# 1. Install via BRAT (Obsidian Beta Reviewers Auto-update Tester)
#    Add beta plugin: https://github.com/royjohal/obsidian-vikunja

# 2. Or install manually — copy main.js + manifest.json to:
#    <vault>/.obsidian/plugins/obsidian-vikunja/
```

Then open **Settings → Vikunja Sync**, enter your Vikunja URL and API token, and click **Test Connection**. See the [Getting Started guide](/getting-started) for full instructions.
