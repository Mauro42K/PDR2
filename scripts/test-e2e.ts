import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { runner } from 'node-pg-migrate';
import { verificarDestino } from '../src/shared/destino-pruebas.js';
import { esperarIdentidad, puertoLibre } from './e2e-identidad.js';

try { process.loadEnvFile('.env'); } catch { /* Environment variables may be supplied by the shell. */ }

// Orden obligatorio: guarda de destino → puerto libre → migración → servidor → identidad → Playwright.
// Sin respaldo a DATABASE_URL, y sin override del puerto por entorno (CON-02).
const candidata = process.env.PDR2_TEST_DATABASE_URL ?? '';
if (!candidata) {
  console.error('Falta PDR2_TEST_DATABASE_URL. Las pruebas E2E solo se ejecutan contra 127.0.0.1:55432/pdr2_test; no se usa DATABASE_URL como respaldo.');
  process.exit(1);
}
const veredicto = verificarDestino(candidata);
if (veredicto.tipo === 'rechazado') {
  console.error(veredicto.mensaje);
  process.exit(1);
}
const databaseUrl = veredicto.destino.url;

const PUERTO = 3301;
if (!(await puertoLibre(PUERTO))) {
  console.error(`El puerto ${PUERTO} está ocupado. No se ejecutan pruebas E2E.`);
  process.exit(1);
}

await runner({ databaseUrl, dir: 'migrations', direction: 'up', migrationsTable: 'pgmigrations', verbose: false });

const token = randomUUID();
const url = `http://127.0.0.1:${PUERTO}`;
const env = { ...process.env, DATABASE_URL: databaseUrl, HOST: '127.0.0.1', PORT: String(PUERTO), PDR2_RUN_TOKEN: token };
const server = spawn(process.execPath, ['dist-server/server/index.js'], { stdio: 'inherit', env });
let test: ReturnType<typeof spawn> | undefined;
const detener = () => { test?.kill('SIGTERM'); server.kill('SIGTERM'); };
for (const senal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(senal, () => { detener(); process.exit(1); });
process.once('exit', detener);
try {
  await esperarIdentidad({ url, token, tiempoMs: 30_000, vivo: () => server.exitCode === null && server.signalCode === null });
  console.log(`Servidor de prueba identificado en ${url}.`);
  test = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...env, PLAYWRIGHT_BASE_URL: url } });
  const code = await new Promise<number>((resolve) => test!.on('exit', (value) => resolve(value ?? 1)));
  process.exitCode = code;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  detener();
}
