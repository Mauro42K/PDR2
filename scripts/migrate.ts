import { runner } from 'node-pg-migrate';
import { databaseUrl } from '../src/server/config.js';

try { process.loadEnvFile('.env'); } catch { /* Environment variables may be supplied by the shell. */ }
await runner({ databaseUrl: databaseUrl(), dir: 'migrations', direction: process.argv[2] === 'down' ? 'down' : 'up', migrationsTable: 'pgmigrations', verbose: true });
