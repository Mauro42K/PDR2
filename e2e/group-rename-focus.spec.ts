import { expect, test } from '@playwright/test';

test('focuses the group name field when renaming opens so typed text is kept', async ({ page }) => {
  const name = `Renombrar QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id, updatedAt } = (await created.json()) as { id: string; updatedAt: string };
  try {
    const groupId = '7b3e4f5a-1c2d-4e3f-8a9b-0c1d2e3f4a5b';
    const project = (await (await page.request.get(`/api/projects/${id}`)).json()) as Record<
      string,
      unknown
    >;
    expect(
      (
        await page.request.put(`/api/projects/${id}/state`, {
          data: {
            ...project,
            groups: [{ id: groupId, name: 'Fase', position: 0, note: '', color: null }],
            tasks: [],
            dependencies: [],
          },
        })
      ).ok(),
    ).toBeTruthy();
    await page.route('**/api/projects', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: [{ id, name, updatedAt }] })
        : route.continue(),
    );
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

    await page.getByLabel('Opciones del grupo: Fase').click();
    await page.getByRole('button', { name: 'Renombrar', exact: true }).click();
    const field = page.getByRole('dialog').getByRole('textbox', { name: 'Nombre del grupo' });
    await expect(field).toBeFocused();
    await page.keyboard.type(' OK');
    await expect(field).toHaveValue('Fase OK');
  } finally {
    await page.unroute('**/api/projects');
    await page.request.delete(`/api/projects/${id}`);
  }
});
