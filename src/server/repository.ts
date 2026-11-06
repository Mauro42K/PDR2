import type { Pool, PoolClient } from 'pg';
import {
  progressForStatus,
  type Project,
  type ProjectSummary,
  type Task,
  type TaskGroup,
  type TaskStatus,
} from '../shared/model.js';

type ProjectRow = { id: string; name: string; updated_at: Date };
type TaskRow = {
  id: string;
  name: string;
  start_date: Date;
  end_date: Date;
  position: number;
  group_id: string | null;
  note: string;
  number: number;
  status: TaskStatus;
  progress: number;
  is_milestone: boolean;
};
type DepRow = { id: string; predecessor_id: string; successor_id: string };
type GroupRow = TaskGroup;
type TaskInput = Pick<
  Task,
  'id' | 'name' | 'startDate' | 'endDate' | 'status' | 'progress' | 'isMilestone'
>;

/** Local calendar date. pg reads DATE columns as local midnight, so local getters give back the stored day. */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface Repository {
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(name: string): Promise<Project>;
  renameProject(id: string, name: string): Promise<Project | null>;
  deleteProject(id: string): Promise<boolean>;
  createTask(projectId: string, input: TaskInput): Promise<Project | null>;
  updateTask(
    projectId: string,
    taskId: string,
    input: Pick<Task, 'name' | 'startDate' | 'endDate' | 'status' | 'progress' | 'isMilestone'>,
  ): Promise<Project | null>;
  deleteTask(projectId: string, taskId: string): Promise<Project | null>;
  addDependency(
    projectId: string,
    predecessorId: string,
    successorId: string,
  ): Promise<Project | null>;
  removeDependency(projectId: string, dependencyId: string): Promise<Project | null>;
  replaceProject(id: string, project: Project): Promise<Project | null>;
  createProjectFromFile(project: Project): Promise<Project>;
  saveProjectState(id: string, project: Project): Promise<Project | null>;
}

export class PostgresRepository implements Repository {
  constructor(private readonly pool: Pool) {}

