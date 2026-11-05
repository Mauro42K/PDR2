import { describe, expect, it } from 'vitest';
import { verificarDestino } from './destino-pruebas.js';

const CLAVE = 'clave-de-prueba-123';
const PERMITIDA = `postgres://pdr2:${CLAVE}@127.0.0.1:55432/pdr2_test`;

describe('verificarDestino', () => {
  it('acepta exactamente 127.0.0.1:55432/pdr2_test con el usuario pdr2', () => {
    const veredicto = verificarDestino(PERMITIDA);

    expect(veredicto.tipo).toBe('permitido');
    if (veredicto.tipo === 'permitido') {
      expect(veredicto.destino).toEqual({ url: PERMITIDA, host: '127.0.0.1', puerto: '55432', base: 'pdr2_test' });
    }
  });

  it.each([
    ['localhost en lugar de 127.0.0.1', `postgres://pdr2:${CLAVE}@localhost:55432/pdr2_test`],
    ['IPv6 de bucle local', `postgres://pdr2:${CLAVE}@[::1]:55432/pdr2_test`],
    ['otro puerto', `postgres://pdr2:${CLAVE}@127.0.0.1:5432/pdr2_test`],
    ['base de desarrollo', `postgres://pdr2:${CLAVE}@127.0.0.1:55432/pdr2_dev`],
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
