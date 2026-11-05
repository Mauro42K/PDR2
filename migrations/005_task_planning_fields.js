/** F3-02: stable task number, status, progress and milestone flag (docs/fase-F3-seguimiento.md, sections 4.1 and 4.6). */
export async function up(pgm) {
  pgm.addColumn('projects', { last_task_number: { type: 'integer', notNull: true, default: 0 } });
  pgm.addColumns('tasks', {
    number: { type: 'integer', notNull: false },
    status: { type: 'text', notNull: true, default: 'pending' },
    progress: { type: 'integer', notNull: true, default: 0 },
    is_milestone: { type: 'boolean', notNull: true, default: false }
  });
  // Backfill: number follows the current position order, ties broken by creation time (deterministic).
  pgm.sql(`
    WITH numbered AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY position, created_at, id) AS n
      FROM tasks
    )
    UPDATE tasks SET number = numbered.n FROM numbered WHERE tasks.id = numbered.id
  `);
  pgm.sql(`
    UPDATE projects SET last_task_number = COALESCE((SELECT MAX(number) FROM tasks WHERE tasks.project_id = projects.id), 0)
  `);
  // No default on number: an older build that inserts tasks without it fails loudly instead of losing data (A2).
  pgm.alterColumn('tasks', 'number', { notNull: true });
  pgm.addConstraint('tasks', 'tasks_number_unique', { unique: ['project_id', 'number'] });
  pgm.addConstraint('tasks', 'tasks_number_positive', { check: 'number >= 1' });
  pgm.addConstraint('tasks', 'tasks_status_check', { check: "status IN ('pending', 'in_progress', 'blocked', 'completed')" });
  pgm.addConstraint('tasks', 'tasks_progress_check', { check: 'progress BETWEEN 0 AND 100' });
  pgm.addConstraint('tasks', 'tasks_milestone_dates', { check: 'NOT is_milestone OR start_date = end_date' });
}

export async function down(pgm) {
  pgm.dropConstraint('tasks', 'tasks_milestone_dates');
  pgm.dropConstraint('tasks', 'tasks_progress_check');
  pgm.dropConstraint('tasks', 'tasks_status_check');
  pgm.dropConstraint('tasks', 'tasks_number_positive');
  pgm.dropConstraint('tasks', 'tasks_number_unique');
  pgm.dropColumns('tasks', ['number', 'status', 'progress', 'is_milestone']);
  pgm.dropColumn('projects', 'last_task_number');
}
