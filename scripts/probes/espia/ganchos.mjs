// Ganchos de carga para las pruebas de proceso. Registran cada invocación de los módulos vigilados
// en el archivo indicado por PDR2_ESPIA_LOG y luego delegan en el módulo real sin cambiar su comportamiento.
// Límite declarado: solo se registra `spawn` de node:child_process. `exec`, `execFile` y `fork` no se
// registran, ni por default ni por nombre. Un código que los use no deja rastro `proceso-hijo`.
// Tampoco se registran spawnSync ni execSync, ni el especificador sin prefijo 'child_process' (solo 'node:child_process').
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
  // Solo reexporta default si el módulo real lo tiene. Se declara aquí, sin importar el módulo real:
  // importarlo dentro del gancho lo volvería a envolver y se formaría un bucle.
  const CON_DEFAULT = new Set(['node:child_process']);
  const tieneDefault = CON_DEFAULT.has(nombre);
  // Con default (child_process), el default también debe ver spawn: se exporta una copia con spawn envuelto.
  const reexportaDefault = tieneDefault
    ? `import realDefault from ${JSON.stringify(realUrl)};\nexport default { ...realDefault, spawn: (...args) => { anotar("proceso-hijo"); return realDefault.spawn(...args); } };\n`
    : '';
  const registro = 'import { appendFileSync } from "node:fs";\nconst anotar = (nombre) => appendFileSync(process.env.PDR2_ESPIA_LOG, nombre + "\\n");\n';
  const cuerpo = nombre === 'node-pg-migrate'
    ? `export const runner = (...args) => { anotar("migrador"); return real.runner(...args); };\n`
    : `export const spawn = (...args) => { anotar("proceso-hijo"); return real.spawn(...args); };\n`;
  const fuente = `${registro}import * as real from ${JSON.stringify(realUrl)};\nexport * from ${JSON.stringify(realUrl)};\n${reexportaDefault}${cuerpo}`;
  return { format: 'module', shortCircuit: true, source: fuente };
}
