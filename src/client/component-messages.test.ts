import { describe, expect, it } from 'vitest';
import { componentMessages } from './component-messages.js';

describe('component messages', () => {
  it('provides equivalent labels and preserves interpolated names in both languages', () => {
    expect(componentMessages('es').predecessorFor('Plan')).toBe('Predecesora para Plan');
    expect(componentMessages('en').predecessorFor('Plan')).toBe('Predecessor for Plan');
    expect(componentMessages('es').missingTaskNumber(42)).toBe(
      'No existe ninguna tarea con el número 42.',
    );
    expect(componentMessages('en').missingTaskNumber(42)).toBe('There is no task with number 42.');
    expect(componentMessages('es').taskNote('Plan')).toBe('Nota de tarea: Plan');
    expect(componentMessages('en').taskNote('Plan')).toBe('Task note: Plan');
  });
});
