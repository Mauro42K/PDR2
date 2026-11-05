// Copia de la base de trabajo fuera del repositorio (CON-09). Uso: npm run copia:base [nombre_de_base]
import { carpetaDeCopias, volcarBase } from '../src/server/copias.js';

const base = process.argv[2] ?? 'pdr2_dev';
const archivo = await volcarBase(base, carpetaDeCopias());
console.log(`Copia de ${base} guardada en: ${archivo}`);
