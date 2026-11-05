export type Locale = 'es' | 'en';
export const GROUP_COLORS = ['blue', 'teal', 'green', 'amber', 'violet', 'rose'] as const;
export type GroupColor = typeof GROUP_COLORS[number];
export const TASK_STATUSES = ['pending', 'in_progress', 'blocked', 'completed'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
/** Stable task number used in predecessors. 0 means "not assigned yet" (only in requests for new tasks). */
export interface Task { id: string; name: string; startDate: string; endDate: string; position: number; groupId?: string | null; note?: string; number: number; status: TaskStatus; progress: number; isMilestone: boolean; }
export interface TaskGroup { id: string; name: string; position: number; note?: string; color?: GroupColor | null; }
export interface Dependency { id: string; predecessorId: string; successorId: string; }
export interface Project { id: string; name: string; tasks: Task[]; dependencies: Dependency[]; groups?: TaskGroup[]; updatedAt: string; }
export interface ProjectSummary { id: string; name: string; updatedAt: string; }
export interface ProjectFile { format: 'pdr2-project'; version: 1 | 2 | 3; exportedAt: string; project: Project; }
export type SaveState = 'saved' | 'saving' | 'error';
export type CalendarAlert = 'overdue' | 'late_start' | 'due_soon';
export const dayMs = 86_400_000;

export function isISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function durationDays(task: Pick<Task, 'startDate' | 'endDate'>): number {
  return Math.floor((Date.parse(`${task.endDate}T00:00:00Z`) - Date.parse(`${task.startDate}T00:00:00Z`)) / dayMs) + 1;
}

/** Days that count toward group progress. A milestone weighs 0 (durationDays would give 1). */
export function weightDays(task: Pick<Task, 'startDate' | 'endDate' | 'isMilestone'>): number {
  return task.isMilestone ? 0 : durationDays(task);
}

/** Completed tasks always carry 100 % progress. Other statuses keep the value they receive. */
export function progressForStatus(status: TaskStatus, progress: number): number {
  return status === 'completed' ? 100 : progress;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. Never use toISOString for "today": it shifts the day at night in zones east of UTC. */
export function todayLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);
}

/** Calendar alert for one task or milestone, or null. Completed tasks never raise alerts. */
export function calendarAlert(task: Pick<Task, 'startDate' | 'endDate' | 'status' | 'isMilestone'>, today: string): CalendarAlert | null {
  if (task.status === 'completed') return null;
  if (task.endDate < today) return 'overdue';
  if (!task.isMilestone && task.status === 'pending' && task.startDate < today) return 'late_start';
  if (task.endDate >= today && task.endDate <= addDays(today, 3)) return 'due_soon';
  return null;
}

/** Summary of a group: earliest start, latest end, progress weighted by weightDays (D3). Null for an empty group. */
export function groupSummary(tasks: Pick<Task, 'startDate' | 'endDate' | 'progress' | 'isMilestone'>[]): { startDate: string; endDate: string; progress: number } | null {
  if (!tasks.length) return null;
  const startDate = tasks.reduce((min, task) => (task.startDate < min ? task.startDate : min), tasks[0].startDate);
  const endDate = tasks.reduce((max, task) => (task.endDate > max ? task.endDate : max), tasks[0].endDate);
  const weight = tasks.reduce((sum, task) => sum + weightDays(task), 0);
  const progress = weight === 0
    ? Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length)
    : Math.round(tasks.reduce((sum, task) => sum + weightDays(task) * task.progress, 0) / weight);
  return { startDate, endDate, progress };
}

export function dependencyConflict(project: Project, taskId: string, startDate: string, endDate: string): Dependency[] {
  return project.dependencies.filter((dep) => {
    if (dep.predecessorId === taskId) {
      const successor = project.tasks.find((task) => task.id === dep.successorId);
      return !!successor && successor.startDate <= endDate;
    }
    if (dep.successorId === taskId) {
      const predecessor = project.tasks.find((task) => task.id === dep.predecessorId);
      return !!predecessor && startDate <= predecessor.endDate;
    }
    return false;
  });
}

