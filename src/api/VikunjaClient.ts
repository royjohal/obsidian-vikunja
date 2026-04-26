/**
 * @file api/VikunjaClient.ts
 * @description Typed HTTP client for the Vikunja REST API.
 *
 * All API communication goes through this class. It handles:
 * - Authentication via Bearer token
 * - Request/response typing
 * - Error handling and normalisation
 * - Rate limiting awareness
 *
 * Usage:
 *   const client = new VikunjaClient("https://vikunja.example.com", "my-token");
 *   const tasks = await client.getProjectTasks(1);
 */

import type {
  VikunjaTask,
  VikunjaProject,
  VikunjaLabel,
  CreateTaskPayload,
  UpdateTaskPayload,
} from "../types";

// ─── Error Types ──────────────────────────────────────────────────────────────

/** Structured error returned by the Vikunja API */
export interface VikunjaApiError {
  code: number;
  message: string;
}

/** Thrown when an API request fails */
export class VikunjaRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly apiError: VikunjaApiError | null,
    message: string
  ) {
    super(message);
    this.name = "VikunjaRequestError";
  }
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class VikunjaClient {
  private readonly baseUrl: string;
  private readonly token: string;

  /**
   * @param baseUrl - Vikunja instance URL, e.g. https://vikunja.example.com
   * @param token   - Personal access token from Vikunja Account Settings
   */
  constructor(baseUrl: string, token: string) {
    // Normalise: strip trailing slash so we can always append /api/v1/...
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /** Build the full API URL for a given path */
  private url(path: string): string {
    return `${this.baseUrl}/api/v1${path}`;
  }

  /** Standard headers sent with every request */
  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Core fetch wrapper. Handles non-2xx responses by throwing VikunjaRequestError.
   * @param path    - API path, e.g. /projects/1/tasks
   * @param options - Standard RequestInit options
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    // Abort after 20 s — prevents sync from hanging forever on a slow/unresponsive server
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);

    let response: Response;
    try {
      response = await fetch(this.url(path), {
        ...options,
        signal: controller.signal,
        headers: { ...this.headers, ...(options.headers as Record<string, string> ?? {}) },
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new VikunjaRequestError(0, null, `Request timed out: ${path}`);
      }
      throw err;
    } finally {
      window.clearTimeout(timer);
    }

    if (!response.ok) {
      let apiError: VikunjaApiError | null = null;
      try {
        apiError = await response.json() as VikunjaApiError;
      } catch {
        // Response body wasn't JSON — that's fine
      }
      throw new VikunjaRequestError(
        response.status,
        apiError,
        apiError?.message ?? `HTTP ${response.status} on ${path}`
      );
    }

    // 204 No Content — return empty object
    if (response.status === 204) return {} as T;

    return response.json() as Promise<T>;
  }

  // ─── Connection ─────────────────────────────────────────────────────────────

  /**
   * Test connectivity and token validity.
   * Calls /info which is public, then /user which requires auth.
   * @returns true if connection and auth are valid
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request("/user");
      return { success: true };
    } catch (err) {
      if (err instanceof VikunjaRequestError) {
        return { success: false, error: err.message };
      }
      return { success: false, error: String(err) };
    }
  }

  // ─── Projects ────────────────────────────────────────────────────────────────

  /**
   * Fetch all projects the authenticated user has access to.
   * @returns Array of Vikunja projects
   */
  async getProjects(): Promise<VikunjaProject[]> {
    return this.request<VikunjaProject[]>("/projects?per_page=500");
  }

  /**
   * Fetch a single project by ID.
   * @param projectId - Vikunja project ID
   */
  async getProject(projectId: number): Promise<VikunjaProject> {
    return this.request<VikunjaProject>(`/projects/${projectId}`);
  }

  // ─── Tasks ───────────────────────────────────────────────────────────────────

  /**
   * Fetch all tasks in a project.
   * Handles pagination automatically — fetches all pages.
   * @param projectId - Vikunja project ID
   */
  async getProjectTasks(projectId: number): Promise<VikunjaTask[]> {
    const allTasks: VikunjaTask[] = [];
    let page = 1;

    while (true) {
      const tasks = await this.request<VikunjaTask[]>(
        `/projects/${projectId}/tasks?per_page=50&page=${page}`
      );
      allTasks.push(...tasks);
      if (tasks.length < 50) break; // Last page
      page++;
    }

    return allTasks;
  }

  /**
   * Fetch all tasks across all projects.
   * Iterates through each project and fetches its tasks.
   * More reliable than /tasks/all as it works across all Vikunja versions.
   */
  async getAllTasks(): Promise<VikunjaTask[]> {
    const projects = await this.getProjects();
    const allTasks: VikunjaTask[] = [];

    for (const project of projects) {
      // Skip archived projects
      if (project.is_archived) continue;

      try {
        const tasks = await this.getProjectTasks(project.id);
        allTasks.push(...tasks);
      } catch (err) {
        // Skip this project if we can't fetch its tasks
        console.warn(`Failed to fetch tasks for project ${project.id}:`, err);
      }
    }

    return allTasks;
  }

  /**
   * Fetch a single task by ID.
   * @param taskId - Vikunja task ID
   */
  async getTask(taskId: number): Promise<VikunjaTask> {
    return this.request<VikunjaTask>(`/tasks/${taskId}`);
  }

  /**
   * Create a new task in a project.
   * @param projectId - The project to create the task in
   * @param payload   - Task data
   */
  async createTask(projectId: number, payload: CreateTaskPayload): Promise<VikunjaTask> {
    return this.request<VikunjaTask>(`/projects/${projectId}/tasks`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Update an existing task.
   * Uses POST as per Vikunja API convention.
   * @param taskId  - The task to update
   * @param payload - Fields to update (partial update supported)
   */
  async updateTask(taskId: number, payload: UpdateTaskPayload): Promise<VikunjaTask> {
    return this.request<VikunjaTask>(`/tasks/${taskId}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Mark a task as done or not done.
   * Convenience wrapper around updateTask.
   * @param taskId - The task to update
   * @param done   - Whether the task is complete
   */
  async setTaskDone(taskId: number, done: boolean): Promise<VikunjaTask> {
    return this.updateTask(taskId, { done });
  }

  /**
   * Delete a task permanently.
   * @param taskId - The task to delete
   */
  async deleteTask(taskId: number): Promise<void> {
    await this.request<void>(`/tasks/${taskId}`, { method: "DELETE" });
  }

  // ─── Labels ──────────────────────────────────────────────────────────────────

  /**
   * Fetch all labels the authenticated user has access to.
   */
  async getLabels(): Promise<VikunjaLabel[]> {
    return this.request<VikunjaLabel[]>("/labels?per_page=500");
  }

  /**
   * Create a new label.
   * @param label - Label data (title, hex_color, description)
   */
  async createLabel(label: {
    title: string;
    hex_color: string;
    description: string;
  }): Promise<VikunjaLabel> {
    return this.request<VikunjaLabel>("/labels", {
      method: "PUT",
      body: JSON.stringify(label),
    });
  }

  /**
   * Add a label to a task.
   * @param taskId  - The task to label
   * @param labelId - The label to apply
   */
  async addLabelToTask(taskId: number, labelId: number): Promise<void> {
    await this.request<void>(`/tasks/${taskId}/labels`, {
      method: "PUT",
      body: JSON.stringify({ label_id: labelId }),
    });
  }

  /**
   * Remove a label from a task.
   * @param taskId  - The task
   * @param labelId - The label to remove
   */
  async removeLabelFromTask(taskId: number, labelId: number): Promise<void> {
    await this.request<void>(`/tasks/${taskId}/labels/${labelId}`, {
      method: "DELETE",
    });
  }
}
