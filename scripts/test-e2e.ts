import { spawn } from 'node:child_process';
import { runner } from 'node-pg-migrate';

try { process.loadEnvFile('.env'); } catch { /* Environment variables may be supplied by the shell. */ }
const password = process.env.PDR2_POSTGRES_PASSWORD;
const databaseUrl = process.env.PDR2_TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? (password ? `postgres://pdr2:${encodeURIComponent(password)}@127.0.0.1:55432/pdr2_test` : '');
if (!databaseUrl) throw new Error('Falta PDR2_POSTGRES_PASSWORD para preparar la base pdr2_test.');
await runner({ databaseUrl, dir: 'migrations', direction: 'up', migrationsTable: 'pgmigrations', verbose: false });
const port = Number(process.env.PDR2_E2E_PORT ?? 3301);
const env = { ...process.env, DATABASE_URL: databaseUrl, HOST: '127.0.0.1', PORT: String(port), PDR2_INTEGRATION_TESTS: '1' };
const server = spawn(process.execPath, ['dist-server/server/index.js'], { stdio: 'inherit', env });
let test: ReturnType<typeof spawn> | undefined;
try {
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error('El servidor local terminó antes de estar listo.');
    try { if ((await fetch(`${url}/api/health`)).ok) break; } catch { /* Wait for Fastify to bind. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (attempt === 79) throw new Error('El servidor local no respondió a tiempo.');
  }
  test = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...env, PLAYWRIGHT_BASE_URL: url } });
  const code = await new Promise<number>((resolve) => test!.on('exit', (value) => resolve(value ?? 1)));
  process.exitCode = code;
} finally {
  test?.kill('SIGTERM');
  server.kill('SIGTERM');
}
