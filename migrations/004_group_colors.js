export async function up(pgm) {
  pgm.addColumn('task_groups', { color: { type: 'text', notNull: false } });
  pgm.addConstraint('task_groups', 'task_groups_color_check', {
    check: "color IS NULL OR color IN ('blue', 'teal', 'green', 'amber', 'violet', 'rose')"
  });
}

export async function down(pgm) {
  pgm.dropConstraint('task_groups', 'task_groups_color_check');
  pgm.dropColumn('task_groups', 'color');
}
