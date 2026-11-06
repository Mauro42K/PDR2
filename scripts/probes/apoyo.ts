import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Gancho de carga: registra invocaciones del migrador (runner) y de procesos hijos (spawn).
export const REGISTRO_GANCHOS = pathToFileURL(
  join(process.cwd(), 'scripts/probes/espia/registro.mjs'),
).href;

export async function preparar() {
  const directorio = await mkdtemp(join(tmpdir(), 'pdr2-espia-'));
  const archivo = join(directorio, 'llamadas.txt');
  return {
    entorno: {
      PDR2_ESPIA_LOG: archivo,
      NODE_OPTIONS: `--import ${REGISTRO_GANCHOS}`,
      NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    },
    llamadas: async () => {
      try {
        return (await readFile(archivo, 'utf8')).split('\n').filter(Boolean);
      } catch {
        return [];
      }
    },
  };
}

export function correr(
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
