// Registra los ganchos de carga. Se usa con: node --import <este archivo>
import { register } from 'node:module';

register('./ganchos.mjs', import.meta.url);