/** True when the dependency graph contains a loop (Kahn's topological sort leaves tasks unsorted). */
export function hasDependencyCycle(tasks: Pick<Task, 'id'>[], dependencies: Pick<Dependency, 'predecessorId' | 'successorId'>[]): boolean {
  const ids = new Set(tasks.map((task) => task.id));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map([...ids].map((id) => [id, 0]));
  for (const dep of dependencies) {
    if (!ids.has(dep.predecessorId) || !ids.has(dep.successorId)) continue;
    outgoing.set(dep.predecessorId, [...(outgoing.get(dep.predecessorId) ?? []), dep.successorId]);
    indegree.set(dep.successorId, indegree.get(dep.successorId)! + 1);
  }
  const queue = [...ids].filter((id) => indegree.get(id) === 0);
  for (let index = 0; index < queue.length; index++) for (const next of outgoing.get(queue[index]) ?? []) {
    const count = indegree.get(next)! - 1; indegree.set(next, count); if (count === 0) queue.push(next);
  }
  return queue.length !== ids.size;
}

/** True when making `predecessorIds` the predecessors of `successorId` would close a loop. */
export function predecessorsCreateCycle(dependencies: Pick<Dependency, 'predecessorId' | 'successorId'>[], successorId: string, predecessorIds: string[]): boolean {
  const outgoing = new Map<string, string[]>();
  for (const dep of dependencies) {
    if (dep.successorId === successorId) continue;
    outgoing.set(dep.predecessorId, [...(outgoing.get(dep.predecessorId) ?? []), dep.successorId]);
  }
  const targets = new Set(predecessorIds);
  const stack = [successorId];
  const seen = new Set<string>();
  while (stack.length) {
    const node = stack.pop()!;
    if (targets.has(node)) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(outgoing.get(node) ?? []));
  }
  return false;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates one task. Version 1 and 2 files get defaults (number = index + 1, pending, 0, false).
 * Version 3 requires every field (A6). `allowUnassignedNumber` is used by state saves, where a new task has number 0.
 */
function validateTask(raw: Record<string, unknown>, index: number, version: 1 | 2 | 3, allowUnassignedNumber: boolean, ids: Set<string>): Task {
  const task = raw as Partial<Task> & Record<string, unknown>;
  if (!task || typeof task.id !== 'string' || !UUID.test(task.id) || ids.has(task.id) || typeof task.name !== 'string' || !task.name.trim() || task.name.length > 160 || !isISODate(task.startDate) || !isISODate(task.endDate) || task.endDate < task.startDate || (task.position !== undefined && (!Number.isInteger(task.position) || task.position < 0 || task.position > 2147483647))) throw new Error('El archivo contiene una tarea inválida.');
  if (version === 3 && (task.number === undefined || task.status === undefined || task.progress === undefined || task.isMilestone === undefined || task.position === undefined)) throw new Error('Faltan datos de la tarea en el archivo.');
  if (task.status !== undefined && !(TASK_STATUSES as readonly unknown[]).includes(task.status)) throw new Error('El estado de una tarea no es válido.');
  if (task.progress !== undefined && (!Number.isInteger(task.progress) || task.progress < 0 || task.progress > 100)) throw new Error('El progreso de una tarea debe ser un número entero entre 0 y 100.');
  if (task.isMilestone !== undefined && typeof task.isMilestone !== 'boolean') throw new Error('Faltan datos de la tarea en el archivo.');
  const isMilestone = task.isMilestone ?? false;
  if (isMilestone && task.startDate !== task.endDate) throw new Error('Un hito debe tener la misma fecha de inicio y fin.');
  const numberUnassigned = allowUnassignedNumber && task.number === 0;
  if (version === 3 && !numberUnassigned && (!Number.isInteger(task.number) || (task.number as number) < 1)) throw new Error('El número de tarea debe ser un entero mayor que cero.');
  const status = (task.status ?? 'pending') as TaskStatus;
  return {
    id: task.id,
    name: task.name,
    startDate: task.startDate,
    endDate: task.endDate,
    position: task.position ?? index,
    groupId: task.groupId ?? null,
    note: task.note ?? '',
    number: version === 3 ? (task.number as number) : index + 1,
    status,
    progress: progressForStatus(status, task.progress ?? 0),
    isMilestone
  };
}

