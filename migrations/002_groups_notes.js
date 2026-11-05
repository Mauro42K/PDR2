export async function up(pgm) {
  pgm.createTable('task_groups', {
    id: { type: 'uuid', primaryKey: true },
    project_id: { type: 'uuid', notNull: true, references: 'projects', onDelete: 'CASCADE' },
    name: { type: 'text', notNull: true },
    position: { type: 'integer', notNull: true, default: 0 }
  });
  pgm.addColumn('tasks', {
    group_id: { type: 'uuid', references: 'task_groups', onDelete: 'SET NULL' },
    note: { type: 'text', notNull: true, default: '' }
  });
  pgm.createIndex('task_groups', ['project_id', 'position']);
}
export async function down(pgm) {
  pgm.dropColumn('tasks', ['group_id', 'note']);
  pgm.dropTable('task_groups');
}
