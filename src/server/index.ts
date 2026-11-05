import { resolve } from 'node:path';
import { buildApp } from './app.js';

try { process.loadEnvFile('.env'); } catch { /* Environment variables may be supplied by the shell. */ }
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
const webRoot = resolve('dist');
const { app } = await buildApp({ webRoot, logger: true });
await app.listen({ port, host });
app.log.info(`PDR 2.0 disponible en http://localhost:${port}`);
