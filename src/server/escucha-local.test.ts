import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Criterio 1 (T008). Comprobación estática: ninguna configuración de desarrollo abre la red por defecto.
describe('configuración de escucha local', () => {
  it('vite.config.ts escucha en 127.0.0.1', () => {
    expect(readFileSync('vite.config.ts', 'utf8')).toContain("host: '127.0.0.1'");
    expect(readFileSync('vite.config.ts', 'utf8')).not.toContain('0.0.0.0');
  });
  it('el servidor usa 127.0.0.1 por defecto', () => {
    const index = readFileSync('src/server/index.ts', 'utf8');
    expect(index).toMatch(/process\.env\.HOST\s*\?\?\s*['"]127\.0\.0\.1['"]/);
    // Ningún punto del archivo puede abrir 0.0.0.0, y la única escucha usa la variable host.
    expect(index).not.toContain('0.0.0.0');
    expect(index.match(/\.listen\(/g)?.length).toBe(1);
    expect(index).toMatch(/listen\(\s*\{\s*port,\s*host\s*\}\s*\)/);
  });
  it('el script dev:web pasa --host 127.0.0.1', () => {
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
    expect(scripts['dev:web']).toBe('vite --host 127.0.0.1');
  });
});
