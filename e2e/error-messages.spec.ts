import { expect, test } from '@playwright/test';

test('network failures while adding a task show the localized reason, never a technical message', async ({ page }) => {
  const name = `Errores QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id, updatedAt } = await created.json() as { id: string; updatedAt: string };
  try {
    await page.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id, name, updatedAt }] })
      : route.continue());
    await page.route(`**/api/projects/${id}/state`, (route) => route.request().method() === 'PUT' ? route.abort('failed') : route.continue());
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

    await page.getByRole('button', { name: '+ Tarea' }).click();
    await page.getByPlaceholder('Agregar tarea').fill('Sin red');
    await page.getByRole('button', { name: 'Agregar tarea', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'No se pudo guardar. Revisa la conexión y vuelve a intentarlo.' }).first()).toBeVisible();
    await expect(page.getByText('Failed to fetch')).toHaveCount(0);
  } finally {
    await page.unroute('**/api/projects');
    await page.request.delete(`/api/projects/${id}`);
  }
});
