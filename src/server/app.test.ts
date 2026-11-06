import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { Repository } from './repository.js';
import type { Project, ProjectSummary, Task } from '../shared/model.js';

const ids = {
  a: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  b: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};
class MemoryRepository implements Repository {
  projects: Project[] = [];
  listProjects = async (): Promise<ProjectSummary[]> =>
    this.projects.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));
  getProject = async (id: string) => this.projects.find((project) => project.id === id) ?? null;
  createProject = async (name: string) => {
    const project = {
      id: crypto.randomUUID(),
      name,
      tasks: [],
      dependencies: [],
      updatedAt: new Date().toISOString(),
    };
    this.projects.push(project);
    return project;
  };
  createProjectFromFile = async (project: Project) => {
    this.projects.push(project);
    return project;
  };
  renameProject = async (id: string, name: string) => {
    const p = await this.getProject(id);
    if (p) p.name = name;
    return p;
  };
  deleteProject = async (id: string) => {
    const before = this.projects.length;
    this.projects = this.projects.filter((p) => p.id !== id);
    return before !== this.projects.length;
  };
  createTask = async (
    projectId: string,
    input: Pick<
      Task,
      'id' | 'name' | 'startDate' | 'endDate' | 'status' | 'progress' | 'isMilestone'
    >,
  ) => {
    const p = await this.getProject(projectId);
    if (!p) return null;
    const number = p.tasks.reduce((max, task) => Math.max(max, task.number), 0) + 1;
    p.tasks.push({ ...input, position: p.tasks.length, number, groupId: null, note: '' });
    return p;
  };
  updateTask = async (
    projectId: string,
    taskId: string,
    input: Pick<Task, 'name' | 'startDate' | 'endDate' | 'status' | 'progress' | 'isMilestone'>,
  ) => {
    const p = await this.getProject(projectId);
    const task = p?.tasks.find((x) => x.id === taskId);
    if (!p || !task) return null;
    Object.assign(task, input);
    return p;
  };
  deleteTask = async (projectId: string, taskId: string) => {
    const p = await this.getProject(projectId);
    if (!p) return null;
    p.tasks = p.tasks.filter((task) => task.id !== taskId);
    p.dependencies = p.dependencies.filter(
      (dep) => dep.predecessorId !== taskId && dep.successorId !== taskId,
    );
    return p;
  };
  addDependency = async (projectId: string, predecessorId: string, successorId: string) => {
    const p = await this.getProject(projectId);
    if (
      !p ||
      !p.tasks.some((t) => t.id === predecessorId) ||
      !p.tasks.some((t) => t.id === successorId)
    )
      return null;
    p.dependencies.push({ id: crypto.randomUUID(), predecessorId, successorId });
    return p;
  };
  removeDependency = async (projectId: string, id: string) => {
    const p = await this.getProject(projectId);
    if (!p) return null;
    p.dependencies = p.dependencies.filter((d) => d.id !== id);
    return p;
  };
  replaceProject = async (id: string, replacement: Project) => {
    const index = this.projects.findIndex((p) => p.id === id);
    if (index < 0) return null;
    this.projects[index] = replacement;
    return replacement;
  };
  saveProjectState = async (id: string, state: Project) => this.replaceProject(id, state);
}

const servers: Array<Awaited<ReturnType<typeof buildApp>>> = [];
async function setup() {
  const repository = new MemoryRepository();
  const server = await buildApp({ repository });
  servers.push(server);
  const project = await repository.createProject('Plan');
  const first = await repository.createTask(project.id, {
    id: ids.a,
    name: 'Design',
    startDate: '2026-01-09',
    endDate: '2026-01-10',
    status: 'pending',
    progress: 0,
    isMilestone: false,
  });
  await repository.createTask(project.id, {
    id: ids.b,
    name: 'Build',
    startDate: '2026-01-11',
    endDate: '2026-01-12',
    status: 'pending',
    progress: 0,
    isMilestone: false,
  });
  await repository.addDependency(project.id, ids.a, ids.b);
  return { app: server.app, repository, project: first! };
}
afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});

