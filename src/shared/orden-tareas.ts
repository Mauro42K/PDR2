import type { Task } from './model.js';

export type { Task };

/** Tasks in the same scope: the same group, or «Sin grupo» when groupId is empty. */
function scopeOf(tasks: Task[], taskId: string) {
  const target = tasks.find((item) => item.id === taskId);
  if (!target) return null;
  const key = target.groupId || null;
  const scope = tasks
    .filter((item) => (item.groupId || null) === key)
    .sort((a, b) => a.position - b.position);
  return { scope, index: scope.findIndex((item) => item.id === taskId) };
}

/** True when the task can move one step in that direction without leaving its group or «Sin grupo». */
export function canMoveTaskWithinScope(tasks: Task[], taskId: string, direction: -1 | 1) {
  const found = scopeOf(tasks, taskId);
  return !!found && found.scope[found.index + direction] !== undefined;
}

/**
 * Moves a task one step within its group (or «Sin grupo») by swapping positions with its neighbour.
 * Numbers and predecessors are untouched: only the order of the scope changes. Returns null when the
 * move is not possible. Never mutates the input.
 */
export function moveTaskWithinScope(
  tasks: Task[],
  taskId: string,
  direction: -1 | 1,
): Task[] | null {
  const found = scopeOf(tasks, taskId);
  if (!found) return null;
  const neighbour = found.scope[found.index + direction];
  if (!neighbour) return null;
  const current = found.scope[found.index];
  const next = tasks.map((item) => ({ ...item }));
  const moved = next.find((item) => item.id === current.id)!;
  const other = next.find((item) => item.id === neighbour.id)!;

  if (moved.position !== other.position) {
    [moved.position, other.position] = [other.position, moved.position];
    return next;
  }

  // Two tasks share a position (possible after an import): a plain swap would change nothing,
  // so renumber the scope consecutively in its new order and keep every other scope untouched.
  const order = [...found.scope];
  [order[found.index], order[found.index + direction]] = [
    order[found.index + direction],
    order[found.index],
  ];
  const base = Math.min(...found.scope.map((item) => item.position));
  order.forEach((item, offset) => {
    next.find((task) => task.id === item.id)!.position = base + offset;
  });
  return next;
}
