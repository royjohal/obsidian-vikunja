# Architecture & API Reference

This page documents the internal architecture of the plugin and the public surface of each module. It is generated from the source comments in `src/`.

## Overview

```
src/
├── main.ts            Plugin entry point — lifecycle, wiring, commands
├── types.ts           Shared TypeScript interfaces and constants
├── api/
│   └── VikunjaClient.ts   Typed HTTP client for the Vikunja REST API
└── sync/
    ├── TaskParser.ts      Parses and serialises Obsidian task syntax
    └── SyncEngine.ts      Bidirectional sync orchestrator
```

Data flow on a **save event**:

```
File saved
  → SyncEngine.syncFile(file)
      → TaskParser.parseFile(content)        — parse tasks from markdown
      → resolveProjectId(file)               — read frontmatter
      → pushNewTasks()                       — create in Vikunja
      → pushTaskUpdates()                    — update existing in Vikunja
      → writeTaskToFile()                    — write vikunjaId back
```

Data flow on a **periodic pull**:

```
Interval fires
  → SyncEngine.sync()
      → scanVault()                          — all .md files
      → pullRemoteChanges()
          → VikunjaClient.getAllTasks()       — fetch from API
          → compare done/title with local
          → writeTaskToFile()                — update vault
```

---

## `VikunjaClient` — `src/api/VikunjaClient.ts`

Typed HTTP wrapper for the Vikunja REST API. All network communication goes through this class.

**Authentication**: every request sends `Authorization: Bearer <token>`.

**Error handling**: non-2xx responses throw `VikunjaRequestError` with the HTTP status and the parsed API error body (if JSON).

### Constructor

```ts
new VikunjaClient(baseUrl: string, token: string)
```

| Parameter | Description |
|---|---|
| `baseUrl` | Vikunja instance URL. Trailing slash is stripped automatically. |
| `token` | Personal access token from Vikunja Account Settings → API Tokens. |

### Connection

#### `testConnection()`
```ts
testConnection(): Promise<{ success: boolean; error?: string }>
```
Calls `GET /api/v1/user` to verify that the token is valid. Used by the Settings tab **Test** button.

### Projects

#### `getProjects()`
```ts
getProjects(): Promise<VikunjaProject[]>
```
Returns all projects the authenticated user has access to (up to 500).

#### `getProject(projectId)`
```ts
getProject(projectId: number): Promise<VikunjaProject>
```
Returns a single project by ID.

### Tasks

#### `getProjectTasks(projectId)`
```ts
getProjectTasks(projectId: number): Promise<VikunjaTask[]>
```
Returns all tasks in a project. Handles pagination automatically — fetches all pages until the last.

#### `getAllTasks()`
```ts
getAllTasks(page?: number): Promise<VikunjaTask[]>
```
Returns all tasks across all projects using `GET /api/v1/tasks/all`. Handles pagination. Used during the pull phase of a full vault sync.

#### `getTask(taskId)`
```ts
getTask(taskId: number): Promise<VikunjaTask>
```

#### `createTask(projectId, payload)`
```ts
createTask(projectId: number, payload: CreateTaskPayload): Promise<VikunjaTask>
```
Creates a new task in a project. Uses `PUT /api/v1/projects/:id/tasks` per the Vikunja API convention.

#### `updateTask(taskId, payload)`
```ts
updateTask(taskId: number, payload: UpdateTaskPayload): Promise<VikunjaTask>
```
Partial update — only the provided fields are changed. Uses `POST /api/v1/tasks/:id`.

#### `setTaskDone(taskId, done)`
```ts
setTaskDone(taskId: number, done: boolean): Promise<VikunjaTask>
```
Convenience wrapper around `updateTask` for toggling completion state. Called directly on checkbox clicks.

#### `deleteTask(taskId)`
```ts
deleteTask(taskId: number): Promise<void>
```

### Labels

#### `getLabels()`
```ts
getLabels(): Promise<VikunjaLabel[]>
```

