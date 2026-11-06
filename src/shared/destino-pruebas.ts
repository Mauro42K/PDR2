// Guardia de destino de las pruebas. Función pura: no abre conexiones, no lee contraseñas.
// Solo acepta el destino exacto de la base de pruebas en bucle local (spec operacion-local-segura).

const HOST = '127.0.0.1';
const PUERTO = '55432';
const BASE = 'pdr2_test';
const USUARIOS = new Set(['pdr2', 'pdr2_qa']);
const ESPERADO = `${HOST}:${PUERTO}/${BASE}`;

export type DestinoPruebas = { url: string; host: string; puerto: string; base: string };

export type VeredictoDestino =
  | { tipo: 'permitido'; destino: DestinoPruebas }
  | { tipo: 'rechazado'; esperado: string; encontrado: string; mensaje: string };

export function verificarDestino(cadena: string): VeredictoDestino {
  if (!cadena) return rechazo('(vacía)');

  let url: URL;
  try {
    url = new URL(cadena);
  } catch {
    return rechazo('cadena no válida');
  }

  const encontrado = `${url.hostname}:${url.port || '5432'}/${url.pathname.replace(/^\//, '')}`;
  const protocoloValido = url.protocol === 'postgres:' || url.protocol === 'postgresql:';
  const destinoExacto = url.hostname === HOST && url.port === PUERTO && url.pathname === `/${BASE}`;
  const identidadExacta = USUARIOS.has(url.username) && url.search === '' && url.hash === '';

  if (!protocoloValido || !destinoExacto) return rechazo(encontrado);
  if (!identidadExacta)
    return rechazo(encontrado, 'se requiere pdr2 o pdr2_qa, sin parámetros ni fragmento');

  return { tipo: 'permitido', destino: { url: cadena, host: HOST, puerto: PUERTO, base: BASE } };
}

function rechazo(encontrado: string, motivo?: string): VeredictoDestino {
  const detalle = motivo ? ` ${motivo}.` : '';
  return {
    tipo: 'rechazado',
    esperado: ESPERADO,
    encontrado,
    mensaje:
      `Destino de pruebas rechazado. Esperado: ${ESPERADO}. Encontrado: ${encontrado}.${detalle} ` +
      'Las pruebas solo se ejecutan contra la base de pruebas en esta máquina.',
  };
}
