import { describe, expect, it } from 'vitest';
import { messages } from './i18n.js';

describe('CON-08 application translations', () => {
  it('provides the same catalog keys for both languages and localizes core actions', () => {
    const es = messages('es');
    const en = messages('en');
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    expect(es.renameProjectLabel).toBe('Renombrar proyecto');
    expect(en.renameProjectLabel).toBe('Rename project');
    expect(es.deletionConfirmationWord).toBe('BORRAR');
    expect(en.deletionConfirmationWord).toBe('DELETE');
    expect(es.addGroupAction).toBe('+ Grupo');
    expect(en.addGroupAction).toBe('+ Group');
    expect(es.themeSystem).toBe('Sistema');
    expect(en.themeSystem).toBe('System');
  });
});