#### `addLabelToTask(taskId, labelId)` / `removeLabelFromTask(taskId, labelId)`
```ts
addLabelToTask(taskId: number, labelId: number): Promise<void>
removeLabelFromTask(taskId: number, labelId: number): Promise<void>
```

### Error types

#### `VikunjaRequestError`
Thrown by `request()` on non-2xx responses.

```ts
class VikunjaRequestError extends Error {
  status: number;           // HTTP status code
  apiError: VikunjaApiError | null;  // Parsed JSON body, if available
}
```

---

## `TaskParser` — `src/sync/TaskParser.ts`

Static utility class for parsing Obsidian `- [ ]` task syntax and serialising it back to Markdown.

### Supported syntax

| Syntax | Meaning |
|---|---|
| `- [ ] text` | Incomplete task |
| `- [x] text` | Complete task (`x` is case-insensitive) |
| `* [ ] text` | Bullet alternative |
| `📅 YYYY-MM-DD` | Due date |
| `🛫 YYYY-MM-DD` | Start date |
| `⏳ YYYY-MM-DD` | Scheduled date |
| `🔺 ⏫ 🔼 🔽 ⏬` | Priority (highest → lowest) |
| `<!--vikunja:N-->` | Vikunja task ID (hidden tracking comment) |

### `TaskParser.parseFile(content, filePath)`
```ts
static parseFile(content: string, filePath: string): ObsidianTask[]
```
Splits `content` by newline and calls `parseLine` on each. Returns only lines that match the task regex — non-task lines are silently skipped.

### `TaskParser.parseLine(line, lineNumber, filePath)`
```ts
static parseLine(line: string, lineNumber: number, filePath: string): ObsidianTask | null
```
Parses a single line. Returns `null` if the line is not a task. The `projectId` field on the returned object is always `null` here — it must be resolved separately from frontmatter.

### `TaskParser.serialise(task)`
```ts
static serialise(task: ObsidianTask): string
```
Converts an `ObsidianTask` back to a Markdown line. Field order in the serialised output:

```
{indent}- [{checkmark}] {title} {priority?} {startDate?} {scheduledDate?} {dueDate?} {<!--vikunja:id-->?}
```

Original indentation is preserved from `task.rawLine`.

### `TaskParser.cleanTitle(raw)`
```ts
static cleanTitle(raw: string): string
```
Strips all metadata (dates, priority emojis, vikunja ID comment) from the raw task content, leaving only the human-readable title.

### `TaskParser.replaceLine(content, lineNumber, newLine)`
```ts
static replaceLine(content: string, lineNumber: number, newLine: string): string
```
Returns a new file content string with line `lineNumber` (0-indexed) replaced by `newLine`. Used to update a single task in a file without touching anything else.

### `TaskParser.isTaskLine(line)`
```ts
static isTaskLine(line: string): boolean
```
Fast pre-filter that tests whether a line matches the task regex. Used before full parsing to avoid allocating objects for non-task lines.

---

## `SyncEngine` — `src/sync/SyncEngine.ts`

Orchestrates bidirectional sync between the Obsidian vault and Vikunja.

### Sync strategy

| Direction | Trigger | Behaviour |
|---|---|---|
| Obsidian → Vikunja | New task (no `vikunjaId`) | `createTask` + write ID back to file |
| Obsidian → Vikunja | Existing task (has `vikunjaId`) | `updateTask` with current title/dates/priority/done |
| Vikunja → Obsidian | Remote done status differs | Update local checkbox, rewrite file line |
| Vikunja → Obsidian | Remote title differs | Update local title, rewrite file line |

**Conflict resolution**: Vikunja wins. If both sides have changed since the last sync, the remote Vikunja state is applied to the vault.

**Task identity**: the `<!--vikunja:N-->` comment in the Markdown line is the persistent link. Never edit or remove it manually.

### `sync()`
```ts
async sync(): Promise<SyncResult>
```
Full vault sync. Steps:
1. `scanVault()` — reads all non-excluded `.md` files
2. `pushNewTasks()` — creates Vikunja tasks for tasks without a vikunjaId
3. `pushTaskUpdates()` — updates Vikunja for tasks that already have a vikunjaId
4. `pullRemoteChanges()` — fetches all Vikunja tasks and applies remote changes to the vault