describe('Fastify API', () => {
  it('validates task inputs and reports dependency conflict before writing', async () => {
    const { app, repository, project } = await setup();
    const invalid = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/tasks`,
      payload: { name: 'Bad', startDate: '2026-02-30', endDate: '2026-03-01' },
    });
    expect(invalid.statusCode).toBe(400);
    const conflict = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}/tasks/${ids.a}`,
      payload: { name: 'Design', startDate: '2026-01-09', endDate: '2026-01-11' },
    });
    expect(conflict.statusCode).toBe(409);
    expect((await repository.getProject(project.id))?.tasks[0].endDate).toBe('2026-01-10');
    const accepted = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}/tasks/${ids.a}?acceptConflict=true`,
      payload: { name: 'Design', startDate: '2026-01-09', endDate: '2026-01-11' },
    });
    expect(accepted.statusCode).toBe(200);
    expect((await repository.getProject(project.id))?.tasks[1].startDate).toBe('2026-01-11');
  });
  it('rejects invalid imports without changing projects and creates independent IDs for copies', async () => {
    const { app, repository, project } = await setup();
    const before = structuredClone(repository.projects);
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/projects/import',
      payload: { format: 'wrong', version: 1, mode: 'copy', project },
    });
    expect(invalid.statusCode).toBe(400);
    expect(repository.projects).toEqual(before);
    const file = {
      format: 'pdr2-project',
      version: 1,
      exportedAt: new Date().toISOString(),
      mode: 'copy',
      project,
    };
    const copied = await app.inject({ method: 'POST', url: '/api/projects/import', payload: file });
    expect(copied.statusCode).toBe(201);
    const copy = copied.json<Project>();
    expect(copy.id).not.toBe(project.id);
    expect(copy.tasks[0].id).not.toBe(project.tasks[0].id);
    expect(copy.dependencies[0].predecessorId).toBe(copy.tasks[0].id);
  });
  it('replaces another project with fresh task and dependency IDs while preserving the source', async () => {
    const { app, repository, project: source } = await setup();
    const sourceBefore = structuredClone(source);
    const target = await repository.createProject('Destination');
    await repository.createTask(target.id, {
      id: crypto.randomUUID(),
      name: 'Old destination task',
      startDate: '2026-04-01',
      endDate: '2026-04-01',
      status: 'pending',
      progress: 0,
      isMilestone: false,
    });

    const result = await app.inject({
      method: 'POST',
      url: '/api/projects/import',
      payload: {
        format: 'pdr2-project',
        version: 1,
        exportedAt: new Date().toISOString(),
        mode: 'replace',
        targetProjectId: target.id,
        project: source,
      },
    });

    expect(result.statusCode).toBe(200);
    const replaced = result.json<Project>();
    expect(replaced.id).toBe(target.id);
    expect(replaced.name).toBe(source.name);
    expect(replaced.tasks.map((task) => task.name)).toEqual(source.tasks.map((task) => task.name));
    expect(replaced.tasks.map((task) => task.id)).not.toEqual(source.tasks.map((task) => task.id));
    expect(
      replaced.tasks.every((task) => !source.tasks.some((original) => original.id === task.id)),
    ).toBe(true);
    expect(replaced.dependencies).toHaveLength(source.dependencies.length);
    expect(replaced.dependencies[0].id).not.toBe(source.dependencies[0].id);
    expect(replaced.dependencies[0].predecessorId).toBe(replaced.tasks[0].id);
    expect(replaced.dependencies[0].successorId).toBe(replaced.tasks[1].id);
    expect(await repository.getProject(source.id)).toEqual(sourceBefore);
    expect(replaced.tasks.some((task) => task.name === 'Old destination task')).toBe(false);
  });
  it('atomically validates and saves complete project states for undo and redo', async () => {
    const { app, repository, project } = await setup();
    const next = structuredClone(project);
    next.groups = [{ id: crypto.randomUUID(), name: 'Phase', position: 0, note: 'Group context' }];
    next.tasks[0].groupId = next.groups[0].id;
    next.tasks[0].note = 'Context';
    const saved = await app.inject({
      method: 'PUT',
      url: `/api/projects/${project.id}/state`,
      payload: next,
    });
    expect(saved.statusCode).toBe(200);
    expect((await repository.getProject(project.id))?.tasks[0]).toMatchObject({
      groupId: next.groups[0].id,
      note: 'Context',
    });
    expect((await repository.getProject(project.id))?.groups?.[0].note).toBe('Group context');
    const invalid = structuredClone(next);
    invalid.tasks[0].groupId = crypto.randomUUID();
    const rejected = await app.inject({
      method: 'PUT',
      url: `/api/projects/${project.id}/state`,
      payload: invalid,
    });
    expect(rejected.statusCode).toBe(400);
    expect((await repository.getProject(project.id))?.tasks[0].groupId).toBe(next.groups[0].id);
  });
  it('rejects dependency cycles', async () => {
    const { app, project } = await setup();
    const result = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/dependencies`,
      payload: { predecessorId: ids.b, successorId: ids.a },
    });
    expect(result.statusCode).toBe(400);
  });
  it('rejects a state save that closes a dependency loop with a specific message and writes nothing', async () => {
    const { app, repository, project } = await setup();
    const before = await repository.getProject(project.id);
    const looped = {
      ...before!,
      dependencies: [
        ...before!.dependencies,
        { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', predecessorId: ids.b, successorId: ids.a },
      ],
    };
    const result = await app.inject({
      method: 'PUT',
      url: `/api/projects/${project.id}/state`,
      payload: looped,
    });
    expect(result.statusCode).toBe(400);
    expect(result.json().message).toBe('La dependencia crearía un ciclo.');
    expect((await repository.getProject(project.id))?.dependencies).toHaveLength(1);
  });
});

describe('identidad del servidor de prueba (D-P1)', () => {
  afterEach(() => {
    delete process.env.PDR2_RUN_TOKEN;
  });

  it('sin PDR2_RUN_TOKEN, /api/health responde exactamente {status:"ok"}', async () => {
    delete process.env.PDR2_RUN_TOKEN;
    const { app } = await setup();
    const respuesta = await app.inject({ method: 'GET', url: '/api/health' });
    expect(respuesta.json()).toEqual({ status: 'ok' });
  });

  it('con PDR2_RUN_TOKEN, /api/health refleja el token como runId', async () => {
    process.env.PDR2_RUN_TOKEN = 'token-de-prueba-123';
    const { app } = await setup();
    const respuesta = await app.inject({ method: 'GET', url: '/api/health' });
    expect(respuesta.json()).toEqual({ status: 'ok', runId: 'token-de-prueba-123' });
  });
});
