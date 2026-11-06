import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  dependencyConflict,
  hasDependencyCycle,
  isISODate,
  TASK_STATUSES,
  validateProjectFile,
  validateProjectState,
  type Project,
  type ProjectFile,
  type TaskStatus,
} from '../shared/model.js';
import {
  apiErrorMessages,
  DomainValidationError,
  type ApiErrorCode,
} from '../shared/api-errors.js';
import { databaseUrl } from './config.js';
import { PostgresRepository, type Repository } from './repository.js';

type AppOptions = { repository?: Repository; webRoot?: string; logger?: boolean };
const invalid = (code: ApiErrorCode) => ({
  statusCode: 400,
  error: 'Bad Request',
  code,
  message: apiErrorMessages[code][0],
});
const notFound = () => ({
  statusCode: 404,
  error: 'Not Found',
  code: 'not_found',
  message: apiErrorMessages.not_found[0],
});
const validName = (value: unknown): value is string =>
  typeof value === 'string' && !!value.trim() && value.trim().length <= 160;
type PlanningFields = {
  status: unknown;
  progress: unknown;
  isMilestone: unknown;
  startDate: string;
  endDate: string;
};
/** Returns the message for the first invalid planning field, or null. */
function planningError(fields: PlanningFields): ApiErrorCode | null {
  if (!(TASK_STATUSES as readonly unknown[]).includes(fields.status)) return 'invalid_task_status';
  if (
    !Number.isInteger(fields.progress) ||
    (fields.progress as number) < 0 ||
    (fields.progress as number) > 100
  )
    return 'invalid_task_progress';
  if (typeof fields.isMilestone !== 'boolean') return 'missing_task_fields';
  if (fields.isMilestone && fields.startDate !== fields.endDate) return 'invalid_milestone_dates';
  return null;
}