### `syncFile(file)`
```ts
async syncFile(file: TFile): Promise<SyncResult>
```
Single-file sync. Called on save events for efficiency. Runs push phases only (no pull) — pulling remote changes happens on the periodic interval.

### `handleCheckboxToggle(file, lineNumber, done)`
```ts
async handleCheckboxToggle(file: TFile, lineNumber: number, done: boolean): Promise<void>
```
Called when the user clicks a task checkbox in reading/live-preview mode. Immediately updates `done` in Vikunja (if the task has a vikunjaId) and rewrites the Markdown line.

### `SyncEngine.formatDate(isoDate)` *(static)*
```ts
static formatDate(isoDate: string | null): string | null
```
Converts a Vikunja ISO date string (`2026-04-20T00:00:00Z`) to `YYYY-MM-DD` for Obsidian Tasks syntax. Returns `null` for Vikunja's null date sentinel (`0001-01-01T00:00:00Z`) and for `null` input.

---

## `types.ts` — Shared types and constants

### Vikunja API types

| Interface | Description |
|---|---|
| `VikunjaTask` | A task as returned by the Vikunja API |
| `VikunjaProject` | A Vikunja project |
| `VikunjaLabel` | A label that can be applied to tasks |
| `VikunjaUser` | A user assignee |
| `CreateTaskPayload` | Payload for `POST /projects/:id/tasks` |
| `UpdateTaskPayload` | Payload for `POST /tasks/:id` |

### Plugin internal types

#### `ObsidianTask`
The bridge type between Obsidian Markdown and Vikunja. Produced by `TaskParser`, consumed by `SyncEngine`.

| Field | Type | Description |
|---|---|---|
| `rawLine` | `string` | Original Markdown line |
| `lineNumber` | `number` | 0-indexed line in the file |
| `filePath` | `string` | Vault-relative file path |
| `title` | `string` | Cleaned task title |
| `done` | `boolean` | Checkbox state |
| `dueDate` | `string \| null` | `YYYY-MM-DD` or null |
| `startDate` | `string \| null` | `YYYY-MM-DD` or null |
| `scheduledDate` | `string \| null` | `YYYY-MM-DD` or null |
| `priority` | `number` | 0–5, where 0 = no priority |
| `vikunjaId` | `number \| null` | Vikunja task ID if synced |
| `projectId` | `number \| null` | Resolved from frontmatter or settings |

#### `VikunjaPluginSettings`

| Field | Default | Description |
|---|---|---|
| `apiUrl` | `""` | Vikunja instance base URL |
| `apiToken` | `""` | Personal access token |
| `syncIntervalSeconds` | `300` | Poll interval in seconds; 0 = disabled |
| `syncOnSave` | `true` | Sync on file save |
| `defaultProjectId` | `null` | Fallback project for tasks without frontmatter |
| `showRibbonIcon` | `true` | Show ribbon sync button |
| `syncCompletedTasks` | `true` | Pull remote completions to Obsidian |
| `excludedFolders` | `[]` | Folders excluded from vault scan |

#### `SyncResult`

```ts
interface SyncResult {
  created: number;    // Tasks created in Vikunja
  updated: number;    // Tasks updated in Vikunja or vault
  completed: number;  // Tasks marked complete after remote pull
  errors: string[];   // Non-fatal error messages
  timestamp: Date;
}
```

### Constants

| Constant | Value | Description |
|---|---|---|
| `VIKUNJA_NULL_DATE` | `"0001-01-01T00:00:00Z"` | Vikunja's sentinel for "no date" |
| `PRIORITY_MAP` | `{ "🔺": 5, "⏫": 4, … }` | Emoji → Vikunja priority number |
| `PRIORITY_MAP_REVERSE` | `{ 5: "🔺", 4: "⏫", … }` | Vikunja priority number → emoji |
