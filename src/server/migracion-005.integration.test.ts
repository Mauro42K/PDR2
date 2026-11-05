import { afterAll, describe, expect, it } from 'vitest';
import { Client, Pool } from 'pg';
import { runner } from 'node-pg-migrate';
import { verificarDestino } from '../shared/destino-pruebas.js';

const enabled = process.env.PDR2_INTEGRATION_TESTS === '1';

// CON-10: la migración 005 borra datos en su `down`. Esta prueba fija qué datos sobreviven a
// `up → down → up` en una base temporal propia, para que cualquier cambio en ese comportamiento
// falle aquí y no pase desapercibido.
describe.skipIf(!enabled)('migración 005 · up → down → up en base descartable (CON-10)', () => {
  const databaseName = `pdr2_migracion_005_${crypto.randomUUID().replaceAll('-', '')}`;
  let admin: Client | null = null;
  let pool: Pool | null = null;

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      await admin.end();
    }
  });

  it('documenta qué datos vuelven y cuáles no', async () => {
    // Guarda: la URL base debe ser la de pruebas validada. Solo cambia el nombre de la base.
    const veredicto = verificarDestino(process.env.DATABASE_URL ?? '');
    if (veredicto.tipo === 'rechazado') throw new Error(veredicto.mensaje);
    const base = new URL(veredicto.destino.url);
    const adminUrl = new URL(base.href); adminUrl.pathname = '/postgres';
    const dbUrl = new URL(base.href); dbUrl.pathname = `/${databaseName}`;

    admin = new Client({ connectionString: adminUrl.href });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const migrations = { databaseUrl: dbUrl.href, dir: 'migrations', migrationsTable: 'pgmigrations', verbose: false } as const;

    await runner({ ...migrations, direction: 'up' });
    pool = new Pool({ connectionString: dbUrl.href, max: 1 });
    const projectId = crypto.randomUUID();
    await pool.query('INSERT INTO projects(id, name, last_task_number) VALUES ($1, $2, 9)', [projectId, 'Migración 005']);
    // Números con huecos (1, 4, 9): lo que la app asigna cuando se borran tareas. Estado no trivial.
    const seed = [
      { name: 'Completada', position: 0, number: 1, status: 'completed', progress: 100, milestone: false, start: '2026-01-05', end: '2026-01-07' },
      { name: 'En curso', position: 1, number: 4, status: 'in_progress', progress: 40, milestone: false, start: '2026-01-08', end: '2026-01-12' },
      { name: 'Hito', position: 2, number: 9, status: 'blocked', progress: 0, milestone: true, start: '2026-01-15', end: '2026-01-15' }
    ];
    for (const row of seed) {
      await pool.query(
        'INSERT INTO tasks(id, project_id, name, start_date, end_date, position, number, status, progress, is_milestone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [crypto.randomUUID(), projectId, row.name, row.start, row.end, row.position, row.number, row.status, row.progress, row.milestone]
      );
    }
    const snapshot = async () => {
      const tasks = (await pool!.query('SELECT name, start_date::text AS start, end_date::text AS end, position, number, status, progress, is_milestone FROM tasks WHERE project_id = $1 ORDER BY position', [projectId])).rows;
      const project = (await pool!.query('SELECT last_task_number FROM projects WHERE id = $1', [projectId])).rows[0];
      return { tasks, last: project?.last_task_number as number | undefined };
    };
    const antes = await snapshot();
    expect(antes.tasks.map((t) => t.number)).toEqual([1, 4, 9]);
    expect(antes.last).toBe(9);

    await runner({ ...migrations, direction: 'down', count: 1 });
    const columnas = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks'")).rows.map((r) => r.column_name as string);
    expect(columnas).not.toEqual(expect.arrayContaining(['number', 'status', 'progress', 'is_milestone']));

    await runner({ ...migrations, direction: 'up' });
    const despues = await snapshot();

    // Sobrevive: nombre, fechas, posición y orden.
    expect(despues.tasks.map((t) => [t.name, t.start, t.end, t.position])).toEqual(antes.tasks.map((t) => [t.name, t.start, t.end, t.position]));
    // No vuelve: números estables. Se recalculan desde la posición, así que cambian (1, 4, 9 → 1, 2, 3).
    expect(despues.tasks.map((t) => t.number)).toEqual([1, 2, 3]);
    // No vuelve: estado, avance y marca de hito. Quedan en sus valores por defecto.
    expect(despues.tasks.map((t) => t.status)).toEqual(['pending', 'pending', 'pending']);
    expect(despues.tasks.map((t) => t.progress)).toEqual([0, 0, 0]);
    expect(despues.tasks.map((t) => t.is_milestone)).toEqual([false, false, false]);
    // No vuelve: el contador de números. Pasa de 9 a 3.
    expect(despues.last).toBe(3);
  });
});
