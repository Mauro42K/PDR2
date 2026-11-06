import { expect, test } from '@playwright/test';

test('rejects a predecessor that would close a loop and keeps the typed number with the reason', async ({
  page,
}) => {
  const name = `Ciclo PRED QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id, updatedAt } = (await created.json()) as { id: string; updatedAt: string };
  try {
    for (const task of [
      { name: 'Alfa', startDate: '2026-11-01', endDate: '2026-11-03' },
      { name: 'Beta', startDate: '2026-11-10', endDate: '2026-11-12' },
    ])
      expect(
        (await page.request.post(`/api/projects/${id}/tasks`, { data: task })).ok(),
      ).toBeTruthy();
    const taskIds = (
      (await (await page.request.get(`/api/projects/${id}`)).json()) as {
        tasks: Array<{ id: string }>;
      }
    ).tasks.map((task) => task.id);
    expect(
      (
        await page.request.post(`/api/projects/${id}/dependencies`, {
          data: { predecessorId: taskIds[0], successorId: taskIds[1] },
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

    const alfa = page
      .locator('.task-row')
      .filter({ has: page.getByRole('textbox', { name: 'Nombre de tarea 1' }) });
    const predecessorInput = alfa.locator('.predecessors-cell input');
    await predecessorInput.fill('2');
    await predecessorInput.press('Enter');

    await expect(page.getByRole('alertdialog')).not.toBeVisible();
    await expect(alfa.getByRole('status')).toContainText('crearía un ciclo de dependencias');
    await expect(predecessorInput).toHaveValue('2');
    await expect(predecessorInput).toHaveAttribute('aria-invalid', 'true');
    const saved = (await (await page.request.get(`/api/projects/${id}`)).json()) as {
      dependencies: Array<{ predecessorId: string; successorId: string }>;
    };
    expect(saved.dependencies).toEqual([
      { id: expect.any(String), predecessorId: taskIds[0], successorId: taskIds[1] },
    ]);
  } finally {
    await page.unroute('**/api/projects');
    await page.request.delete(`/api/projects/${id}`);
  }
});
