export async function up(pgm) {
  pgm.createTable('projects', {
    id: { type: 'uuid', primaryKey: true },
    name: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createTable('tasks', {
    id: { type: 'uuid', primaryKey: true },
    project_id: { type: 'uuid', notNull: true, references: 'projects', onDelete: 'CASCADE' },
    name: { type: 'text', notNull: true },
    start_date: { type: 'date', notNull: true },
    end_date: { type: 'date', notNull: true },
    position: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('tasks', 'tasks_date_order', { check: 'end_date >= start_date' });
  pgm.createTable('dependencies', {
    id: { type: 'uuid', primaryKey: true },
    project_id: { type: 'uuid', notNull: true, references: 'projects', onDelete: 'CASCADE' },
    predecessor_id: { type: 'uuid', notNull: true, references: 'tasks', onDelete: 'CASCADE' },
    successor_id: { type: 'uuid', notNull: true, references: 'tasks', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('dependencies', 'dependencies_unique', { unique: ['predecessor_id', 'successor_id'] });
  pgm.addConstraint('dependencies', 'dependencies_no_self', { check: 'predecessor_id <> successor_id' });
  pgm.createIndex('tasks', ['project_id', 'position']);
  pgm.createIndex('dependencies', ['project_id']);
}

export async function down(pgm) {
  pgm.dropTable('dependencies');
  pgm.dropTable('tasks');
  pgm.dropTable('projects');
}
