// Registra los ganchos. Se usa con: node --import <este archivo>
import { register } from 'node:module';

import './conexiones.mjs';
register('./ganchos.mjs', import.meta.url);
