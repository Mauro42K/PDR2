import { componentMessages } from './component-messages.js';
import type { Locale, Task, TaskGroup } from '../shared/model.js';

/** Human-readable context; IDs remain the persisted identity. */
export function taskReference(task: Task, groups: TaskGroup[], locale: Locale): string {
  const group =
    groups.find((item) => item.id === task.groupId)?.name ?? componentMessages(locale).ungrouped;
  return `#${task.number} · ${task.name} · ${group}`;
}
