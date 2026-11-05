import { describe, expect, it } from 'vitest';
import { appendHistoryEntry, HISTORY_LIMIT } from './history.js';

describe('bounded project history', () => {
  it('keeps only the newest 100 snapshots', () => {
    const bounded = Array.from({ length: HISTORY_LIMIT + 1 }, (_, index) => index)
      .reduce((items, entry) => appendHistoryEntry(items, entry), [] as number[]);

    expect(bounded).toHaveLength(HISTORY_LIMIT);
    expect(bounded[0]).toBe(1);
    expect(bounded.at(-1)).toBe(HISTORY_LIMIT);
  });
});