/** Shared checks for a project: groups, notes, dependencies, cycles. Returns the normalized project. */
function validateProjectBody(project: Project, version: 1 | 2 | 3, allowUnassignedNumber: boolean): Project {
  if (typeof project.name !== 'string' || !project.name.trim() || project.name.trim().length > 160 || !Array.isArray(project.tasks) || !Array.isArray(project.dependencies) || (project.groups !== undefined && !Array.isArray(project.groups))) throw new Error('El proyecto tiene campos incompletos.');
  if (!UUID.test(project.id)) throw new Error('El identificador del proyecto no es válido.');
  const ids = new Set<string>();
  const tasks = project.tasks.map((task, index) => {
    const normalized = validateTask(task as unknown as Record<string, unknown>, index, version, allowUnassignedNumber, ids);
    ids.add(normalized.id);
    return normalized;
  });
  const numbers = new Set<number>();
  for (const task of tasks) {
    if (task.number === 0) continue;
    if (numbers.has(task.number)) throw new Error('El archivo repite el número de una tarea.');
    numbers.add(task.number);
  }
  const groups = Array.isArray(project.groups) ? project.groups : [];
  const groupIds = new Set<string>();
  for (const group of groups) {
    if (!group || typeof group.id !== 'string' || !UUID.test(group.id) || groupIds.has(group.id) || typeof group.name !== 'string' || !group.name.trim() || group.name.length > 160 || !Number.isInteger(group.position) || group.position < 0 || group.position > 2147483647) throw new Error('El archivo contiene un grupo inválido.');
    if (group.note != null && (typeof group.note !== 'string' || group.note.length > 10000)) throw new Error('La nota de un grupo no es válida.');
    if (group.color != null && !(GROUP_COLORS as readonly unknown[]).includes(group.color)) throw new Error('El color de un grupo no es válido.');
    groupIds.add(group.id);
  }
  for (const task of tasks) {
    if (task.groupId != null && !groupIds.has(task.groupId)) throw new Error('La tarea hace referencia a un grupo inexistente.');
    if (task.note != null && (typeof task.note !== 'string' || task.note.length > 10000)) throw new Error('La nota de una tarea no es válida.');
  }
  const dependencyPairs = new Set<string>();
  const dependencyIds = new Set<string>();
  for (const dep of project.dependencies) {
    if (!dep || typeof dep !== 'object') throw new Error('El archivo contiene una dependencia inválida.');
    const pair = `${dep.predecessorId}:${dep.successorId}`;
    if (typeof dep.id !== 'string' || !UUID.test(dep.id) || dependencyIds.has(dep.id) || !ids.has(dep.predecessorId) || !ids.has(dep.successorId) || dep.predecessorId === dep.successorId || dependencyPairs.has(pair)) throw new Error('El archivo contiene una dependencia inválida.');
    dependencyIds.add(dep.id);
    dependencyPairs.add(pair);
  }
  if (hasDependencyCycle(tasks, project.dependencies)) throw new Error('El archivo contiene un ciclo de dependencias.');
  return { ...project, groups: groups.map((group) => ({ ...group, note: group.note ?? '', color: group.color ?? null })), tasks };
}

/** Validates an import file (versions 1, 2 and 3). Always returns version 3. */
export function validateProjectFile(input: unknown): ProjectFile {
  if (!input || typeof input !== 'object') throw new Error('El archivo no contiene un proyecto válido.');
  const file = input as Partial<ProjectFile>;
  const project = file.project;
  if (file.format !== 'pdr2-project' || (file.version !== 1 && file.version !== 2 && file.version !== 3) || !project || typeof project !== 'object') throw new Error('Formato o versión de archivo no compatibles.');
  return { ...file, version: 3, project: validateProjectBody(project, file.version, false) } as ProjectFile;
}

/** Validates a state save from the client. New tasks may come with number 0; the server assigns their numbers. */
export function validateProjectState(input: unknown): Project {
  if (!input || typeof input !== 'object') throw new Error('El estado del proyecto no es válido.');
  return validateProjectBody(input as Project, 3, true);
}
