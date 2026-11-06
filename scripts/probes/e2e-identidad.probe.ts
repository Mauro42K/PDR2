import { createServer, type AddressInfo, type Server } from 'node:net';
import { createServer as crearHttp } from 'node:http';
import { describe, expect, it } from 'vitest';
import { esperarIdentidad, puertoLibre } from '../e2e-identidad.js';
import { correr, preparar } from './apoyo.js';

// CON-02. Dos afirmaciones: (1) un puerto ocupado detiene el E2E antes de migrar;
// (2) un servidor que responde sin el runId de esta ejecución se rechaza.
describe('identidad del servidor E2E (CON-02)', () => {
  it('puerto ocupado: el runner aborta antes de migrar, sin conectar a la base', async () => {
    const espia = await preparar();
    const ocupante: Server = createServer();
    await new Promise<void>((resolver, rechazar) => {
      ocupante.once('error', () =>
        rechazar(new Error('No se pudo reservar el puerto 3301 para la prueba: está en uso.')),
      );
      ocupante.listen(3301, '127.0.0.1', resolver);
    });
    const candidata = 'postgres://pdr2:clave-no-usada@127.0.0.1:55432/pdr2_test';
    const resultado = await correr(
      'npm',
      ['run', 'test:e2e'],
      { PDR2_TEST_DATABASE_URL: candidata },
      espia.entorno,
    );
    await new Promise<void>((resolver) => ocupante.close(() => resolver()));

    expect(resultado.codigo).not.toBe(0);
    expect(resultado.salida).toContain('3301');
    expect(resultado.salida).toContain('ocupado');
    expect(await espia.llamadas()).toEqual([]);
  }, 60_000);

  it('un servidor ajeno que responde sin el runId esperado se rechaza', async () => {
    const ajeno = crearHttp((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end('{"status":"ok"}');
    });
    await new Promise<void>((resolver) => ajeno.listen(0, '127.0.0.1', resolver));
    const puerto = (ajeno.address() as AddressInfo).port;
    await expect(
      esperarIdentidad({
        url: `http://127.0.0.1:${puerto}`,
        token: 'token-esperado',
        tiempoMs: 3000,
        vivo: () => true,
      }),
    ).rejects.toThrow('no coincide');
    await new Promise<void>((resolver) => ajeno.close(() => resolver()));
  }, 30_000);

  it('el servidor que responde con el runId de esta ejecución se acepta', async () => {
    const propio = crearHttp((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end('{"status":"ok","runId":"token-esperado"}');
    });
    await new Promise<void>((resolver) => propio.listen(0, '127.0.0.1', resolver));
    const puerto = (propio.address() as AddressInfo).port;
    await expect(
      esperarIdentidad({
        url: `http://127.0.0.1:${puerto}`,
        token: 'token-esperado',
        tiempoMs: 3000,
        vivo: () => true,
      }),
    ).resolves.toBeUndefined();
    await new Promise<void>((resolver) => propio.close(() => resolver()));
  }, 30_000);

  it('puertoLibre distingue un puerto ocupado de uno libre', async () => {
    const ocupante = createServer();
    await new Promise<void>((resolver) => ocupante.listen(0, '127.0.0.1', resolver));
    const ocupado = (ocupante.address() as AddressInfo).port;
    expect(await puertoLibre(ocupado)).toBe(false);
    await new Promise<void>((resolver) => ocupante.close(() => resolver()));
    expect(await puertoLibre(ocupado)).toBe(true);
  });
});
