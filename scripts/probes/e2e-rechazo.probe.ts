import { createServer, type AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { correr, preparar } from './apoyo.js';

// Criterio 3 y CON-01 en el runner E2E. Con destino incorrecto, `npm run test:e2e` sale antes de
// reservar el puerto, antes de migrar y antes de lanzar ningún proceso. El listener cuenta conexiones.
describe('npm run test:e2e rechaza un destino incorrecto antes de reservar puerto, migrar o lanzar procesos', () => {
  it('sale con error, nombra el destino y no hay conexiones, migración ni procesos hijos', async () => {
    const espia = await preparar();
    let conexiones = 0;
    const listener = createServer((socket) => { conexiones += 1; socket.destroy(); });
    await new Promise<void>((resolver) => listener.listen(0, '127.0.0.1', resolver));
    const puerto = (listener.address() as AddressInfo).port;

    const candidata = `postgres://pdr2:clave-no-usada@127.0.0.1:${puerto}/pdr2_dev`;
    const resultado = await correr('npm', ['run', 'test:e2e'], { PDR2_TEST_DATABASE_URL: candidata, DATABASE_URL: candidata }, espia.entorno);
    await new Promise<void>((resolver) => listener.close(() => resolver()));

    expect(resultado.codigo).not.toBe(0);
    expect(resultado.salida).toContain('127.0.0.1:55432/pdr2_test');
    expect(resultado.salida).toContain(`127.0.0.1:${puerto}/pdr2_dev`);
    expect(resultado.salida).not.toContain('clave-no-usada');
    expect(conexiones).toBe(0);
    expect(await espia.llamadas()).toEqual([]);
    expect(await espia.llamadas()).not.toEqual(expect.arrayContaining([expect.stringMatching(/^conexion:/)]));
  }, 60_000);
});
