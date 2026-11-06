import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// Criterios 2 y 4. Tres afirmaciones distintas, cada una con su propia evidencia:
//  - el listener recibe cero conexiones TCP (evidencia de red; sockets Unix no se registran, ver conexiones.mjs);
//  - el gancho de carga no registra ninguna llamada a `runner` del migrador ni a `spawn` (evidencia de invocación);
//  - un control positivo demuestra que el gancho sí detecta esas llamadas cuando ocurren.
const REGISTRO_GANCHOS = pathToFileURL(
  join(process.cwd(), 'scripts/probes/espia/registro.mjs'),
).href;

describe('npm test rechaza un destino incorrecto antes de conectar o migrar', () => {
  it('sale con error, nombra el destino y no conecta, migra ni lanza procesos hijos', async () => {
    const espia = await preparar();
    let conexiones = 0;
    const listener = createServer((socket) => {
      conexiones += 1;
      socket.destroy();
    });
    await new Promise<void>((resolver) => listener.listen(0, '127.0.0.1', resolver));
    const puerto = (listener.address() as AddressInfo).port;

    const candidata = `postgres://pdr2:clave-no-usada@127.0.0.1:${puerto}/pdr2_dev`;
    const resultado = await correr(
      'npm',
      ['test'],
      { PDR2_TEST_DATABASE_URL: candidata, DATABASE_URL: candidata },
      espia.entorno,
    );
    await new Promise<void>((resolver) => listener.close(() => resolver()));

    expect(resultado.codigo).not.toBe(0);
    expect(resultado.salida).toContain('127.0.0.1:55432/pdr2_test');
    expect(resultado.salida).toContain(`127.0.0.1:${puerto}/pdr2_dev`);
    expect(resultado.salida).not.toContain('clave-no-usada');
    expect(conexiones).toBe(0);
    expect(await espia.llamadas()).toEqual([]);
  }, 60_000);

  it('control: el gancho detecta una llamada real al migrador y a un proceso hijo', async () => {
    const espia = await preparar();
    const listener = createServer((socket) => socket.destroy());
    await new Promise<void>((resolver) => listener.listen(0, '127.0.0.1', resolver));
    const puerto = (listener.address() as AddressInfo).port;

    const codigo = `
      const { runner } = await import('node-pg-migrate');
      const { spawn } = await import('node:child_process');
      spawn(process.execPath, ['-e', '0']);
      await runner({ databaseUrl: 'postgres://pdr2:x@127.0.0.1:${puerto}/control', dir: 'migrations', direction: 'up', migrationsTable: 'pgmigrations', verbose: false }).catch(() => {});
    `;
    await correr(process.execPath, ['--input-type=module', '-e', codigo], {}, espia.entorno);
    await new Promise<void>((resolver) => listener.close(() => resolver()));

    expect(await espia.llamadas()).toEqual(expect.arrayContaining(['migrador', 'proceso-hijo']));
  }, 60_000);
});

async function preparar() {
  const directorio = await mkdtemp(join(tmpdir(), 'pdr2-espia-'));
  const archivo = join(directorio, 'llamadas.txt');
  return {
    entorno: { PDR2_ESPIA_LOG: archivo, NODE_OPTIONS: `--import ${REGISTRO_GANCHOS}` },
    llamadas: async () => {
      try {
        return (await readFile(archivo, 'utf8')).split('\n').filter(Boolean);
      } catch {
        return [];
      }
    },
  };
}

function correr(
  comando: string,
  argumentos: string[],
  entornoPrueba: Record<string, string>,
  entornoEspia: Record<string, string>,
): Promise<{ codigo: number | null; salida: string }> {
  return new Promise((resolver) => {
    const hijo = spawn(comando, argumentos, {
      env: { ...process.env, ...entornoPrueba, ...entornoEspia },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    hijo.stdout.on('data', (datos) => (salida += datos));
    hijo.stderr.on('data', (datos) => (salida += datos));
    hijo.on('exit', (codigo) => resolver({ codigo, salida }));
  });
}

// Control de la prueba de no conexión: una conexión TCP real, lanzada a través de npm y tsx, debe quedar registrada.
describe('control: el registro de conexiones ve una conexión TCP a través de npm y tsx', () => {
  it('registra conexion:<puerto> cuando el proceso abre un socket TCP', async () => {
    const espia = await preparar();
    const listener = createServer((socket) => socket.destroy());
    await new Promise<void>((resolver) => listener.listen(0, '127.0.0.1', resolver));
    const puerto = (listener.address() as AddressInfo).port;
    await correr(
      'npm',
      [
        'exec',
        '--',
        'tsx',
        '-e',
        `import('node:net').then(({ connect }) => connect(${puerto}, '127.0.0.1').on('error', () => {}))`,
      ],
      {},
      espia.entorno,
    );
    await new Promise<void>((resolver) => listener.close(() => resolver()));
    expect(await espia.llamadas()).toContain(`conexion:${puerto}`);
  }, 60_000);
});

// Control del espía de procesos (ESM): el import por defecto y el import con nombre deben quedar registrados.
describe('control: el espía ve spawn por import por defecto y por import con nombre', () => {
  it('registra proceso-hijo en ambas formas', async () => {
    const espia = await preparar();
    // Debe ser ESM: `tsx -e` se ejecuta como CJS y el espía no ve los imports CJS (límite documentado).
    await correr(
      'npm',
      ['exec', '--', 'tsx', 'scripts/probes/fixtures/espia-spawn.mts'],
      {},
      espia.entorno,
    );
    const llamadas = await espia.llamadas();
    expect(llamadas.filter((l) => l === 'proceso-hijo').length).toBeGreaterThanOrEqual(2);
  }, 60_000);
});
