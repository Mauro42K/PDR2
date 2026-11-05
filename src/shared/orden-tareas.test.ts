import { describe, expect, it } from 'vitest';
import { canMoveTaskWithinScope, moveTaskWithinScope, type Task } from './orden-tareas.js';

function task(id: string, groupId: string | null, position: number, number: number): Task {
  return { id, name: `Tarea ${id}`, startDate: '2026-10-28', endDate: '2026-10-28', position, groupId, number, status: 'pending', progress: 0, isMilestone: false, note: '' };
}
const positions = (tasks: Task[]) => Object.fromEntries(tasks.map((item) => [item.id, item.position]));

describe('orden de tareas dentro de su ámbito (AF-20)', () => {
  it('baja una tarea intercambiando solo su posición con la vecina del mismo grupo', () => {
    const tasks = [task('a', 'g1', 0, 1), task('b', 'g1', 1, 2), task('c', 'g2', 2, 3)];

    const next = moveTaskWithinScope(tasks, 'a', 1)!;

    expect(positions(next)).toEqual({ a: 1, b: 0, c: 2 });
    expect(next.find((item) => item.id === 'a')!.number).toBe(1);
    expect(next.find((item) => item.id === 'b')!.number).toBe(2);
  });

  it('sube una tarea dentro de «Sin grupo» sin saltar tareas de otros grupos', () => {
    const tasks = [task('a', 'g1', 0, 1), task('b', null, 1, 2), task('c', 'g1', 2, 3), task('d', null, 3, 4)];

    const next = moveTaskWithinScope(tasks, 'd', -1)!;

    expect(positions(next)).toEqual({ a: 0, b: 3, c: 2, d: 1 });
  });

  it('no mueve una tarea más allá del borde de su ámbito', () => {
    const tasks = [task('a', 'g1', 0, 1), task('b', 'g1', 1, 2), task('c', 'g2', 2, 3)];

    expect(moveTaskWithinScope(tasks, 'a', -1)).toBeNull();
    expect(moveTaskWithinScope(tasks, 'b', 1)).toBeNull();
    expect(canMoveTaskWithinScope(tasks, 'c', 1)).toBe(false);
    expect(canMoveTaskWithinScope(tasks, 'a', 1)).toBe(true);
  });

  it('devuelve null para una tarea que no existe', () => {
    expect(moveTaskWithinScope([task('a', null, 0, 1)], 'zz', 1)).toBeNull();
  });

  it('renumera las posiciones del ámbito cuando dos tareas comparten posición, para que el movimiento sea visible', () => {
    const tasks = [task('a', null, 4, 1), task('b', null, 4, 2), task('c', 'g1', 9, 3)];

    const next = moveTaskWithinScope(tasks, 'a', 1)!;

    expect(next.find((item) => item.id === 'b')!.position).toBeLessThan(next.find((item) => item.id === 'a')!.position);
    expect(next.find((item) => item.id === 'c')!.position).toBe(9);
  });

  it('no modifica el arreglo original', () => {
    const tasks = [task('a', null, 0, 1), task('b', null, 1, 2)];

    moveTaskWithinScope(tasks, 'a', 1);

    expect(positions(tasks)).toEqual({ a: 0, b: 1 });
  });
});
