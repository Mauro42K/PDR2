export const HISTORY_LIMIT = 100;

export function appendHistoryEntry<T>(entries: T[], entry: T): T[] {
  return [...entries, entry].slice(-HISTORY_LIMIT);
}
