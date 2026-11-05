export async function up(pgm) {
  pgm.addColumn('task_groups', { note: { type: 'text', notNull: true, default: '' } });
}
export async function down(pgm) {
  pgm.dropColumn('task_groups', 'note');
}
