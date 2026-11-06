import { expect, test } from '@playwright/test';

test('keeps a 100-task project usable in an emulated tablet viewport', async ({
  browser,
  page,
}) => {
  const name = `Tablet 100 tareas QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const project = (await created.json()) as { id: string; name: string; updatedAt: string };
  const initial = (await (await page.request.get(`/api/projects/${project.id}`)).json()) as Record<
    string,
    unknown
  >;
  const tasks = Array.from({ length: 100 }, (_, index) => {
    const startDate = new Date(Date.UTC(2026, 10, index + 1)).toISOString().slice(0, 10);
    return {
      id: crypto.randomUUID(),
      name: `Tarea ${String(index + 1).padStart(3, '0')}`,
      startDate,
      endDate: startDate,
      position: index,
      number: index + 1,
      status: 'pending',
      progress: 0,
      isMilestone: false,
      groupId: null,
      note: '',
    };
  });
  const seeded = await page.request.put(`/api/projects/${project.id}/state`, {
    data: { ...initial, tasks, groups: [], dependencies: [] },
  });
  expect(seeded.ok()).toBeTruthy();
  const context = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    isMobile: true,
    hasTouch: true,
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
  });
  try {
    await context.route('**/api/projects', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: [{ id: project.id, name, updatedAt: project.updatedAt }] })
        : route.continue(),
    );
    const touchPage = await context.newPage();
    await touchPage.goto('/');
    await expect(touchPage.locator('.task-row')).toHaveCount(100);
    const lastRow = touchPage
      .locator('.task-row')
      .filter({ has: touchPage.getByRole('textbox', { name: 'Nombre de tarea 100' }) });
    const predecessor = lastRow.locator('.predecessors-cell input');
    await predecessor.scrollIntoViewIfNeeded();
    const bounds = await predecessor.boundingBox();
    expect(bounds).toBeTruthy();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await predecessor.tap();
    await predecessor.fill('99');
    await predecessor.press('Enter');
    await expect(touchPage.locator('.save-status')).toHaveText('Guardado');
    const saved = (await (await touchPage.request.get(`/api/projects/${project.id}`)).json()) as {
      dependencies: Array<{ predecessorId: string; successorId: string }>;
    };
    expect(saved.dependencies).toEqual([
      { id: expect.any(String), predecessorId: tasks[98].id, successorId: tasks[99].id },
    ]);
  } finally {
    await context.close();
    await page.request.delete(`/api/projects/${project.id}`);
  }
});