export async function buildApp(
  options: AppOptions = {},
): Promise<{ app: FastifyInstance; close: () => Promise<void> }> {
  const pool = options.repository
    ? undefined
    : new Pool({ connectionString: databaseUrl(), max: 10 });
  const repo = options.repository ?? new PostgresRepository(pool!);
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 5 * 1024 * 1024 });

  app.get('/api/health', async (_request, reply) => {
    // Identidad del servidor de prueba (D-P1): solo con PDR2_RUN_TOKEN, que define el runner E2E.
    const runId = process.env.PDR2_RUN_TOKEN;
    const cuerpo = runId ? { status: 'ok', runId } : { status: 'ok' };
    if (!pool) return cuerpo;
    try {
      await pool.query('SELECT 1');
      return cuerpo;
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  app.get('/api/projects', async () => repo.listProjects());
  app.post<{ Body: { name?: unknown } }>('/api/projects', async (request, reply) => {
    if (!validName(request.body?.name))
      return reply.code(400).send(invalid('invalid_project_name'));
    return reply.code(201).send(await repo.createProject(request.body.name.trim()));
  });
  app.get<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const project = await repo.getProject(request.params.id);
    return project ? project : reply.code(404).send(notFound());
  });
  app.put<{ Params: { id: string }; Body: Project }>(
    '/api/projects/:id/state',
    async (request, reply) => {
      const p = request.body;
      let normalized: Project;
      try {
        if (
          !p ||
          p.id !== request.params.id ||
          !validName(p.name) ||
          !Array.isArray(p.tasks) ||
          !Array.isArray(p.dependencies)
        )
          throw new DomainValidationError('invalid_project_state');
        if (hasDependencyCycle(p.tasks, p.dependencies))
          throw new DomainValidationError('dependency_cycle');
        normalized = validateProjectState(p);
        if (normalized.tasks.some((task) => task.note && task.note.length > 10000))
          throw new DomainValidationError('notes_too_long');
      } catch (error) {
        return reply
          .code(400)
          .send(
            invalid(error instanceof DomainValidationError ? error.code : 'invalid_project_state'),
          );
      }
      return (
        (await repo.saveProjectState(request.params.id, normalized)) ??
        reply.code(404).send(notFound())
      );
    },
  );
  app.patch<{ Params: { id: string }; Body: { name?: unknown } }>(
    '/api/projects/:id',
    async (request, reply) => {
      if (!validName(request.body?.name))
        return reply.code(400).send(invalid('invalid_project_name'));
      const project = await repo.renameProject(request.params.id, request.body.name.trim());
      return project ? project : reply.code(404).send(notFound());
    },
  );
  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) =>
    (await repo.deleteProject(request.params.id))
      ? reply.code(204).send()
      : reply.code(404).send(notFound()),
  );
  app.post<{
    Params: { id: string };
    Body: {
      name?: unknown;
      startDate?: unknown;
      endDate?: unknown;
      status?: unknown;
      progress?: unknown;
      isMilestone?: unknown;
    };
  }>('/api/projects/:id/tasks', async (request, reply) => {
    const {
      name,
      startDate,
      endDate,
      status = 'pending',
      progress = 0,
      isMilestone = false,
    } = request.body ?? {};
    if (!validName(name) || !isISODate(startDate) || !isISODate(endDate) || endDate < startDate)
      return reply.code(400).send(invalid('invalid_task_dates'));
    const planning = planningError({ status, progress, isMilestone, startDate, endDate });
    if (planning) return reply.code(400).send(invalid(planning));
    if (!(await repo.getProject(request.params.id))) return reply.code(404).send(notFound());
    const project = await repo.createTask(request.params.id, {
      id: randomUUID(),
      name: name.trim(),
      startDate,
      endDate,
      status: status as TaskStatus,
      progress: progress as number,
      isMilestone: isMilestone as boolean,
    });
    return project ? reply.code(201).send(project) : reply.code(404).send(notFound());
  });
  app.patch<{
    Params: { id: string; taskId: string };
    Querystring: { acceptConflict?: string };
    Body: {
      name?: unknown;
      startDate?: unknown;
      endDate?: unknown;
      status?: unknown;
      progress?: unknown;
      isMilestone?: unknown;
    };
  }>('/api/projects/:id/tasks/:taskId', async (request, reply) => {
    const { name, startDate, endDate, status, progress, isMilestone } = request.body ?? {};
    if (!validName(name) || !isISODate(startDate) || !isISODate(endDate) || endDate < startDate)
      return reply.code(400).send(invalid('invalid_task_dates'));
    const existing = await repo.getProject(request.params.id);
    if (!existing) return reply.code(404).send(notFound());
    const current = existing.tasks.find((task) => task.id === request.params.taskId);
    if (!current) return reply.code(404).send(notFound());
    // Planning fields are optional: a missing field keeps the stored value (F3-H03).
    const planning = {
      status: status ?? current.status,
      progress: progress ?? current.progress,
      isMilestone: isMilestone ?? current.isMilestone,
    };
    const planningMessage = planningError({ ...planning, startDate, endDate });
    if (planningMessage) return reply.code(400).send(invalid(planningMessage));
    const conflicts = dependencyConflict(existing, request.params.taskId, startDate, endDate);
    if (conflicts.length && request.query.acceptConflict !== 'true')
      return reply.code(409).send({
        error: 'dependency_conflict',
        code: 'dependency_conflict',
        message: apiErrorMessages.dependency_conflict[0],
        dependencies: conflicts,
      });
    const project = await repo.updateTask(request.params.id, request.params.taskId, {
      name: name.trim(),
      startDate,
      endDate,
      status: planning.status as TaskStatus,
      progress: planning.progress as number,
      isMilestone: planning.isMilestone as boolean,
    });
    return project ?? reply.code(404).send(notFound());
  });
  app.delete<{ Params: { id: string; taskId: string } }>(
    '/api/projects/:id/tasks/:taskId',
    async (request, reply) =>
      (await repo.deleteTask(request.params.id, request.params.taskId)) ??
      reply.code(404).send(notFound()),
  );
  app.post<{ Params: { id: string }; Body: { predecessorId?: unknown; successorId?: unknown } }>(
    '/api/projects/:id/dependencies',
    async (request, reply) => {
      const { predecessorId, successorId } = request.body ?? {};
      if (
        typeof predecessorId !== 'string' ||
        typeof successorId !== 'string' ||
        predecessorId === successorId
      )
        return reply.code(400).send(invalid('invalid_dependency_selection'));
      const current = await repo.getProject(request.params.id);
      if (!current) return reply.code(404).send(notFound());
      if (
        !current.tasks.some((task) => task.id === predecessorId) ||
        !current.tasks.some((task) => task.id === successorId)
      )
        return reply.code(400).send(invalid('tasks_not_in_project'));
      if (
        current.dependencies.some(
          (dep) => dep.predecessorId === predecessorId && dep.successorId === successorId,
        )
      )
        return reply.code(409).send(invalid('duplicate_dependency'));
      if (wouldCycle(current, predecessorId, successorId))
        return reply.code(400).send(invalid('dependency_cycle'));
      const project = await repo.addDependency(request.params.id, predecessorId, successorId);
      return project
        ? reply.code(201).send(project)
        : reply.code(400).send(invalid('task_not_in_project'));
    },
  );
  app.delete<{ Params: { id: string; dependencyId: string } }>(
    '/api/projects/:id/dependencies/:dependencyId',
    async (request, reply) =>
      (await repo.removeDependency(request.params.id, request.params.dependencyId)) ??
      reply.code(404).send(notFound()),
  );
  app.get<{ Params: { id: string } }>('/api/projects/:id/export', async (request, reply) => {
    const project = await repo.getProject(request.params.id);
    if (!project) return reply.code(404).send(notFound());
    const file: ProjectFile = {
      format: 'pdr2-project',
      version: 3,
      exportedAt: new Date().toISOString(),
      project,
    };
    reply
      .header('content-type', 'application/json; charset=utf-8')
      .header(
        'content-disposition',
        `attachment; filename="${safeFilename(project.name)}.pdr2.json"`,
      );
    return file;
  });
  app.post<{
    Body: {
      mode?: unknown;
      locale?: unknown;
      targetProjectId?: unknown;
      format?: unknown;
      version?: unknown;
      exportedAt?: unknown;
      project?: unknown;
    };
  }>('/api/projects/import', async (request, reply) => {
    let file: ProjectFile;
    try {
      file = validateProjectFile(request.body);
    } catch (error) {
      return reply
        .code(400)
        .send(invalid(error instanceof DomainValidationError ? error.code : 'invalid_file'));
    }
    if (request.body.mode !== 'copy' && request.body.mode !== 'replace')
      return reply.code(400).send(invalid('invalid_import_mode'));
    if (request.body.mode === 'copy') {
      const taskIds = new Map(file.project.tasks.map((task) => [task.id, randomUUID()]));
      const groupIds = new Map(
        (file.project.groups ?? []).map((group) => [group.id, randomUUID()]),
      );
      const project: Project = {
        ...file.project,
        id: randomUUID(),
        name: `${file.project.name} (${request.body.locale === 'en' ? 'copy' : 'copia'})`,
        updatedAt: new Date().toISOString(),
        groups: (file.project.groups ?? []).map((group) => ({
          ...group,
          id: groupIds.get(group.id)!,
        })),
        tasks: file.project.tasks.map((task) => ({
          ...task,
          id: taskIds.get(task.id)!,
          groupId: task.groupId ? groupIds.get(task.groupId)! : null,
          position: task.position ?? 0,
        })),
        dependencies: file.project.dependencies.map((dep) => ({
          ...dep,
          id: randomUUID(),
          predecessorId: taskIds.get(dep.predecessorId)!,
          successorId: taskIds.get(dep.successorId)!,
        })),
      };
      return reply.code(201).send(await repo.createProjectFromFile(project));
    }
    const targetId =
      typeof request.body.targetProjectId === 'string' ? request.body.targetProjectId : '';
    if (!targetId) return reply.code(400).send(invalid('missing_import_target'));
    const existing = await repo.getProject(targetId);
    if (!existing) return reply.code(404).send(notFound());
    const taskIds = new Map(file.project.tasks.map((task) => [task.id, randomUUID()]));
    const groupIds = new Map((file.project.groups ?? []).map((group) => [group.id, randomUUID()]));
    const replacement: Project = {
      ...file.project,
      id: targetId,
      updatedAt: new Date().toISOString(),
      groups: (file.project.groups ?? []).map((group) => ({
        ...group,
        id: groupIds.get(group.id)!,
      })),
      tasks: file.project.tasks.map((task) => ({
        ...task,
        id: taskIds.get(task.id)!,
        groupId: task.groupId ? groupIds.get(task.groupId)! : null,
      })),
      dependencies: file.project.dependencies.map((dep) => ({
        ...dep,
        id: randomUUID(),
        predecessorId: taskIds.get(dep.predecessorId)!,
        successorId: taskIds.get(dep.successorId)!,
      })),
    };
    const updated = await repo.replaceProject(targetId, replacement);
    return updated ?? reply.code(404).send(notFound());
  });

  if (options.webRoot) {
    await app.register(fastifyStatic, { root: resolve(options.webRoot), prefix: '/' });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/'))
        return reply.sendFile('index.html');
      return reply.code(404).send(notFound());
    });
  }
  return {
    app,
    close: async () => {
      await app.close();
      await pool?.end();
    },
  };
}

function wouldCycle(project: Project, predecessorId: string, successorId: string) {
  const graph = new Map<string, string[]>();
  for (const dep of project.dependencies)
    graph.set(dep.predecessorId, [...(graph.get(dep.predecessorId) ?? []), dep.successorId]);
  const stack = [successorId];
  const seen = new Set<string>();
  while (stack.length) {
    const node = stack.pop()!;
    if (node === predecessorId) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(graph.get(node) ?? []));
  }
  return false;
}
const safeFilename = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'proyecto';
