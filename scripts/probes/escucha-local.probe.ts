import { spawn } from 'node:child_process';
import { connect, createServer, type AddressInfo } from 'node:net';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { verificarDestino } from '../../src/shared/destino-pruebas.js';

// Criterio 1 (T007). Arranca el servidor con la configuración por defecto y comprueba qué escucha.
// El destino de base es el aprobado (pdr2_test), para que la consulta de /api/health nunca toque pdr2_dev.
process.loadEnvFile('.env');

describe('el servidor escucha solo en bucle local por defecto', () => {
  it('lsof muestra 127.0.0.1 y ninguna interfaz abierta', async () => {
    const puerto = await puertoLibre();
    const { PDR2_TEST_DATABASE_URL } = process.env;
    if (!PDR2_TEST_DATABASE_URL) throw new Error('Falta PDR2_TEST_DATABASE_URL en .env');
    const veredicto = verificarDestino(PDR2_TEST_DATABASE_URL);
    if (veredicto.tipo === 'rechazado') throw new Error(veredicto.mensaje);
    const entorno: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(puerto),
      DATABASE_URL: PDR2_TEST_DATABASE_URL,
    };
    delete entorno.HOST;
    const servidor = spawn('node_modules/.bin/tsx', ['src/server/index.ts'], {
      env: entorno,
      stdio: 'ignore',
    });
    try {
      await esperarSalud(puerto);
      const escucha = execFileSync('lsof', ['-nP', `-iTCP:${puerto}`, '-sTCP:LISTEN'], {
        encoding: 'utf8',
      });
      expect(escucha).toContain(`127.0.0.1:${puerto}`);
      expect(escucha).not.toContain(`*:${puerto}`);
      expect(escucha).not.toContain(`0.0.0.0:${puerto}`);
    } finally {
      servidor.kill('SIGTERM');
    }
  }, 60_000);
});

function puertoLibre(): Promise<number> {
  return new Promise((resolver) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const puerto = (s.address() as AddressInfo).port;
      s.close(() => resolver(puerto));
    });
  });
}

async function esperarSalud(puerto: number) {
  // Espera a que el puerto acepte conexiones TCP. No consulta /api/health: esa ruta depende de la base
  // y esta prueba no debe depender de la autenticación de pdr2_test.
  for (let intento = 0; intento < 60; intento++) {
    const abierto = await new Promise<boolean>((resolver) => {
      const socket = connect(puerto, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolver(true);
      });
      socket.once('error', () => resolver(false));
    });
    if (abierto) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('El servidor no abrió el puerto');
}
