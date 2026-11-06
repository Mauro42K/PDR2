import type { Locale, Project, ProjectFile, ProjectSummary, Task } from '../shared/model.js';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data?: unknown,
  ) {
    super(message);
  }
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      data.message ?? data.error ?? `HTTP ${response.status}`,
      response.status,
      data,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
export const api = {
  projects: () => request<ProjectSummary[]>('/api/projects'),
  project: (id: string) => request<Project>(`/api/projects/${id}`),
  createProject: (name: string) => request<Project>('/api/projects', json('POST', { name })),
  renameProject: (id: string, name: string) =>
    request<Project>(`/api/projects/${id}`, json('PATCH', { name })),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, json('DELETE')),
  addTask: (projectId: string, input: Pick<Task, 'name' | 'startDate' | 'endDate'>) =>
    request<Project>(`/api/projects/${projectId}/tasks`, json('POST', input)),
  updateTask: (
    projectId: string,
    taskId: string,
    input: Pick<Task, 'name' | 'startDate' | 'endDate'> &
      Partial<Pick<Task, 'status' | 'progress' | 'isMilestone'>>,
    acceptConflict = false,
  ) =>
    request<Project>(
      `/api/projects/${projectId}/tasks/${taskId}${acceptConflict ? '?acceptConflict=true' : ''}`,
      json('PATCH', input),
    ),
  deleteTask: (projectId: string, taskId: string) =>
    request<Project>(`/api/projects/${projectId}/tasks/${taskId}`, json('DELETE')),
  addDependency: (projectId: string, predecessorId: string, successorId: string) =>
    request<Project>(
      `/api/projects/${projectId}/dependencies`,
      json('POST', { predecessorId, successorId }),
    ),
  removeDependency: (projectId: string, dependencyId: string) =>
    request<Project>(`/api/projects/${projectId}/dependencies/${dependencyId}`, json('DELETE')),
  importProject: (
    file: ProjectFile,
    mode: 'copy' | 'replace',
    projectId?: string,
    locale?: Locale,
  ) =>
    request<Project>(
      '/api/projects/import',
      json('POST', {
        ...file,
        mode,
        locale,
        targetProjectId: mode === 'replace' ? projectId : undefined,
      }),
    ),
  saveProjectState: (project: Project) =>
    request<Project>(`/api/projects/${project.id}/state`, json('PUT', project)),
};
