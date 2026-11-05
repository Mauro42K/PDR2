import { describe, expect, it } from 'vitest';
import { verificarDestino } from './destino-pruebas.js';

const CLAVE = 'clave-de-prueba-123';

describe('verificarDestino', () => {
  it.each(['pdr2', 'pdr2_qa'])('acepta exactamente 127.0.0.1:55432/pdr2_test con el usuario %s', (usuario) => {
    const permitida = `postgres://${usuario}:${CLAVE}@127.0.0.1:55432/pdr2_test`;
    const veredicto = verificarDestino(permitida);

    expect(veredicto.tipo).toBe('permitido');
    if (veredicto.tipo === 'permitido') {
      expect(veredicto.destino).toEqual({ url: permitida, host: '127.0.0.1', puerto: '55432', base: 'pdr2_test' });
    }
  });

  it.each([
    ['localhost en lugar de 127.0.0.1', `postgres://pdr2:${CLAVE}@localhost:55432/pdr2_test`],
    ['IPv6 de bucle local', `postgres://pdr2:${CLAVE}@[::1]:55432/pdr2_test`],
    ['otro puerto', `postgres://pdr2:${CLAVE}@127.0.0.1:5432/pdr2_test`],
    ['base de desarrollo', `postgres://pdr2:${CLAVE}@127.0.0.1:55432/pdr2_dev`],
    ['usuario QA contra desarrollo', `postgres://pdr2_qa:${CLAVE}@127.0.0.1:55432/pdr2_dev`],
    ['usuario QA contra host remoto', `postgres://pdr2_qa:${CLAVE}@192.0.2.1:55432/pdr2_test`],
    ['usuario QA contra otro puerto', `postgres://pdr2_qa:${CLAVE}@127.0.0.1:5432/pdr2_test`],
    ['usuario QA con parámetro', `postgres://pdr2_qa:${CLAVE}@127.0.0.1:55432/pdr2_test?dbname=pdr2_dev`],
    ['usuario QA con fragmento', `postgres://pdr2_qa:${CLAVE}@127.0.0.1:55432/pdr2_test#fragmento`],
    ['base con sufijo parecido', `postgres://pdr2:${CLAVE}@127.0.0.1:55432/otra_test`],
    ['host sobrescrito por parámetro', `postgres://pdr2:${CLAVE}@127.0.0.1:55432/pdr2_test?host=10.0.0.5`],
    ['usuario distinto', `postgres://otro:${CLAVE}@127.0.0.1:55432/pdr2_test`],
    ['cadena vacía', ''],
    ['texto que no es una URL', 'esto no es una url']
  ])('rechaza %s', (_descripcion, cadena) => {
    expect(verificarDestino(cadena).tipo).toBe('rechazado');
  });

  it('el mensaje explica el destino esperado y el encontrado, sin credenciales', () => {
    const veredicto = verificarDestino(`postgres://pdr2:${CLAVE}@127.0.0.1:55432/pdr2_dev`);

    expect(veredicto.tipo).toBe('rechazado');
    if (veredicto.tipo === 'rechazado') {
      expect(veredicto.mensaje).toContain('127.0.0.1:55432/pdr2_test');
      expect(veredicto.mensaje).toContain('127.0.0.1:55432/pdr2_dev');
      expect(veredicto.mensaje).not.toContain(CLAVE);
      expect(veredicto.mensaje).not.toContain('postgres://');
    }
  });
});
