import type { Task } from '../shared/model.js';
import type { messages } from './i18n.js';

export function planningNotice(
  task: Task,
  text: ReturnType<typeof messages>,
  reopened: boolean,
): string | undefined {
  if (task.status === 'completed') return;
  if (task.progress === 100) return text.statusSoftNotice;
  if (task.status === 'pending' && task.progress > 0) return text.statusPendingNotice;
  if (task.status === 'in_progress' && reopened) return text.statusReopened;
}
