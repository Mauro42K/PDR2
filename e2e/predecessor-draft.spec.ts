import { expect, test } from '@playwright/test';

test('keeps an invalid PRED draft editable on Enter and reverts it with its reason when focus leaves', async ({ page }) => {
  const name = `Borrador PRED QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id, updatedAt } = await created.json() as { id: string; updatedAt: string };
  try {
    for (const task of [
      { name: 'Alfa', startDate: '2026-11-01', endDate: '2026-11-03' },
      { name: 'Beta', startDate: '2026-11-10', endDate: '2026-11-12' }
    ]) expect((await page.request.post(`/api/projects/${id}/tasks`, { data: task })).ok()).toBeTruthy();
    await page.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id, name, updatedAt }] })
      : route.continue());
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

    const beta = page.locator('.task-row').filter({ has: page.getByRole('textbox', { name: 'Nombre de tarea 2' }) });
    const input = beta.locator('.predecessors-cell input');
    await input.fill('2,2');
    await input.press('Enter');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('2,2');
    await expect(beta.getByRole('status')).toContainText('No repitas');

    await page.getByRole('heading', { name, exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(beta.getByRole('status')).toContainText('No repitas');
    const saved = await (await page.request.get(`/api/projects/${id}`)).json() as { dependencies: unknown[] };
    expect(saved.dependencies).toHaveLength(0);
  } finally {
    await page.unroute('**/api/projects');
    await page.request.delete(`/api/projects/${id}`);
  }
});
