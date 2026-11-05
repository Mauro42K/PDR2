import { expect, test } from '@playwright/test';

test('an invalid PRED draft typed after a saved removal never writes predecessors back', async ({ page }) => {
  const name = `Borrador tras guardar QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id, updatedAt } = await created.json() as { id: string; updatedAt: string };
  try {
    for (const task of [
      { name: 'Alfa', startDate: '2026-11-01', endDate: '2026-11-03' },
      { name: 'Beta', startDate: '2026-11-02', endDate: '2026-11-04' },
      { name: 'Gamma', startDate: '2026-11-10', endDate: '2026-11-12' }
    ]) expect((await page.request.post(`/api/projects/${id}/tasks`, { data: task })).ok()).toBeTruthy();
    const taskIds = ((await (await page.request.get(`/api/projects/${id}`)).json()) as { tasks: Array<{ id: string }> }).tasks.map((task) => task.id);
    for (const predecessorId of [taskIds[0], taskIds[1]]) expect((await page.request.post(`/api/projects/${id}/dependencies`, { data: { predecessorId, successorId: taskIds[2] } })).ok()).toBeTruthy();
    await page.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id, name, updatedAt }] })
      : route.continue());
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

    const gamma = page.locator('.task-row').filter({ has: page.getByRole('textbox', { name: 'Nombre de tarea 3' }) });
    const input = gamma.locator('.predecessors-cell input');
    await expect(input).toHaveValue('1, 2');
    await input.fill('');
    await input.press('Enter');
    await input.fill('2,2');
    await input.press('Enter');
    await page.getByRole('heading', { name, exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(gamma.getByRole('status')).toContainText('No repitas');
    await page.waitForTimeout(500);
    const saved = await (await page.request.get(`/api/projects/${id}`)).json() as { dependencies: unknown[] };
    expect(saved.dependencies).toHaveLength(0);
  } finally {
    await page.unroute('**/api/projects');
    await page.request.delete(`/api/projects/${id}`);
  }
});