  async listProjects() {
    const { rows } = await this.pool.query<ProjectRow>(
      'SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC',
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      updatedAt: row.updated_at.toISOString(),
    }));
  }
  async getProject(id: string) {
    const { rows: projects } = await this.pool.query<ProjectRow>(
      'SELECT id, name, updated_at FROM projects WHERE id = $1',
      [id],
    );
    if (!projects[0]) return null;
    const [{ rows: tasks }, { rows: deps }, { rows: groups }] = await Promise.all([
      this.pool.query<TaskRow>(
        'SELECT id, name, start_date, end_date, position, group_id, note, number, status, progress, is_milestone FROM tasks WHERE project_id = $1 ORDER BY position, created_at',
        [id],
      ),
      this.pool.query<DepRow>(
        'SELECT id, predecessor_id, successor_id FROM dependencies WHERE project_id = $1 ORDER BY created_at',
        [id],
      ),
      this.pool.query<GroupRow>(
        'SELECT id, name, position, note, color FROM task_groups WHERE project_id = $1 ORDER BY position, id',
        [id],
      ),
    ]);
    return {
      id,
      name: projects[0].name,
      updatedAt: projects[0].updated_at.toISOString(),
      groups,
      tasks: tasks.map(toTask),
      dependencies: deps.map((d) => ({
        id: d.id,
        predecessorId: d.predecessor_id,
        successorId: d.successor_id,
      })),
    };
  }
  async createProject(name: string) {
    const id = crypto.randomUUID();
    await this.pool.query('INSERT INTO projects(id, name) VALUES($1, $2)', [id, name.trim()]);
    return (await this.getProject(id))!;
  }
  async renameProject(id: string, name: string) {
    const result = await this.pool.query(
      'UPDATE projects SET name = $2, updated_at = now() WHERE id = $1',
      [id, name.trim()],
    );
    return result.rowCount ? this.getProject(id) : null;
  }
  async deleteProject(id: string) {
    const result = await this.pool.query('DELETE FROM projects WHERE id = $1', [id]);
    return !!result.rowCount;
  }
  async createTask(projectId: string, input: TaskInput) {
    return this.inTransaction(async (client) => {
      const number = await this.nextTaskNumber(client, projectId);
      const { rows } = await client.query<{ n: number }>(
        'SELECT COALESCE(MAX(position) + 1, 0)::int AS n FROM tasks WHERE project_id = $1',
        [projectId],
      );
      const status = input.status;
      await client.query(
        'INSERT INTO tasks(id, project_id, name, start_date, end_date, position, number, status, progress, is_milestone) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          input.id,
          projectId,
          input.name.trim(),
          input.startDate,
          input.endDate,
          rows[0].n,
          number,
          status,
          progressForStatus(status, input.progress),
          input.isMilestone,
        ],
      );
      await client.query('UPDATE projects SET updated_at = now() WHERE id = $1', [projectId]);
      return true;
    }).then((ok) => (ok ? this.getProject(projectId) : null));
  }
  async updateTask(
    projectId: string,
    taskId: string,
    input: Pick<Task, 'name' | 'startDate' | 'endDate' | 'status' | 'progress' | 'isMilestone'>,
  ) {
    const result = await this.pool.query(
      'UPDATE tasks SET name=$3, start_date=$4, end_date=$5, status=$6, progress=$7, is_milestone=$8, updated_at=now() WHERE project_id=$1 AND id=$2',
      [
        projectId,
        taskId,
        input.name.trim(),
        input.startDate,
        input.endDate,
        input.status,
        progressForStatus(input.status, input.progress),
        input.isMilestone,
      ],
    );
    if (!result.rowCount) return null;
    await this.touch(projectId);
    return this.getProject(projectId);
  }
  async deleteTask(projectId: string, taskId: string) {
    const result = await this.pool.query('DELETE FROM tasks WHERE project_id=$1 AND id=$2', [
      projectId,
      taskId,
    ]);
    if (!result.rowCount) return null;
    await this.touch(projectId);
    return this.getProject(projectId);
  }
  async addDependency(projectId: string, predecessorId: string, successorId: string) {
    const id = crypto.randomUUID();
    try {
      await this.pool.query(
        'INSERT INTO dependencies(id, project_id, predecessor_id, successor_id) VALUES($1,$2,$3,$4)',
        [id, projectId, predecessorId, successorId],
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23503') return null;
      throw error;
    }
    await this.touch(projectId);
    return this.getProject(projectId);
  }
  async removeDependency(projectId: string, dependencyId: string) {
    const result = await this.pool.query('DELETE FROM dependencies WHERE project_id=$1 AND id=$2', [
      projectId,
      dependencyId,
    ]);
    if (!result.rowCount) return null;
    await this.touch(projectId);
    return this.getProject(projectId);
  }
  async replaceProject(id: string, project: Project) {
    return this.writeProject(id, project, 'replace');
  }
  async createProjectFromFile(project: Project) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const created = await client.query<{ updated_at: Date }>(
        'INSERT INTO projects(id, name, last_task_number) VALUES($1,$2,$3) RETURNING updated_at',
        [project.id, project.name.trim(), maxNumber(project.tasks)],
      );
      await this.insertGroups(client, project.id, project.groups ?? []);
      await this.insertTasks(client, project.id, project.tasks);
      await this.insertDependencies(client, project.id, project.dependencies);
      await client.query('COMMIT');
      return normalizedProject(project, created.rows[0].updated_at, project.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async saveProjectState(id: string, project: Project) {
    return this.writeProject(id, project, 'state');
  }

  /**
   * Writes the whole project inside one transaction.
   * - 'state' (client save): tasks that already exist keep their stored number; a new task with a number
   *   that was used before (undo of a delete) keeps it if it is still free; otherwise it gets last + 1.
   * - 'replace' (import): the file's numbers are kept; the counter becomes max(previous, file maximum).
   * The counter never goes down, so a deleted number is not reused by a new task.
   */
  private async writeProject(id: string, project: Project, mode: 'state' | 'replace') {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const exists = await client.query<{ last_task_number: number }>(
        'SELECT last_task_number FROM projects WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (!exists.rowCount) {
        await client.query('ROLLBACK');
        return null;
      }
      const storedNumbers = new Map(
        (
          await client.query<{ id: string; number: number }>(
            'SELECT id, number FROM tasks WHERE project_id=$1',
            [id],
          )
        ).rows.map((row) => [row.id, row.number]),
      );
      let last = exists.rows[0].last_task_number;
      const used = new Set<number>();
      const numbered = project.tasks.map((task) => {
        const stored = storedNumbers.get(task.id);
        if (stored !== undefined) {
          used.add(stored);
          return { ...task, number: stored };
        }
        return { ...task, number: 0 };
      });
      for (const task of numbered) {
        if (task.number !== 0) continue;
        const requested = project.tasks.find((item) => item.id === task.id)!.number;
        const keepRequested = mode === 'replace' || (requested >= 1 && requested <= last);
        if (keepRequested && requested >= 1 && !used.has(requested)) {
          task.number = requested;
          used.add(requested);
        } else {
          last += 1;
          task.number = last;
          used.add(last);
        }
      }
      if (mode === 'replace') last = Math.max(last, maxNumber(numbered));
      await client.query('DELETE FROM dependencies WHERE project_id=$1', [id]);
      await client.query('DELETE FROM tasks WHERE project_id=$1', [id]);
      await client.query('DELETE FROM task_groups WHERE project_id=$1', [id]);
      const updated = await client.query<{ updated_at: Date }>(
        'UPDATE projects SET name=$2, last_task_number=$3, updated_at=now() WHERE id=$1 RETURNING updated_at',
        [id, project.name.trim(), last],
      );
      await this.insertGroups(client, id, project.groups ?? []);
      await this.insertTasks(client, id, numbered);
      await this.insertDependencies(client, id, project.dependencies);
      await client.query('COMMIT');
      return normalizedProject({ ...project, tasks: numbered }, updated.rows[0].updated_at, id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  private async nextTaskNumber(client: PoolClient, projectId: string) {
    const { rows } = await client.query<{ n: number }>(
      'UPDATE projects SET last_task_number = last_task_number + 1 WHERE id = $1 RETURNING last_task_number AS n',
      [projectId],
    );
    return rows[0].n;
  }
  private async insertGroups(client: PoolClient, projectId: string, groups: TaskGroup[]) {
    for (const group of groups)
      await client.query(
        'INSERT INTO task_groups(id,project_id,name,position,note,color) VALUES($1,$2,$3,$4,$5,$6)',
        [group.id, projectId, group.name, group.position, group.note ?? '', group.color ?? null],
      );
  }
  private async insertTasks(client: PoolClient, projectId: string, tasks: Task[]) {
    for (const task of tasks) {
      await client.query(
        'INSERT INTO tasks(id, project_id, name, start_date, end_date, position, group_id, note, number, status, progress, is_milestone) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [
          task.id,
          projectId,
          task.name.trim(),
          task.startDate,
          task.endDate,
          task.position,
          task.groupId ?? null,
          task.note ?? '',
          task.number,
          task.status,
          progressForStatus(task.status, task.progress),
          task.isMilestone,
        ],
      );
    }
  }
  private async insertDependencies(
    client: PoolClient,
    projectId: string,
    dependencies: Project['dependencies'],
  ) {
    for (const dep of dependencies)
      await client.query(
        'INSERT INTO dependencies(id, project_id, predecessor_id, successor_id) VALUES($1,$2,$3,$4)',
        [dep.id, projectId, dep.predecessorId, dep.successorId],
      );
  }
  private async inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  private async touch(projectId: string) {
    await this.pool.query('UPDATE projects SET updated_at=now() WHERE id=$1', [projectId]);
  }
}

function toTask(row: TaskRow & { group_id: string | null; note: string }): Task {
  return {
    id: row.id,
    name: row.name,
    startDate: iso(row.start_date),
    endDate: iso(row.end_date),
    position: row.position,
    groupId: row.group_id,
    note: row.note,
    number: row.number,
    status: row.status,
    progress: row.progress,
    isMilestone: row.is_milestone,
  };
}

function maxNumber(tasks: Pick<Task, 'number'>[]) {
  return tasks.reduce((max, task) => Math.max(max, task.number), 0);
}

function normalizedProject(project: Project, updatedAt: Date, id: string): Project {
  return {
    ...project,
    id,
    name: project.name.trim(),
    updatedAt: updatedAt.toISOString(),
    groups: (project.groups ?? []).map((group) => ({
      ...group,
      note: group.note ?? '',
      color: group.color ?? null,
    })),
    tasks: project.tasks.map((task) => ({
      ...task,
      name: task.name.trim(),
      groupId: task.groupId ?? null,
      note: task.note ?? '',
      progress: progressForStatus(task.status, task.progress),
    })),
  };
}
