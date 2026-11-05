// Ganchos de carga para las pruebas de proceso. Registran cada invocación de los módulos vigilados
// en el archivo indicado por PDR2_ESPIA_LOG y luego delegan en el módulo real sin cambiar su comportamiento.
const VIGILADOS = new Set(['node-pg-migrate', 'node:child_process']);
const reales = new Map();

export async function resolve(specifier, context, nextResolve) {
  // El envoltorio importa el módulo real: esa importación no debe volver a pasar por el gancho (sería un bucle).
  if (context.parentURL?.startsWith('espia:')) return nextResolve(specifier, context);
  if (!VIGILADOS.has(specifier) || !process.env.PDR2_ESPIA_LOG) return nextResolve(specifier, context);
  const real = await nextResolve(specifier, context);
  const id = `espia:${specifier}`;
  reales.set(id, real.url);
  return { url: id, shortCircuit: true, format: 'module' };
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith('espia:')) return nextLoad(url, context);
  const nombre = url.slice('espia:'.length);
  const realUrl = reales.get(url);
  const registro = 'import { appendFileSync } from "node:fs";\nconst anotar = (nombre) => appendFileSync(process.env.PDR2_ESPIA_LOG, nombre + "\\n");\n';
  const fuente = nombre === 'node-pg-migrate'
    ? `${registro}import * as real from ${JSON.stringify(realUrl)};\nexport * from ${JSON.stringify(realUrl)};\nexport const runner = (...args) => { anotar("migrador"); return real.runner(...args); };\n`
    : `${registro}import * as real from ${JSON.stringify(realUrl)};\nexport * from ${JSON.stringify(realUrl)};\nexport const spawn = (...args) => { anotar("proceso-hijo"); return real.spawn(...args); };\n`;
  return { format: 'module', shortCircuit: true, source: fuente };
}
