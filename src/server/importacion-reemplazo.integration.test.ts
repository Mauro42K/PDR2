import { afterAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { PostgresRepository } from './repository.js';
import { buildApp } from './app.js';
import type { Project, ProjectFile } from '../shared/model.js';
import { verificarDestino } from '../shared/destino-pruebas.js';

const enabled = process.env.PDR2_INTEGRATION_TESTS === '1';
// Defensa en profundidad: no se abre ningún pool hacia un destino ajeno a pdr2_test.
if (enabled) {
  const veredicto = verificarDestino(process.env.DATABASE_URL ?? '');
  if (veredicto.tipo === 'rechazado') throw new Error(veredicto.mensaje);
}

const uuid = () => crypto.randomUUID();

// CON-11: un fallo a mitad de la importación no deja cambios en el destino.
// CON-12: reemplazar un proyecto con grupos conserva la pertenencia de las tareas.
describe.skipIf(!enabled)(
  'importación en reemplazo sobre PostgreSQL de pruebas (CON-11, CON-12)',
  () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
    const repository = new PostgresRepository(pool);
    const pools: Pool[] = [pool];
    const createdIds: string[] = [];
    const servers: Array<Awaited<ReturnType<typeof buildApp>>> = [];

    afterAll(async () => {
      for (const server of servers) await server.close();
      for (const id of createdIds) await repository.deleteProject(id);
      for (const p of pools) await p.end();
    });

    // Siembra un proyecto con dos tareas y una dependencia. Con `conGrupo`, la primera tarea pertenece a un grupo.
    async function sembrar(nombre: string, conGrupo: boolean): Promise<Project> {
      const grupo = uuid();
      const primera = uuid();
      const segunda = uuid();
      const creado = await repository.createProjectFromFile({
        id: uuid(),
        name: nombre,
        updatedAt: new Date().toISOString(),
        groups: conGrupo
          ? [{ id: grupo, name: 'Grupo', position: 0, note: '', color: 'blue' }]
          : [],
        tasks: [
          {
            id: primera,
            name: 'Primera',
            startDate: '2026-03-02',
            endDate: '2026-03-04',
            position: 0,
            groupId: conGrupo ? grupo : null,
            note: '',
            number: 1,
            status: 'completed',
            progress: 100,
            isMilestone: false,
          },
          {
            id: segunda,
            name: 'Segunda',
            startDate: '2026-03-05',
            endDate: '2026-03-06',
            position: 1,
            groupId: null,
            note: '',
            number: 2,
            status: 'in_progress',
            progress: 40,
            isMilestone: false,
          },
        ],
        dependencies: [{ id: uuid(), predecessorId: primera, successorId: segunda }],
      });
      createdIds.push(creado.id);
      return creado;
    }

    // Obtiene el archivo exportable de un proyecto, tal como lo descarga la aplicación.
    async function exportar(id: string): Promise<ProjectFile> {
      const servidor = await buildApp({ repository });
      servers.push(servidor);
      const respuesta = await servidor.app.inject({
        method: 'GET',
        url: `/api/projects/${id}/export`,
      });
      return respuesta.json() as ProjectFile;
    }

    it('reemplaza un proyecto con grupos y conserva la pertenencia de las tareas (CON-12)', async () => {
      const origen = await sembrar('Origen con grupo', true);
      const destino = await sembrar('Destino a reemplazar', false);
      const archivo = await exportar(origen.id);
      const servidor = await buildApp({ repository });
      servers.push(servidor);

      const respuesta = await servidor.app.inject({
        method: 'POST',
        url: '/api/projects/import',
        payload: { ...archivo, mode: 'replace', targetProjectId: destino.id },
      });
      expect(respuesta.statusCode).toBe(200);

      const resultado = (await repository.getProject(destino.id))!;
      expect(resultado.name).toBe('Origen con grupo');
      expect(resultado.groups).toHaveLength(1);
      const conGrupo = resultado.tasks.filter((task) => task.groupId !== null);
      expect(conGrupo).toHaveLength(1);
      expect(resultado.groups!.map((group) => group.id)).toContain(conGrupo[0].groupId);
    });

    it('si la importación falla a mitad, el destino queda intacto (CON-11)', async () => {
      const origen = await sembrar('Origen sin grupo', false);
      const destino = await sembrar('Destino que debe quedar intacto', false);
      const antes = (await repository.getProject(destino.id))!;
      const archivo = await exportar(origen.id);

      // Pool que falla justo al insertar las dependencias: después de borrar y volver a insertar tareas,
      // y dentro de la misma transacción. Si la transacción funciona, todo debe deshacerse.
      const fallido = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
      pools.push(fallido);
      const conectar = fallido.connect.bind(fallido) as () => Promise<PoolClient>;
      // `pool.query` de pg llama a `connect` con un callback: el sustituto debe aceptar ambas formas.
      fallido.connect = ((...args: unknown[]) => {
        const callback =
          typeof args[0] === 'function'
            ? (args[0] as (
                error: Error | undefined,
                client?: PoolClient,
                done?: () => void,
              ) => void)
            : undefined;
        const promesa = conectar().then((cliente) => {
          const consultar = cliente.query.bind(cliente);
          // Reenvía todos los argumentos, también el callback que usa `pool.query`.
          cliente.query = ((...args: unknown[]) => {
            const texto = args[0];
            if (typeof texto === 'string' && texto.startsWith('INSERT INTO dependencies'))
              return Promise.reject(new Error('fallo forzado al insertar dependencias'));
            return (consultar as (...a: unknown[]) => unknown)(...args);
          }) as typeof cliente.query;
          return cliente;
        });
        if (!callback) return promesa;
        promesa.then(
          (cliente) => callback(undefined, cliente, () => cliente.release()),
          (error) => callback(error),
        );
        return undefined;
      }) as typeof fallido.connect;

      const servidor = await buildApp({ repository: new PostgresRepository(fallido) });
      servers.push(servidor);
      const respuesta = await servidor.app.inject({
        method: 'POST',
        url: '/api/projects/import',
        payload: { ...archivo, mode: 'replace', targetProjectId: destino.id },
      });
      expect(respuesta.statusCode).toBe(500);

      const despues = (await repository.getProject(destino.id))!;
      expect(despues.name).toBe(antes.name);
      expect(
        despues.tasks.map((task) => [task.id, task.name, task.number, task.status, task.progress]),
      ).toEqual(
        antes.tasks.map((task) => [task.id, task.name, task.number, task.status, task.progress]),
      );
      expect(despues.dependencies).toEqual(antes.dependencies);
    });
  },
);
