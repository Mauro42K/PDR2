import { describe, expect, it } from 'vitest';
import { addDays, calendarAlert, dependencyConflict, durationDays, groupSummary, hasDependencyCycle, isISODate, predecessorsCreateCycle, progressForStatus, todayLocal, validateProjectFile, validateProjectState, weightDays, type Project } from './model.js';

const project: Project = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Plan', updatedAt: '2026-01-01T00:00:00.000Z',
  tasks: [
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Design', startDate: '2026-01-09', endDate: '2026-01-10', position: 0, number: 1, status: 'pending' as const, progress: 0, isMilestone: false },
    { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Build', startDate: '2026-01-11', endDate: '2026-01-12', position: 1, number: 2, status: 'pending' as const, progress: 0, isMilestone: false }
  ], dependencies: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', predecessorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', successorId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }]
};

describe('calendar planning rules', () => {
  it('counts both endpoints and includes weekends', () => {
    expect(durationDays({ startDate: '2026-01-09', endDate: '2026-01-12' })).toBe(4);
    expect(durationDays({ startDate: '2024-02-28', endDate: '2024-03-01' })).toBe(3);
  });
  it('accepts real ISO calendar dates only', () => {
    expect(isISODate('2024-02-29')).toBe(true);
    expect(isISODate('2025-02-29')).toBe(false);
    expect(isISODate('2025-2-09')).toBe(false);
  });
  it('allows successor the day after predecessor and flags overlap', () => {
    expect(dependencyConflict(project, project.tasks[0].id, '2026-01-09', '2026-01-10')).toEqual([]);
    expect(dependencyConflict(project, project.tasks[0].id, '2026-01-09', '2026-01-11')).toHaveLength(1);
    expect(dependencyConflict(project, project.tasks[1].id, '2026-01-10', '2026-01-12')).toHaveLength(1);
  });
  it('rejects malformed project files before persistence', () => {
    expect(() => validateProjectFile({ format: 'pdr2-project', version: 99, project })).toThrow(/versión/);
    expect(validateProjectFile({ format: 'pdr2-project', version: 1, project }).project.tasks).toHaveLength(2);
    expect(() => validateProjectFile({ format: 'pdr2-project', version: 1, project: { ...project, tasks: [{ ...project.tasks[0], endDate: '2026-01-01' }] } })).toThrow(/inválida/);
  });
  it('normalizes version 1 and validates the version 2 group and dependency graph into version 3', () => {
    const legacy = validateProjectFile({ format: 'pdr2-project', version: 1, project });
    expect(legacy.version).toBe(3);
    expect(legacy.project.groups).toEqual([]);
    expect(legacy.project.tasks[0]).toMatchObject({ groupId: null, note: '' });
    const groupId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const grouped = { ...project, groups: [{ id: groupId, name: 'Phase', position: 0 }], tasks: project.tasks.map((task) => ({ ...task, groupId, note: 'Context' })) };
    expect(validateProjectFile({ format: 'pdr2-project', version: 2, project: grouped }).project).toMatchObject(grouped);
    expect(validateProjectFile({ format: 'pdr2-project', version: 2, project: grouped }).project.groups?.[0].color).toBeNull();
    const colored = { ...grouped, groups: [{ ...grouped.groups[0], color: 'teal' }] };
    expect(validateProjectFile({ format: 'pdr2-project', version: 2, project: colored }).project.groups?.[0].color).toBe('teal');
    expect(() => validateProjectFile({ format: 'pdr2-project', version: 2, project: { ...grouped, groups: [{ ...grouped.groups[0], color: '#ff0000' }] } })).toThrow(/color de un grupo/);
    const withGroupNote = { ...grouped, groups: [{ ...grouped.groups[0], note: 'Revisar alcance\nantes de cotizar' }] };
    expect(validateProjectFile({ format: 'pdr2-project', version: 2, project: withGroupNote }).project.groups?.[0].note).toBe('Revisar alcance\nantes de cotizar');
    expect(validateProjectFile({ format: 'pdr2-project', version: 2, project: grouped }).project.groups?.[0].note).toBe('');
    expect(() => validateProjectFile({ format: 'pdr2-project', version: 2, project: { ...grouped, groups: [{ ...grouped.groups[0], note: 42 }] } })).toThrow(/nota de un grupo/);
    expect(() => validateProjectFile({ format: 'pdr2-project', version: 2, project: { ...grouped, groups: [] } })).toThrow(/grupo/);
    const cycle = { ...grouped, dependencies: [...grouped.dependencies, { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', predecessorId: grouped.tasks[1].id, successorId: grouped.tasks[0].id }] };
    expect(() => validateProjectFile({ format: 'pdr2-project', version: 2, project: cycle })).toThrow(/ciclo/);
  });
});

describe('dependency loops', () => {
  const a = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const b = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const c = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const tasks = [{ id: a }, { id: b }, { id: c }];
  it('detects a loop in the stored graph', () => {
    expect(hasDependencyCycle(tasks, [{ predecessorId: a, successorId: b }, { predecessorId: b, successorId: c }])).toBe(false);
    expect(hasDependencyCycle(tasks, [{ predecessorId: a, successorId: b }, { predecessorId: b, successorId: a }])).toBe(true);
  });
  it('detects when a new predecessor would close a loop, including longer chains', () => {
    const chain = [{ predecessorId: a, successorId: b }, { predecessorId: b, successorId: c }];
    expect(predecessorsCreateCycle(chain, a, [c])).toBe(true);
    expect(predecessorsCreateCycle(chain, c, [a])).toBe(false);
  });
  it('ignores the successor current predecessors when replacing them', () => {
    const chain = [{ predecessorId: a, successorId: b }];
    expect(predecessorsCreateCycle(chain, b, [a])).toBe(false);
    expect(predecessorsCreateCycle(chain, a, [b])).toBe(true);
  });
});

describe('F3-02 planning rules', () => {
  const base = { startDate: '2026-10-29', endDate: '2026-10-31', status: 'pending' as const, isMilestone: false, progress: 0 };
  it('weighs milestones as zero days and keeps task durations', () => {
    expect(weightDays({ ...base, isMilestone: true, endDate: '2026-10-29' })).toBe(0);
    expect(weightDays(base)).toBe(3);
  });
  it('forces completed tasks to 100 % and keeps other progress', () => {
    expect(progressForStatus('completed', 40)).toBe(100);
    expect(progressForStatus('in_progress', 40)).toBe(40);
  });
  it('computes calendar alerts with the local day and the three-day window', () => {
    expect(calendarAlert({ ...base, endDate: '2026-10-29' }, '2026-10-30')).toBe('overdue');
    expect(calendarAlert({ ...base, startDate: '2026-10-28', endDate: '2026-11-10' }, '2026-10-30')).toBe('late_start');
    expect(calendarAlert({ ...base, status: 'in_progress', startDate: '2026-10-28', endDate: '2026-11-02' }, '2026-10-30')).toBe('due_soon');
    expect(calendarAlert({ ...base, status: 'in_progress', startDate: '2026-10-28', endDate: '2026-11-03' }, '2026-10-30')).toBeNull();
    expect(calendarAlert({ ...base, status: 'completed', endDate: '2026-10-01' }, '2026-10-30')).toBeNull();
  });
  it('does not raise "start overdue" for milestones', () => {
    expect(calendarAlert({ ...base, isMilestone: true, startDate: '2026-10-20', endDate: '2026-10-20' }, '2026-10-30')).toBe('overdue');
    expect(calendarAlert({ ...base, isMilestone: true, startDate: '2026-10-20', endDate: '2026-10-20', status: 'pending' }, '2026-10-30')).toBe('overdue');
  });
  it('builds a group summary with weighted progress and milestone-only fallback', () => {
    const summary = groupSummary([
      { ...base, startDate: '2026-10-26', endDate: '2026-10-28', progress: 100 },
      { ...base, startDate: '2026-10-29', endDate: '2026-11-03', progress: 40 }
    ]);
    expect(summary).toEqual({ startDate: '2026-10-26', endDate: '2026-11-03', progress: 60 });
    expect(groupSummary([{ ...base, isMilestone: true, endDate: '2026-10-29', progress: 100 }, { ...base, isMilestone: true, endDate: '2026-10-29', progress: 0 }])?.progress).toBe(50);
    expect(groupSummary([])).toBeNull();
  });
  it('adds one day to a date without shifting it', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(todayLocal(new Date(2026, 9, 30, 23, 30))).toBe('2026-10-30');
  });
  it('validates v3 state saves: new tasks may carry number 0, but the status must be valid', () => {
    const state = { ...project, tasks: project.tasks.map((task, index) => ({ ...task, number: index === 0 ? 0 : 2 })) };
    expect(validateProjectState(state).tasks[0].number).toBe(0);
    expect(() => validateProjectState({ ...project, tasks: [{ ...project.tasks[0], status: 'done' }] })).toThrow(/estado/);
    expect(() => validateProjectState({ ...project, tasks: [{ ...project.tasks[0], progress: 101 }] })).toThrow(/progreso/);
  });
  it('rejects a v3 file that misses a planning field and milestones with different dates', () => {
    const { status: _status, ...withoutStatus } = project.tasks[0];
    expect(() => validateProjectFile({ format: 'pdr2-project', version: 3, project: { ...project, tasks: [withoutStatus] } })).toThrow(/Faltan datos/);
    expect(() => validateProjectFile({ format: 'pdr2-project', version: 3, project: { ...project, tasks: [{ ...project.tasks[0], isMilestone: true }] } })).toThrow(/misma fecha/);
  });
});
