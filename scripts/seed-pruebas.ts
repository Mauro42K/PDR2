// Siembra proyectos sintéticos en la base de pruebas. Solo acepta el destino validado (127.0.0.1:55432/pdr2_test).
// Idempotente: un proyecto cuyo nombre ya existe no se vuelve a crear.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresRepository } from '../src/server/repository.js';
import { verificarDestino } from '../src/shared/destino-pruebas.js';
import type { GroupColor, Project, Task, TaskStatus } from '../src/shared/model.js';

try {
  process.loadEnvFile('.env');
} catch {
  /* Environment variables may be supplied by the shell. */
}

const veredicto = verificarDestino(process.env.PDR2_TEST_DATABASE_URL ?? '');
if (veredicto.tipo === 'rechazado') {
  console.error(veredicto.mensaje);
  process.exit(1);
}

const pool = new Pool({ connectionString: veredicto.destino.url, max: 1 });
const repository = new PostgresRepository(pool);

type Entrada = {
  nombre: string;
  tareas: Array<Omit<Task, 'id' | 'number' | 'position' | 'groupId'> & { grupo?: string }>;
  grupos?: Array<{ clave: string; nombre: string; color: GroupColor; nota?: string }>;
  dependencias?: Array<[number, number]>;
};

function fecha(base: string, dias: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const estados: TaskStatus[] = ['pending', 'in_progress', 'blocked', 'completed'];

const cronograma: Entrada = {
  nombre: 'Sintético · Cronograma con grupos',
  grupos: [
    {
      clave: 'diseno',
      nombre: 'Diseño',
      color: 'blue',
      nota: 'Contexto del grupo de diseño\nSegunda línea',
    },
    { clave: 'obra', nombre: 'Construcción', color: 'teal' },
    { clave: 'cierre', nombre: 'Cierre', color: 'violet', nota: 'Entrega y aceptación' },
  ],
  tareas: [
    {
      name: 'Levantamiento',
      startDate: '2026-11-02',
      endDate: '2026-11-03',
      status: 'completed',
      progress: 100,
      isMilestone: false,
      note: 'Medidas tomadas\nPlano revisado',
      grupo: 'diseno',
    },
    {
      name: 'Propuesta',
      startDate: '2026-11-04',
      endDate: '2026-11-06',
      status: 'in_progress',
      progress: 40,
      isMilestone: false,
      grupo: 'diseno',
    },
    {
      name: 'Aprobación de diseño',
      startDate: '2026-11-09',
      endDate: '2026-11-09',
      status: 'pending',
      progress: 0,
      isMilestone: true,
      grupo: 'diseno',
    },
    {
      name: 'Cimientos',
      startDate: '2026-11-10',
      endDate: '2026-11-16',
      status: 'pending',
      progress: 0,
      isMilestone: false,
      grupo: 'obra',
    },
    {
      name: 'Estructura',
      startDate: '2026-11-17',
      endDate: '2026-11-27',
      status: 'blocked',
      progress: 10,
      isMilestone: false,
      note: 'Esperando permiso',
      grupo: 'obra',
    },
    {
      name: 'Acabados',
      startDate: '2026-11-28',
      endDate: '2026-12-05',
      status: 'pending',
      progress: 0,
      isMilestone: false,
      grupo: 'obra',
    },
    {
      name: 'Revisión final',
      startDate: '2026-12-07',
      endDate: '2026-12-08',
      status: 'pending',
      progress: 0,
      isMilestone: false,
      grupo: 'cierre',
    },
    {
      name: 'Entrega',
      startDate: '2026-12-09',
      endDate: '2026-12-09',
      status: 'pending',
      progress: 0,
      isMilestone: true,
      grupo: 'cierre',
    },
    {
      name: 'Tarea suelta',
      startDate: '2026-11-05',
      endDate: '2026-11-05',
      status: 'pending',
      progress: 0,
      isMilestone: false,
    },
  ],
  dependencias: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
  ],
};

const dependencias: Entrada = {
  nombre: 'Sintético · Cadena de dependencias',
  tareas: Array.from({ length: 6 }, (_, i) => ({
    name: `Paso ${i + 1}`,
    startDate: fecha('2026-11-02', i * 3),
    endDate: fecha('2026-11-02', i * 3 + 2),
    status: estados[i % estados.length],
    progress: i % 4 === 3 ? 100 : 0,
    isMilestone: false,
  })),
  dependencias: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
  ],
};

const volumen: Entrada = {
  nombre: 'Sintético · Volumen 100 tareas',
  tareas: Array.from({ length: 100 }, (_, i) => ({
    name: `Tarea ${String(i + 1).padStart(3, '0')}`,
    startDate: fecha('2026-11-02', i),
    endDate: fecha('2026-11-02', i + 1),
    status: estados[i % estados.length],
    progress: 0,
    isMilestone: false,
  })),
  dependencias: [],
};

function construir(entrada: Entrada): Project {
  const grupos = (entrada.grupos ?? []).map((g, position) => ({
    id: randomUUID(),
    name: g.nombre,
    position,
    note: g.nota ?? '',
    color: g.color,
    _clave: g.clave,
  }));
  const porClave = new Map(grupos.map((g) => [g._clave, g.id]));
  const tareas: Task[] = entrada.tareas.map((t, position) => {
    const { grupo, ...resto } = t;
    return {
      ...resto,
      id: randomUUID(),
      position,
      number: position + 1,
      note: t.note ?? '',
      groupId: grupo ? (porClave.get(grupo) ?? null) : null,
    };
  });
  const dependencies = (entrada.dependencias ?? []).map(([p, s]) => ({
    id: randomUUID(),
    predecessorId: tareas[p].id,
    successorId: tareas[s].id,
  }));
  return {
    id: randomUUID(),
    name: entrada.nombre,
    tasks: tareas,
    dependencies,
    groups: grupos.map(({ _clave, ...g }) => g),
    updatedAt: new Date().toISOString(),
  };
}

// Nota: la comprobación por nombre no es atómica. Está pensada para ejecuciones locales y secuenciales.
const creados: string[] = [];
const omitidos: string[] = [];
try {
  const existentes = new Set((await repository.listProjects()).map((p) => p.name));
  for (const entrada of [cronograma, dependencias, volumen]) {
    if (existentes.has(entrada.nombre)) {
      omitidos.push(entrada.nombre);
      continue;
    }
    await repository.createProjectFromFile(construir(entrada));
    creados.push(entrada.nombre);
  }
} finally {
  await pool.end();
}
console.log(
  `Sembrado en ${veredicto.destino.base}: creados ${creados.length}, ya existían ${omitidos.length}.`,
);
for (const nombre of creados) console.log(`  + ${nombre}`);
for (const nombre of omitidos) console.log(`  = ${nombre}`);
