import { createServer } from 'node:net';

// CON-02. Comprobaciones que el runner E2E hace antes de ejecutar Playwright.

// True si el puerto se puede enlazar en bucle local ahora mismo.
export function puertoLibre(puerto: number): Promise<boolean> {
  return new Promise((resolver) => {
    const servidor = createServer();
    servidor.once('error', () => resolver(false));
    servidor.listen(puerto, '127.0.0.1', () => servidor.close(() => resolver(true)));
  });
}

// Espera a que el servidor lanzado por el runner responda /api/health con su runId exacto.
// Si el puerto responde con otro runId, aborta: el servidor que responde no es el de esta ejecución.
export async function esperarIdentidad(opciones: {
  url: string;
  token: string;
  tiempoMs: number;
  vivo: () => boolean;
}): Promise<void> {
  const limite = Date.now() + opciones.tiempoMs;
  while (Date.now() < limite) {
    if (!opciones.vivo()) throw new Error('El servidor de prueba terminó antes de identificarse.');
    try {
      const respuesta = await fetch(`${opciones.url}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (respuesta.ok) {
        const cuerpo = (await respuesta.json()) as { runId?: unknown };
        if (cuerpo.runId === opciones.token) return;
        throw new Error(
          'El puerto responde con un servidor que no es el de esta ejecución (runId no coincide). Se aborta sin ejecutar pruebas. Si el servidor es el de esta carpeta, dist-server puede estar desactualizado: ejecuta npm run build.',
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('no coincide')) throw error;
      // Todavía no escucha o responde algo no válido: se reintenta hasta el límite.
    }
    await new Promise((resolver) => setTimeout(resolver, 250));
  }
  throw new Error('El servidor de prueba no se identificó a tiempo.');
}
