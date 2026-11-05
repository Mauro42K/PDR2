// Fixture ESM del control del espía: lanza un proceso hijo por import por defecto y por import con nombre.
import cp from 'node:child_process';
import { spawn } from 'node:child_process';

cp.spawn(process.execPath, ['-e', '0']);
spawn(process.execPath, ['-e', '0']);
