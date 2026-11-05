// Registra cada conexión TCP que abre el proceso (CJS, ESM, pg, npm y tsx). Ignora los canales IPC locales
// (sockets por ruta, sin puerto), que tsx usa internamente y no son conexiones a una base.
import { appendFileSync } from 'node:fs';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';

function anotarSiTcp(args) {
  const log = process.env.PDR2_ESPIA_LOG;
  const primero = args[0];
  // Solo conexiones TCP. Los sockets Unix (ruta, sin puerto) no se registran: el destino de la guardia es siempre TCP.
  const puerto = typeof primero === 'number' ? primero
    : typeof primero === 'string' && /^\d+$/.test(primero) ? Number(primero)
    : typeof primero === 'object' && primero !== null && typeof primero.port !== 'undefined' ? primero.port
    : undefined;
  if (log && puerto !== undefined) appendFileSync(log, `conexion:${puerto}\n`);
}

// Tres puntos de entrada: el método de Socket (lo usa pg), y las dos funciones de alto nivel de net.
const conectarSocket = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) { anotarSiTcp(args); return conectarSocket.apply(this, args); };
for (const nombre of ['connect', 'createConnection']) {
  const original = net[nombre];
  net[nombre] = function (...args) { anotarSiTcp(args); return original.apply(this, args); };
}
// Las importaciones ESM de módulos builtin son copias: hay que sincronizarlas con las funciones parcheadas.
syncBuiltinESMExports();
