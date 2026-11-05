import { expect, test } from '@playwright/test';

test('labels ungrouped tasks under a non-collapsible header when the project has groups', async ({ page }) => {
  const name = `Sin grupo QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id, updatedAt } = await created.json() as { id: string; updatedAt: string };
  try {
    expect((await page.request.post(`/api/projects/${id}/tasks`, { data: { name: 'Solo', startDate: '2026-11-01', endDate: '2026-11-02' } })).ok()).toBeTruthy();
    const project = await (await page.request.get(`/api/projects/${id}`)).json() as { tasks: Array<{ id: string }> };
    expect((await page.request.put(`/api/projects/${id}/state`, { data: { ...project, groups: [{ id: '5f1c1a2e-7b1d-4c3a-9e2f-1a2b3c4d5e6f', name: 'Fase 1', position: 0, note: '', color: null }], tasks: [{ ...(project as unknown as { tasks: Array<Record<string, unknown>> }).tasks[0], groupId: '5f1c1a2e-7b1d-4c3a-9e2f-1a2b3c4d5e6f' }, { id: '6a2d2b3f-8c2e-4d4b-8f3a-2b3c4d5e6f70', name: 'Libre', startDate: '2026-11-03', endDate: '2026-11-04', position: 1, number: 2, status: 'pending', progress: 0, isMilestone: false, groupId: null, note: '' }], dependencies: [] } })).ok()).toBeTruthy();
    await page.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id, name, updatedAt }] })
      : route.continue());
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

    const header = page.locator('.group-toolbar-ungrouped');
    await expect(header).toHaveText('Sin grupo');
    await expect(header.locator('button')).toHaveCount(0);
    await page.getByRole('button', { name: /Fase 1/ }).click();
    await expect(header).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Nombre de tarea 2' })).toHaveValue('Libre');
  } finally {
    await page.unroute('**/api/projects');
    await page.request.delete(`/api/projects/${id}`);
  }
});

test('does not add the ungrouped header to a project without groups', async ({ page }) => {
  const name = `Sin grupos QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id, updatedAt } = await created.json() as { id: string; updatedAt: string };
  try {
    expect((await page.request.post(`/api/projects/${id}/tasks`, { data: { name: 'Plana', startDate: '2026-11-01', endDate: '2026-11-02' } })).ok()).toBeTruthy();
    await page.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id, name, updatedAt }] })
      : route.continue());
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Nombre de tarea 1' })).toHaveValue('Plana');
    await expect(page.locator('.group-toolbar-ungrouped')).toHaveCount(0);
  } finally {
    await page.unroute('**/api/projects');
    await page.request.delete(`/api/projects/${id}`);
  }
});
