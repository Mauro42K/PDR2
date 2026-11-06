import { expect, test } from '@playwright/test';

test('a failed undo keeps the confirmed state, shows a localized reason, and can be retried', async ({
  page,
}) => {
  const name = `Undo fallo QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id, updatedAt } = (await created.json()) as { id: string; updatedAt: string };
  try {
    expect(
      (
        await page.request.post(`/api/projects/${id}/tasks`, {
          data: { name: 'Original', startDate: '2026-11-01', endDate: '2026-11-02' },
        })
      ).ok(),
    ).toBeTruthy();
    await page.route('**/api/projects', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: [{ id, name, updatedAt }] })
        : route.continue(),
    );
    let failure: 'none' | 'http' | 'network' = 'none';
    await page.route(`**/api/projects/${id}/state`, (route) => {
      if (failure === 'http')
        return route.fulfill({
          status: 503,
          json: { error: 'unavailable', message: 'Servidor no disponible.' },
        });
      if (failure === 'network') return route.abort('failed');
      return route.continue();
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

    const field = page.getByRole('textbox', { name: 'Nombre de tarea 1' });
    await field.fill('Editada');
    await field.press('Enter');
    await expect
      .poll(
        async () =>
          (
            (await (await page.request.get(`/api/projects/${id}`)).json()) as {
              tasks: Array<{ name: string }>;
            }
          ).tasks[0].name,
      )
      .toBe('Editada');

    failure = 'http';
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'No se pudo guardar. Revisa la conexión y vuelve a intentarlo.' }),
    ).toBeVisible();
    await expect(page.getByText('Servidor no disponible.')).toHaveCount(0);
    await expect(field).toHaveValue('Editada');
    await expect(
      (
        (await (await page.request.get(`/api/projects/${id}`)).json()) as {
          tasks: Array<{ name: string }>;
        }
      ).tasks[0].name,
    ).toBe('Editada');
    await expect(page.getByRole('button', { name: 'Deshacer' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Rehacer' })).toBeDisabled();

    failure = 'network';
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'No se pudo guardar. Revisa la conexión y vuelve a intentarlo.' }),
    ).toBeVisible();
    await expect(page.getByText('Failed to fetch')).toHaveCount(0);
    await expect(field).toHaveValue('Editada');

    failure = 'none';
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(field).toHaveValue('Original');
    await expect
      .poll(
        async () =>
          (
            (await (await page.request.get(`/api/projects/${id}`)).json()) as {
              tasks: Array<{ name: string }>;
            }
          ).tasks[0].name,
      )
      .toBe('Original');
    await expect(page.getByRole('button', { name: 'Rehacer' })).toBeEnabled();
  } finally {
    await page.unroute('**/api/projects');
    await page.request.delete(`/api/projects/${id}`);
  }
});
