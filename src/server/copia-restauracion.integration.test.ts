import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runner } from 'node-pg-migrate';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verificarDestino } from '../shared/destino-pruebas.js';
import { crearBaseDeEnsayo, eliminarBaseDeEnsayo, huellaDeBase, restaurarEnBaseDeEnsayo, volcarBase } from './copias.js';

const enabled = process.env.PDR2_INTEGRATION_TESTS === '1';
const hex = () => crypto.randomUUID().replaceAll('-', '');

// CON-09: una copia restaurada debe ser idéntica a la base de origen, fila a fila.
// Trabaja solo con bases temporales de ensayo; nunca toca pdr2_dev ni pdr2_test.
describe.skipIf(!enabled)('copia y restauración de la base (CON-09)', () => {
  const origen = `pdr2_ensayo_${hex()}`;
  const destino = `pdr2_ensayo_${hex()}`;
  const carpeta = mkdtempSync(join(tmpdir(), 'pdr2-copia-'));
  let pool: Pool | null = null;

  afterAll(async () => {
    await pool?.end();
    await eliminarBaseDeEnsayo(destino).catch(() => undefined);
    await eliminarBaseDeEnsayo(origen).catch(() => undefined);
    rmSync(carpeta, { recursive: true, force: true });
  });

  it('copia una base con datos y la restaura sin perder ninguna fila', async () => {
    const veredicto = verificarDestino(process.env.DATABASE_URL ?? '');
    if (veredicto.tipo === 'rechazado') throw new Error(veredicto.mensaje);
    const enBase = (nombre: string) => { const url = new URL(veredicto.destino.url); url.pathname = `/${nombre}`; return url.href; };

    await crearBaseDeEnsayo(origen);
    await runner({ databaseUrl: enBase(origen), dir: 'migrations', direction: 'up', migrationsTable: 'pgmigrations', verbose: false });
    pool = new Pool({ connectionString: enBase(origen), max: 1 });
    const proyecto = crypto.randomUUID(); const grupo = crypto.randomUUID(); const primera = crypto.randomUUID(); const segunda = crypto.randomUUID();
    await pool.query('INSERT INTO projects(id, name, last_task_number) VALUES ($1, $2, 2)', [proyecto, 'Copia de ensayo']);
    await pool.query('INSERT INTO task_groups(id, project_id, name, position, note, color) VALUES ($1, $2, $3, 0, $4, $5)', [grupo, proyecto, 'Grupo', 'nota de grupo', 'blue']);
    await pool.query(
      'INSERT INTO tasks(id, project_id, name, start_date, end_date, position, group_id, note, number, status, progress, is_milestone) VALUES ($1,$2,$3,$4,$5,0,$6,$7,1,$8,$9,false), ($10,$2,$11,$12,$13,1,NULL,$14,2,$15,$16,false)',
      [primera, proyecto, 'Primera', '2026-03-02', '2026-03-04', grupo, 'nota', 'completed', 100, segunda, 'Segunda', '2026-03-05', '2026-03-06', '', 'in_progress', 40]
    );
    await pool.query('INSERT INTO dependencies(id, project_id, predecessor_id, successor_id) VALUES ($1, $2, $3, $4)', [crypto.randomUUID(), proyecto, primera, segunda]);

    const archivo = await volcarBase(origen, carpeta);
    await restaurarEnBaseDeEnsayo(archivo, destino);

    const antes = await huellaDeBase(origen);
    const despues = await huellaDeBase(destino);
    expect(despues).toEqual(antes);
    expect(antes.tasks.startsWith('2 ')).toBe(true);
    expect(antes.projects.startsWith('1 ')).toBe(true);
    expect(antes.dependencies.startsWith('1 ')).toBe(true);
    expect(antes.task_groups.startsWith('1 ')).toBe(true);
  });

  it('no guarda una copia dentro del repositorio', async () => {
    await expect(volcarBase(origen, join(process.cwd(), 'copia-no-permitida'))).rejects.toThrow(/dentro del repositorio/);
  });

  it('no restaura en una base que no sea de ensayo', async () => {
    await expect(restaurarEnBaseDeEnsayo(join(carpeta, 'inexistente.sql'), 'pdr2_dev')).rejects.toThrow(/Solo se restaura en bases de ensayo/);
  });
});
