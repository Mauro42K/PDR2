import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { PostgresRepository } from './repository.js';
import { buildApp } from './app.js';
import type { ProjectFile } from '../shared/model.js';
import { verificarDestino } from '../shared/destino-pruebas.js';

const enabled = process.env.PDR2_INTEGRATION_TESTS === '1';
// Defensa en profundidad: aunque se ejecute vitest directo, no se abre ningún pool hacia un destino ajeno.
if (enabled) {
  const veredicto = verificarDestino(process.env.DATABASE_URL ?? '');
  if (veredicto.tipo === 'rechazado') throw new Error(veredicto.mensaje);
}
describe.skipIf(!enabled)('PostgreSQL persistence on isolated pdr2_test', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const repository = new PostgresRepository(pool);
  const projectIds: string[] = [];
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterAll(async () => {
    for (const id of projectIds) await repository.deleteProject(id);
    while (apps.length) await apps.pop()!.close();
    await pool.end();
  });
  it('persists project, task dates, dependencies and atomic replacement', async () => {
    const project = await repository.createProject(`Automated test ${crypto.randomUUID()}`);
    projectIds.push(project.id);
    const withFirst = await repository.createTask(project.id, {
      id: crypto.randomUUID(),
      name: 'Design',
      startDate: '2026-02-27',
      endDate: '2026-02-28',
      status: 'pending',
      progress: 0,
      isMilestone: false,
    });
    expect(withFirst?.tasks[0].startDate).toBe('2026-02-27');
    await repository.createTask(project.id, {
      id: crypto.randomUUID(),
      name: 'Build',
      startDate: '2026-03-01',
      endDate: '2026-03-03',
      status: 'pending',
      progress: 0,
      isMilestone: false,
    });
    const current = await repository.getProject(project.id);
    const linked = await repository.addDependency(
      project.id,
      current!.tasks[0].id,
      current!.tasks[1].id,
    );
    expect(linked?.dependencies).toHaveLength(1);
    const replacement = {
      ...linked!,
      name: 'Replaced atomically',
      tasks: linked!.tasks.slice(0, 1),
      dependencies: [],
    };
    const replaced = await repository.replaceProject(project.id, replacement);
    expect(replaced?.name).toBe('Replaced atomically');
    expect(replaced?.tasks).toHaveLength(1);
    expect(replaced?.dependencies).toHaveLength(0);
  });
  it('keeps a reordered task order and task numbers after reloading (AF-20)', async () => {
    const project = await repository.createProject(`Automated order ${crypto.randomUUID()}`);
    projectIds.push(project.id);
    await repository.createTask(project.id, {
      id: crypto.randomUUID(),
      name: 'Alpha',
      startDate: '2026-02-27',
      endDate: '2026-02-27',
      status: 'pending',
      progress: 0,
      isMilestone: false,
    });
    await repository.createTask(project.id, {
      id: crypto.randomUUID(),
      name: 'Beta',
      startDate: '2026-02-28',
      endDate: '2026-02-28',
      status: 'pending',
      progress: 0,
      isMilestone: false,
    });
    const current = await repository.getProject(project.id);
    const [first, second] = current!.tasks;
    const swapped = {
      ...current!,
      tasks: current!.tasks.map((task) =>
        task.id === first.id
          ? { ...task, position: second.position }
          : task.id === second.id
            ? { ...task, position: first.position }
            : task,
      ),
    };
    await repository.replaceProject(project.id, swapped);
    const reloaded = await repository.getProject(project.id);
    expect(reloaded!.tasks.map((task) => task.name)).toEqual(['Beta', 'Alpha']);
    expect(reloaded!.tasks.find((task) => task.name === 'Alpha')!.number).toBe(first.number);
    expect(reloaded!.tasks.find((task) => task.name === 'Beta')!.number).toBe(second.number);
  });
  it('replaces a different project from an export without colliding with source task IDs', async () => {
    const source = await repository.createProject(`Import source ${crypto.randomUUID()}`);
    projectIds.push(source.id);
    await repository.createTask(source.id, {
      id: crypto.randomUUID(),
      name: 'Source predecessor',
      startDate: '2026-04-01',
      endDate: '2026-04-02',
      status: 'pending',
      progress: 0,
      isMilestone: false,
    });
    await repository.createTask(source.id, {
      id: crypto.randomUUID(),
      name: 'Source successor',
      startDate: '2026-04-03',
      endDate: '2026-04-04',
      status: 'pending',
      progress: 0,
      isMilestone: false,
    });
    const sourceWithTasks = await repository.getProject(source.id);
    await repository.addDependency(
      source.id,
      sourceWithTasks!.tasks[0].id,
      sourceWithTasks!.tasks[1].id,
    );
    const sourceBefore = await repository.getProject(source.id);

    const target = await repository.createProject(`Import target ${crypto.randomUUID()}`);
    projectIds.push(target.id);
    await repository.createTask(target.id, {
      id: crypto.randomUUID(),
      name: 'Old target task',
      startDate: '2026-05-01',
      endDate: '2026-05-01',
      status: 'pending',
      progress: 0,
      isMilestone: false,
    });
    const server = await buildApp({ repository });
    apps.push(server);
    const exported = await server.app.inject({
      method: 'GET',
      url: `/api/projects/${source.id}/export`,
    });
    expect(exported.statusCode).toBe(200);
    const result = await server.app.inject({
      method: 'POST',
      url: '/api/projects/import',
      payload: { ...exported.json<ProjectFile>(), mode: 'replace', targetProjectId: target.id },
    });

    expect(result.statusCode).toBe(200);
    const replaced = result.json<{
      id: string;
      name: string;
      tasks: Array<{ id: string; name: string }>;
      dependencies: Array<{ id: string; predecessorId: string; successorId: string }>;
    }>();
    expect(replaced.id).toBe(target.id);
    expect(replaced.tasks.map((task) => task.name)).toEqual([
      'Source predecessor',
      'Source successor',
    ]);
    expect(
      replaced.tasks.every(
        (task) => !sourceBefore!.tasks.some((sourceTask) => sourceTask.id === task.id),
      ),
    ).toBe(true);
    expect(replaced.dependencies).toHaveLength(1);
    expect(replaced.dependencies[0].id).not.toBe(sourceBefore!.dependencies[0].id);
    expect(replaced.dependencies[0].predecessorId).toBe(replaced.tasks[0].id);
    expect(replaced.dependencies[0].successorId).toBe(replaced.tasks[1].id);
    expect(await repository.getProject(source.id)).toEqual(sourceBefore);
  });
  it('round-trips groups and notes with fresh identifiers and rolls back a failed replacement', async () => {
    const source = await repository.createProject(`Groups source ${crypto.randomUUID()}`);
    projectIds.push(source.id);
    const taskId = crypto.randomUUID();
    await repository.createTask(source.id, {
      id: taskId,
      name: 'Task',
      startDate: '2026-04-01',
      endDate: '2026-04-02',
      status: 'pending',
      progress: 0,
      isMilestone: false,
    });
    const initial = (await repository.getProject(source.id))!;
    const group = {
      id: crypto.randomUUID(),
      name: 'Phase',
      position: 0,
      note: 'Group context\nSecond line',
      color: 'amber' as const,
    };
    await repository.saveProjectState(source.id, {
      ...initial,
      groups: [group],
      tasks: initial.tasks.map((task) => ({ ...task, groupId: group.id, note: 'First\nSecond' })),
    });
    const sourceBefore = (await repository.getProject(source.id))!;
    const server = await buildApp({ repository });
    apps.push(server);
    const exported = await server.app.inject({
      method: 'GET',
      url: `/api/projects/${source.id}/export`,
    });
    const result = await server.app.inject({
      method: 'POST',
      url: '/api/projects/import',
      payload: { ...exported.json<ProjectFile>(), mode: 'copy' },
    });
    expect(result.statusCode).toBe(201);
    const copy = result.json<typeof sourceBefore>();
    projectIds.push(copy.id);
    expect(copy.groups![0].id).not.toBe(group.id);
    expect(copy.groups![0].note).toBe(group.note);
    expect(copy.groups![0].color).toBe('amber');
    expect(copy.tasks[0].groupId).toBe(copy.groups![0].id);
    expect(copy.tasks[0].note).toBe('First\nSecond');
    expect((await repository.getProject(copy.id))?.groups?.[0].note).toBe(group.note);
    expect((await repository.getProject(copy.id))?.groups?.[0].color).toBe('amber');
    expect(await repository.getProject(source.id)).toEqual(sourceBefore);
    const invalid = {
      ...sourceBefore,
      name: 'Must roll back',
      groups: [{ ...group, id: copy.groups![0].id }],
    };
    await expect(repository.replaceProject(source.id, invalid)).rejects.toThrow();
    expect(await repository.getProject(source.id)).toEqual(sourceBefore);
  });
});
