import { expect, test } from '@playwright/test';

test('imports a version 1 JSON file as a copy with groups, notes and colors normalized to empty defaults', async ({ page }) => {
  const name = `Legacy v1 QA ${crypto.randomUUID()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id } = await created.json() as { id: string };
  const taskA = crypto.randomUUID();
  const taskB = crypto.randomUUID();
  const legacy = {
    format: 'pdr2-project',
    version: 1,
    exportedAt: '2026-10-01T00:00:00.000Z',
    project: {
      id,
      name,
      updatedAt: '2026-10-01T00:00:00.000Z',
      tasks: [
        { id: taskA, name: 'Antiguo A', startDate: '2026-11-01', endDate: '2026-11-03' },
        { id: taskB, name: 'Antiguo B', startDate: '2026-11-04', endDate: '2026-11-06' }
      ],
      dependencies: [{ id: crypto.randomUUID(), predecessorId: taskA, successorId: taskB }]
    }
  };
  try {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    await page.locator('.projects-button').click();
    await page.getByRole('navigation', { name: 'Proyectos' }).getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Importar JSON' }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'antiguo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
    await expect(page.getByRole('dialog', { name: 'Importar proyecto' })).toBeVisible();
    await page.getByRole('button', { name: 'Crear una copia' }).click();

    let copyId = '';
    await expect.poll(async () => {
      const list = await (await page.request.get('/api/projects')).json() as Array<{ id: string; name: string }>;
      copyId = list.find((item) => item.name === `${name} (copia)`)?.id ?? '';
      return copyId;
    }).not.toBe('');
    const copy = await (await page.request.get(`/api/projects/${copyId}`)).json() as { groups: unknown[]; tasks: Array<{ name: string; groupId: string | null; note: string; position: number }>; dependencies: unknown[] };
    expect(copy.groups).toEqual([]);
    expect(copy.tasks.map((task) => [task.name, task.groupId, task.note, task.position])).toEqual([['Antiguo A', null, '', 0], ['Antiguo B', null, '', 1]]);
    expect(copy.dependencies).toHaveLength(1);
    await page.request.delete(`/api/projects/${copyId}`);
  } finally {
    await page.request.delete(`/api/projects/${id}`);
  }
});
