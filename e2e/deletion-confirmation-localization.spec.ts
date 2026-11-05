import { expect, test, type Page } from '@playwright/test';

async function switchToEnglish(page: Page) {
  await page.getByRole('button', { name: 'Ajustes' }).click();
  const settings = page.locator('#settings-dialog');
  await settings.getByLabel('Idioma').selectOption('en');
  await settings.getByRole('button', { name: 'Close' }).click();
}

test('uses DELETE for the written project confirmation in English on a touch viewport', async ({ browser }) => {
  const name = `Project English delete QA ${Date.now()}`;
  const baseURL = process.env.PLAYWRIGHT_BASE_URL!;
  const response = await fetch(`${baseURL}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  const project = await response.json() as { id: string; name: string };
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true, baseURL });
  let visibleProjects = [{ ...project, updatedAt: new Date().toISOString() }];
  try {
    await context.route('**/api/projects**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/projects' && request.method() === 'GET') {
        await route.fulfill({ json: visibleProjects });
      } else if (path === `/api/projects/${project.id}` && request.method() === 'DELETE') {
        const result = await route.fetch();
        if (result.ok()) visibleProjects = visibleProjects.filter((item) => item.id !== project.id);
        await route.fulfill({ response: result });
      } else {
        await route.continue();
      }
    });
    const page = await context.newPage();
    await page.goto('/');
    await switchToEnglish(page);
    await page.locator('.project-actions').getByRole('button', { name: 'Delete project' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete project' });
    await expect(dialog).toContainText('type DELETE in the next step');
    await dialog.getByRole('button', { name: 'Continue' }).click();
    const confirmation = dialog.getByLabel('Type DELETE to confirm');
    await confirmation.fill('BORRAR');
    const finalDelete = dialog.getByRole('button', { name: 'Delete project' });
    await expect(finalDelete).toBeDisabled();
    await confirmation.fill('DELETE');
    await expect(finalDelete).toBeEnabled();
    await finalDelete.click();
    await expect(dialog).toBeHidden();
    expect((await page.request.get(`/api/projects/${project.id}`)).status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Create your first project to start planning.' })).toBeVisible();
  } finally {
    await context.close();
    const stillExists = await fetch(`${baseURL}/api/projects/${project.id}`);
    if (stillExists.ok) await fetch(`${baseURL}/api/projects/${project.id}`, { method: 'DELETE' });
  }
});

test('uses DELETE for written group confirmation in English', async ({ page }) => {
  const name = `Group English delete QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const project = await created.json() as { id: string; name: string };
  const groupId = crypto.randomUUID();
  try {
    const initial = await (await page.request.get(`/api/projects/${project.id}`)).json() as Record<string, unknown>;
    await page.request.put(`/api/projects/${project.id}/state`, { data: {
      ...initial,
      groups: [{ id: groupId, name: 'Delivery', position: 0, note: '' }],
    } });
    await page.route('**/api/projects**', (route) => route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/projects'
      ? route.fulfill({ json: [{ id: project.id, name, updatedAt: new Date().toISOString() }] })
      : route.continue());
    await page.goto('/');
    await switchToEnglish(page);
    const menu = page.locator('.group-menu');
    await menu.locator('summary').click();
    await menu.getByRole('button', { name: 'Delete group' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete group' });
    await dialog.getByRole('button', { name: 'Continue' }).click();
    const confirmation = dialog.getByLabel('Type DELETE to confirm');
    await confirmation.fill('BORRAR');
    const finalDelete = dialog.getByRole('button', { name: 'Delete group' });
    await expect(finalDelete).toBeDisabled();
    await confirmation.fill('DELETE');
    await expect(finalDelete).toBeEnabled();
    await finalDelete.click();
    await expect(page.locator('.save-status')).toHaveText('Saved');
    const stored = await (await page.request.get(`/api/projects/${project.id}`)).json() as { groups: unknown[] };
    expect(stored.groups).toHaveLength(0);
  } finally {
    await page.request.delete(`/api/projects/${project.id}`);
  }
});

test('requires the localized written confirmation before deleting a task and its dependencies', async ({ page }) => {
  const name = `Task delete localization QA ${Date.now()}`;
  const project = await (await page.request.post('/api/projects', { data: { name } })).json() as { id: string; name: string };
  const predecessorId = crypto.randomUUID();
  const successorId = crypto.randomUUID();
  try {
    const initial = await (await page.request.get(`/api/projects/${project.id}`)).json() as Record<string, unknown>;
    const seeded = await page.request.put(`/api/projects/${project.id}/state`, { data: {
      ...initial,
      tasks: [
        { id: predecessorId, name: 'Prepare brief', startDate: '2026-10-29', endDate: '2026-10-30', position: 0, number: 1, status: 'pending', progress: 0, isMilestone: false, groupId: null, note: '' },
        { id: successorId, name: 'Review brief', startDate: '2026-10-31', endDate: '2026-11-01', position: 1, number: 2, status: 'pending', progress: 0, isMilestone: false, groupId: null, note: '' },
      ],
      dependencies: [{ id: crypto.randomUUID(), predecessorId, successorId }],
    } });
    expect(seeded.ok()).toBeTruthy();
    await page.route('**/api/projects**', (route) => route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/projects'
      ? route.fulfill({ json: [{ id: project.id, name, updatedAt: new Date().toISOString() }] })
      : route.continue());
    await page.goto('/');
    await switchToEnglish(page);
    const taskActions = page.getByLabel('Task actions: Prepare brief');
    await taskActions.click();
    await page.locator('.task-actions[open]').getByRole('button', { name: 'Delete task' }).click();
    let dialog = page.getByRole('dialog', { name: 'Delete task' });
    await expect(dialog).toContainText('Prepare brief');
    await expect(dialog).toContainText('dependencies');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect((await page.request.get(`/api/projects/${project.id}`)).ok()).toBeTruthy();

    await taskActions.click();
    await page.locator('.task-actions[open]').getByRole('button', { name: 'Delete task' }).click();
    dialog = page.getByRole('dialog', { name: 'Delete task' });
    await dialog.getByRole('button', { name: 'Continue' }).click();
    const confirmation = dialog.getByLabel('Type DELETE to confirm');
    await confirmation.fill('BORRAR');
    const finalDelete = dialog.getByRole('button', { name: 'Delete task' });
    await expect(finalDelete).toBeDisabled();
    await confirmation.fill('DELETE');
    await expect(finalDelete).toBeEnabled();
    await finalDelete.click();
    await expect(dialog).toBeHidden();
    const saved = await (await page.request.get(`/api/projects/${project.id}`)).json() as { tasks: Array<{ id: string }>; dependencies: Array<unknown> };
    expect(saved.tasks.map((task) => task.id)).toEqual([successorId]);
    expect(saved.dependencies).toHaveLength(0);
  } finally {
    await page.request.delete(`/api/projects/${project.id}`);
  }
});

test('requires BORRAR and keeps task deletion controls usable on a touch viewport', async ({ browser }) => {
  const name = `Task delete tablet QA ${Date.now()}`;
  const baseURL = process.env.PLAYWRIGHT_BASE_URL!;
  const project = await (await fetch(`${baseURL}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })).json() as { id: string; name: string };
  const taskId = crypto.randomUUID();
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true, baseURL });
  try {
    const initial = await (await fetch(`${baseURL}/api/projects/${project.id}`)).json() as Record<string, unknown>;
    const seeded = await fetch(`${baseURL}/api/projects/${project.id}/state`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      ...initial,
      tasks: [{ id: taskId, name: 'Preparar entrega', startDate: '2026-10-29', endDate: '2026-10-30', position: 0, number: 1, status: 'pending', progress: 0, isMilestone: false, groupId: null, note: '' }],
      dependencies: [],
    }) });
    expect(seeded.ok).toBeTruthy();
    let visibleProjects = [{ ...project, updatedAt: new Date().toISOString() }];
    await context.route('**/api/projects**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/projects' && request.method() === 'GET') await route.fulfill({ json: visibleProjects });
      else if (path === `/api/projects/${project.id}` && request.method() === 'DELETE') {
        const response = await route.fetch();
        if (response.ok()) visibleProjects = visibleProjects.filter((item) => item.id !== project.id);
        await route.fulfill({ response });
      } else await route.continue();
    });
    const page = await context.newPage();
    await page.goto('/');
    const taskActions = page.getByLabel('Acciones de tarea: Preparar entrega');
    const triggerBounds = await taskActions.boundingBox();
    expect(triggerBounds!.width).toBeGreaterThanOrEqual(44);
    expect(triggerBounds!.height).toBeGreaterThanOrEqual(44);
    await page.touchscreen.tap(triggerBounds!.x + triggerBounds!.width / 2, triggerBounds!.y + triggerBounds!.height / 2);
    await page.locator('.task-actions[open]').getByRole('button', { name: 'Eliminar tarea' }).click();
    const dialog = page.getByRole('dialog', { name: 'Eliminar tarea' });
    const firstStep = dialog.getByRole('button', { name: 'Continuar' });
    const firstStepBounds = await firstStep.boundingBox();
    expect(firstStepBounds!.width).toBeGreaterThanOrEqual(44);
    expect(firstStepBounds!.height).toBeGreaterThanOrEqual(44);
    await page.touchscreen.tap(firstStepBounds!.x + firstStepBounds!.width / 2, firstStepBounds!.y + firstStepBounds!.height / 2);
    const confirmation = dialog.getByLabel('Escribe BORRAR para confirmar');
    await confirmation.fill('DELETE');
    const finalDelete = dialog.getByRole('button', { name: 'Eliminar tarea' });
    await expect(finalDelete).toBeDisabled();
    await confirmation.fill('BORRAR');
    const finalBounds = await finalDelete.boundingBox();
    expect(finalBounds!.width).toBeGreaterThanOrEqual(44);
    expect(finalBounds!.height).toBeGreaterThanOrEqual(44);
    await page.touchscreen.tap(finalBounds!.x + finalBounds!.width / 2, finalBounds!.y + finalBounds!.height / 2);
    await expect(dialog).toBeHidden();
    expect((await fetch(`${baseURL}/api/projects/${project.id}`)).ok).toBeTruthy();
    const saved = await (await fetch(`${baseURL}/api/projects/${project.id}`)).json() as { tasks: Array<{ id: string }> };
    expect(saved.tasks).toHaveLength(0);
  } finally {
    await context.close();
    const stillExists = await fetch(`${baseURL}/api/projects/${project.id}`);
    if (stillExists.ok) await fetch(`${baseURL}/api/projects/${project.id}`, { method: 'DELETE' });
  }
});
