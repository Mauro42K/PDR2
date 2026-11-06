// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// CON-14: la aplicación no debe pedir recursos a hosts ajenos al equipo. Revisa los literales http(s)
// de `src/` e `index.html`. Solo se permiten localhost y 127.0.0.1, y el espacio de nombres SVG,
// que es un identificador y no una petición.
const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const HOSTS_PERMITIDOS = new Set(['localhost', '127.0.0.1', 'www.w3.org']);
const LITERAL = /https?:\/\/[^\s'"`)<>]+/g;

function archivosFuente(directorio: string): string[] {
  return readdirSync(directorio).flatMap((nombre) => {
    const ruta = join(directorio, nombre);
    return statSync(ruta).isDirectory() ? archivosFuente(ruta) : [ruta];
  });
}

describe('peticiones externas (CON-14)', () => {
  it('no hay literales http(s) hacia hosts ajenos en src/ ni en index.html', () => {
    const archivos = [...archivosFuente(join(RAIZ, 'src')), join(RAIZ, 'index.html')];
    const hallazgos: string[] = [];
    for (const archivo of archivos) {
      readFileSync(archivo, 'utf8')
        .split('\n')
        .forEach((linea, indice) => {
          for (const literal of linea.match(LITERAL) ?? []) {
            // El host es lo que va entre `://` y el primer `/`, `:` o `$`. Así funciona con plantillas como `localhost:${port}`.
            const host = literal.replace(/^https?:\/\//, '').split(/[/:$]/)[0];
            if (!HOSTS_PERMITIDOS.has(host))
              hallazgos.push(`${relative(RAIZ, archivo)}:${indice + 1} → ${literal}`);
          }
        });
    }
    expect(hallazgos).toEqual([]);
  });
});
