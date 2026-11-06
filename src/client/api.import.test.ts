import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';
import type { ProjectFile } from '../shared/model.js';

afterEach(() => vi.unstubAllGlobals());
describe('localized copy import', () => {
  it('sends the selected language with the import request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    await api.importProject(
      { format: 'pdr2-project', version: 3, project: {} } as ProjectFile,
      'copy',
      undefined,
      'en',
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({ mode: 'copy', locale: 'en' });
  });
});
