import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, mkdirSync, rmSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';

// CON-09: copia y restauración de la base. Las copias con datos reales viven fuera del repositorio
// (principio 23 de la constitución). Todo pasa por el contenedor de la base con su cliente pg_dump/psql.
export const CONTENEDOR = process.env.PDR2_CONTENEDOR_BD ?? 'pdr2-db-1';
const USUARIO = 'pdr2';
const NOMBRE_BASE = /^[a-z0-9_]+$/;
const NOMBRE_ENSAYO = /^pdr2_ensayo_[a-f0-9]{32}$/;

/** Carpeta por defecto de las copias: fuera del repositorio, junto a él. */
export function carpetaDeCopias(raizRepositorio = process.cwd()) {
  return resolve(raizRepositorio, '..', 'PDR2-backups');
}

/** Rechaza cualquier carpeta dentro del repositorio: una copia con datos reales no debe quedar versionable. */
export function asegurarFueraDelRepositorio(carpeta: string, raizRepositorio = process.cwd()) {
  const relativa = relative(resolve(raizRepositorio), resolve(carpeta));
  if (!relativa.startsWith('..') && !isAbsolute(relativa))
    throw new Error(`La copia no puede guardarse dentro del repositorio: ${carpeta}`);
}

function ejecutar(
  args: string[],
  opciones: { entrada?: NodeJS.ReadableStream; salida?: NodeJS.WritableStream } = {},
) {
  return new Promise<void>((resolveFn, reject) => {
    const hijo = spawn('docker', args, {
      stdio: [opciones.entrada ? 'pipe' : 'ignore', opciones.salida ? 'pipe' : 'ignore', 'pipe'],
    });
    let error = '';
    hijo.stderr?.on('data', (dato) => {
      error += String(dato);
    });
    if (opciones.entrada && hijo.stdin) opciones.entrada.pipe(hijo.stdin);
    if (opciones.salida && hijo.stdout) hijo.stdout.pipe(opciones.salida);
    hijo.on('error', reject);
    hijo.on('close', (codigo) =>
      codigo === 0
        ? resolveFn()
        : reject(new Error(error.trim() || `docker terminó con código ${codigo}`)),
    );
  });
}

async function consulta(base: string, sql: string) {
  const chunks: string[] = [];
  await new Promise<void>((resolveFn, reject) => {
    const hijo = spawn(
      'docker',
      [
        'exec',
        CONTENEDOR,
        'psql',
        '-U',
        USUARIO,
        '-d',
        base,
        '-X',
        '-At',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        sql,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let error = '';
    hijo.stdout.on('data', (dato) => chunks.push(String(dato)));
    hijo.stderr.on('data', (dato) => {
      error += String(dato);
    });
    hijo.on('close', (codigo) =>
      codigo === 0
        ? resolveFn()
        : reject(new Error(error.trim() || `psql terminó con código ${codigo}`)),
    );
  });
  return chunks.join('').trim();
}

/** Vuelca una base a un archivo SQL en `carpeta`. Devuelve la ruta del archivo. */
export async function volcarBase(base: string, carpeta: string, raizRepositorio = process.cwd()) {
  if (!NOMBRE_BASE.test(base)) throw new Error(`Nombre de base no válido: ${base}`);
  asegurarFueraDelRepositorio(carpeta, raizRepositorio);
  mkdirSync(carpeta, { recursive: true });
  const marca = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archivo = join(carpeta, `${base}-${marca}.sql`);
  const salida = createWriteStream(archivo, { mode: 0o600 });
  try {
    await ejecutar(
      ['exec', CONTENEDOR, 'pg_dump', '-U', USUARIO, '--no-owner', '--no-privileges', '-d', base],
      { salida },
    );
  } catch (error) {
    rmSync(archivo, { force: true });
    throw error;
  }
  return archivo;
}

/** Crea una base temporal con nombre de ensayo y carga la copia en ella. Solo acepta nombres de ensayo. */
export async function restaurarEnBaseDeEnsayo(archivo: string, base: string) {
  if (!NOMBRE_ENSAYO.test(base)) throw new Error(`Solo se restaura en bases de ensayo: ${base}`);
  await ejecutar([
    'exec',
    CONTENEDOR,
    'psql',
    '-U',
    USUARIO,
    '-d',
    'postgres',
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `CREATE DATABASE ${base}`,
  ]);
  await ejecutar(
    [
      'exec',
      '-i',
      CONTENEDOR,
      'psql',
      '-U',
      USUARIO,
      '-d',
      base,
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { entrada: createReadStream(archivo) },
  );
}

export async function crearBaseDeEnsayo(base: string) {
  if (!NOMBRE_ENSAYO.test(base)) throw new Error(`Nombre de ensayo no válido: ${base}`);
  await ejecutar([
    'exec',
    CONTENEDOR,
    'psql',
    '-U',
    USUARIO,
    '-d',
    'postgres',
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `CREATE DATABASE ${base}`,
  ]);
}

export async function eliminarBaseDeEnsayo(base: string) {
  if (!NOMBRE_ENSAYO.test(base)) throw new Error(`Nombre de ensayo no válido: ${base}`);
  await ejecutar([
    'exec',
    CONTENEDOR,
    'psql',
    '-U',
    USUARIO,
    '-d',
    'postgres',
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `DROP DATABASE IF EXISTS ${base} WITH (FORCE)`,
  ]);
}

/** Huella de una base: por cada tabla pública, número de filas y hash de su contenido. */
export async function huellaDeBase(base: string) {
  const tablas = (
    await consulta(
      base,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    )
  )
    .split('\n')
    .filter(Boolean);
  const huella: Record<string, string> = {};
  for (const tabla of tablas) {
    huella[tabla] = await consulta(
      base,
      `SELECT count(*) || ' ' || md5(coalesce(string_agg(t::text, E'\\n' ORDER BY t::text), '')) FROM "${tabla}" t`,
    );
  }
  return huella;
}
