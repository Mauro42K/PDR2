import { spawn } from 'node:child_process';
import { runner } from 'node-pg-migrate';
import { verificarDestino } from '../src/shared/destino-pruebas.js';

try { process.loadEnvFile('.env'); } catch { /* Environment variables may be supplied by the shell. */ }

// Sin respaldo a DATABASE_URL: solo la variable de pruebas define el destino, y se valida antes de cualquier conexión o migración.
const candidata = process.env.PDR2_TEST_DATABASE_URL ?? '';
if (!candidata) {
  console.error('Falta PDR2_TEST_DATABASE_URL. Las pruebas solo se ejecutan contra 127.0.0.1:55432/pdr2_test; no se usa DATABASE_URL como respaldo.');
  process.exit(1);
}

const veredicto = verificarDestino(candidata);
if (veredicto.tipo === 'rechazado') {
  console.error(veredicto.mensaje);
  process.exit(1);
}

const databaseUrl = veredicto.destino.url;
await runner({ databaseUrl, dir: 'migrations', direction: 'up', migrationsTable: 'pgmigrations', verbose: false });
const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: databaseUrl, PDR2_INTEGRATION_TESTS: '1' } });
child.on('exit', (code) => process.exit(code ?? 1));
