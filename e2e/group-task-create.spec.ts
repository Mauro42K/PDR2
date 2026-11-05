import { expect, test } from '@playwright/test';

test('creates a task from its group context as one undoable, persisted change', async ({ page }) => {
  const name = `Tarea contextual QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const project = await created.json() as { id: string; name: string };
  const groupId = crypto.randomUUID();
  try {
    const initial = await (await page.request.get(`/api/projects/${project.id}`)).json() as Record<string, unknown>;
    await page.request.put(`/api/projects/${project.id}/state`, { data: {
      ...initial,
      groups: [{ id: groupId, name: 'Diseño', position: 0, note: '' }],
    } });
    await page.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id: project.id, name, updatedAt: new Date().toISOString() }] })
      : route.continue());
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Diseño/ })).toBeVisible();
    const menu = page.locator('.group-menu');
    await menu.locator('summary').click();
    await menu.getByRole('button', { name: 'Añadir tarea a este grupo' }).click();
    await expect(page.getByLabel('Grupo de la nueva tarea')).toHaveValue(groupId);
    await page.getByPlaceholder('Agregar tarea').fill('Preparar materiales');
    await page.getByRole('button', { name: 'Agregar tarea' }).click();
    await expect(page.locator('.task-row input').first()).toHaveValue('Preparar materiales');
    let stored = await (await page.request.get(`/api/projects/${project.id}`)).json() as { tasks: Array<{ name: string; position: number; groupId: string }> };
    expect(stored.tasks).toHaveLength(1);
    expect(stored.tasks[0]).toMatchObject({ name: 'Preparar materiales', position: 0, groupId });
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.locator('.save-status')).toHaveText('Guardado');
    await expect(page.locator('.task-row input').first()).toHaveCount(0);
    stored = await (await page.request.get(`/api/projects/${project.id}`)).json() as typeof stored;
    expect(stored.tasks).toHaveLength(0);
    await page.getByRole('button', { name: 'Rehacer' }).click();
    await expect(page.locator('.save-status')).toHaveText('Guardado');
    await expect(page.locator('.task-row input').first()).toHaveValue('Preparar materiales');
    stored = await (await page.request.get(`/api/projects/${project.id}`)).json() as typeof stored;
    expect(stored.tasks).toHaveLength(1);
    expect(stored.tasks[0].groupId).toBe(groupId);
  } finally {
    await page.request.delete(`/api/projects/${project.id}`);
  }
});

test('creates the first ungrouped task in an empty project', async ({ page }) => {
  const name = `Proyecto vacío QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const project = await created.json() as { id: string; name: string };
  try {
    await page.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id: project.id, name, updatedAt: new Date().toISOString() }] })
      : route.continue());
    await page.goto('/');
    await expect(page.getByText('Usa «+ Tarea» para añadir la primera tarea al cronograma.', { exact: true })).toBeVisible();
    await expect(page.locator('.task-create-row')).toHaveCount(0);
    await page.getByRole('button', { name: '+ Tarea' }).click();
    const addDialog = page.getByRole('dialog', { name: 'Nueva tarea' });
    await expect(page.getByLabel('Grupo de la nueva tarea')).toHaveValue('');
    await addDialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(addDialog).toBeHidden();
    await expect(page.locator('.task-row')).toHaveCount(0);
    await page.getByRole('button', { name: '+ Tarea' }).click();
    await addDialog.getByPlaceholder('Agregar tarea').fill('Definir alcance');
    await addDialog.getByRole('button', { name: 'Agregar tarea' }).click();
    await expect(page.locator('.task-row input').first()).toHaveValue('Definir alcance');
    const stored = await (await page.request.get(`/api/projects/${project.id}`)).json() as { tasks: Array<{ name: string; groupId: string | null }> };
    expect(stored.tasks).toEqual([expect.objectContaining({ name: 'Definir alcance', groupId: null })]);
  } finally {
    await page.request.delete(`/api/projects/${project.id}`);
  }
});

test('keeps the global task creation action reachable in a narrow touch toolbar', async ({ page, browser }) => {
  const name = `Toolbar móvil QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const project = await created.json() as { id: string; name: string };
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, baseURL: process.env.PLAYWRIGHT_BASE_URL });
  try {
    await context.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id: project.id, name, updatedAt: new Date().toISOString() }] })
      : route.continue());
    const touchPage = await context.newPage();
    await touchPage.goto('/');
    const toolbar = touchPage.locator('.card-toolbar');
    const addGroup = toolbar.getByRole('button', { name: '+ Grupo' });
    const addTask = toolbar.getByRole('button', { name: '+ Tarea' });
    await expect(addGroup).toBeVisible();
    await expect(addTask).toBeVisible();
    const geometry = await touchPage.evaluate(() => {
      const container = document.querySelector('.card-toolbar')!.getBoundingClientRect();
      const task = [...document.querySelectorAll('.card-toolbar button')].find((button) => button.textContent?.trim() === '+ Tarea')!.getBoundingClientRect();
      return { toolbarLeft: container.left, toolbarRight: container.right, taskLeft: task.left, taskRight: task.right };
    });
    expect(geometry.taskLeft).toBeGreaterThanOrEqual(geometry.toolbarLeft);
    expect(geometry.taskRight).toBeLessThanOrEqual(geometry.toolbarRight);
    const addBounds = await addTask.boundingBox();
    expect(addBounds!.width).toBeGreaterThanOrEqual(44);
    expect(addBounds!.height).toBeGreaterThanOrEqual(44);
    await touchPage.touchscreen.tap(addBounds!.x + addBounds!.width / 2, addBounds!.y + addBounds!.height / 2);
    const dialog = touchPage.getByRole('dialog', { name: 'Nueva tarea' });
    const nameInput = dialog.getByPlaceholder('Agregar tarea');
    expect(await nameInput.evaluate((element) => getComputedStyle(element).fontSize)).toBe('16px');
    expect((await nameInput.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
  } finally {
    await context.close();
    await page.request.delete(`/api/projects/${project.id}`);
  }
});

test('creates the first group in an empty project with the keyboard and without adding a task', async ({ page }) => {
  const name = `Grupo vacío QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const project = await created.json() as { id: string; name: string };
  try {
    await page.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id: project.id, name, updatedAt: new Date().toISOString() }] })
      : route.continue());
    await page.goto('/');
    await expect(page.getByText('Añade tareas para verlas en el cronograma.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '+ Grupo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo grupo' });
    await dialog.getByLabel('Nombre del grupo').fill('Planificación');
    await dialog.getByLabel('Nombre del grupo').press('Enter');
    await expect(page.getByRole('button', { name: /Planificación/ })).toBeVisible();
    let stored = await (await page.request.get(`/api/projects/${project.id}`)).json() as { groups: Array<{ name: string; position: number }>; tasks: unknown[] };
    expect(stored.groups).toEqual([expect.objectContaining({ name: 'Planificación', position: 0 })]);
    expect(stored.tasks).toHaveLength(0);
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.locator('.save-status')).toHaveText('Guardado');
    stored = await (await page.request.get(`/api/projects/${project.id}`)).json() as typeof stored;
    expect(stored.groups).toHaveLength(0);
    await page.getByRole('button', { name: 'Rehacer' }).click();
    await expect(page.locator('.save-status')).toHaveText('Guardado');
    await expect(page.getByRole('button', { name: /Planificación/ })).toBeVisible();
    stored = await (await page.request.get(`/api/projects/${project.id}`)).json() as typeof stored;
    expect(stored.groups[0].name).toBe('Planificación');
    expect(stored.tasks).toHaveLength(0);
  } finally {
    await page.request.delete(`/api/projects/${project.id}`);
  }
});

test('deletes a group only after BORRAR and undo restores its task assignment', async ({ page }) => {
  const name = `Borrado grupo QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const project = await created.json() as { id: string; name: string };
  const groupId = crypto.randomUUID();
  try {
    const initial = await (await page.request.get(`/api/projects/${project.id}`)).json() as Record<string, unknown>;
    await page.request.put(`/api/projects/${project.id}/state`, { data: {
      ...initial,
      groups: [{ id: groupId, name: 'Entrega', position: 0, note: '' }],
      tasks: [{ id: crypto.randomUUID(), name: 'Validar', startDate: '2026-10-29', endDate: '2026-10-30', position: 0, number: 1, status: 'pending', progress: 0, isMilestone: false, groupId, note: '' }],
    } });
    await page.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id: project.id, name, updatedAt: new Date().toISOString() }] })
      : route.continue());
    await page.goto('/');
    const menu = page.locator('.group-menu');
    await menu.locator('summary').click();
    await menu.getByRole('button', { name: 'Eliminar grupo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Eliminar grupo' });
    await expect(dialog).toContainText('se conservarán sin grupo');
    await dialog.getByRole('button', { name: 'Continuar' }).click();
    const confirmation = dialog.getByLabel('Escribe BORRAR para confirmar');
    await confirmation.fill('BORRAR');
    await dialog.getByRole('button', { name: 'Eliminar grupo' }).click();
    await expect(page.locator('.save-status')).toHaveText('Guardado');
    let stored = await (await page.request.get(`/api/projects/${project.id}`)).json() as { groups: unknown[]; tasks: Array<{ groupId: string | null }> };
    expect(stored.groups).toHaveLength(0);
    expect(stored.tasks[0].groupId).toBeNull();
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.locator('.save-status')).toHaveText('Guardado');
    stored = await (await page.request.get(`/api/projects/${project.id}`)).json() as typeof stored;
    expect(stored.groups).toHaveLength(1);
    expect(stored.tasks[0].groupId).toBe(groupId);
  } finally {
    await page.request.delete(`/api/projects/${project.id}`);
  }
});

test('opens group creation by touch in a tablet-sized viewport', async ({ browser }) => {
  const name = `Grupo tablet QA ${Date.now()}`;
  const create = await fetch(`${process.env.PLAYWRIGHT_BASE_URL}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  const project = await create.json() as { id: string; name: string };
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true, baseURL: process.env.PLAYWRIGHT_BASE_URL });
  try {
    await context.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id: project.id, name, updatedAt: new Date().toISOString() }] })
      : route.continue());
    const page = await context.newPage();
    await page.goto('/');
    const createGroup = page.getByRole('button', { name: '+ Grupo' });
    const bounds = await createGroup.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await page.touchscreen.tap(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    const dialog = page.getByRole('dialog', { name: 'Nuevo grupo' });
    await dialog.getByLabel('Nombre del grupo').fill('Inicio táctil');
    const save = dialog.getByRole('button', { name: 'Guardar' });
    const saveBounds = await save.boundingBox();
    expect(saveBounds!.width).toBeGreaterThanOrEqual(44);
    expect(saveBounds!.height).toBeGreaterThanOrEqual(44);
    await page.touchscreen.tap(saveBounds!.x + saveBounds!.width / 2, saveBounds!.y + saveBounds!.height / 2);
    await expect(page.getByRole('button', { name: /Inicio táctil/ })).toBeVisible();
  } finally {
    await context.close();
    await fetch(`${process.env.PLAYWRIGHT_BASE_URL}/api/projects/${project.id}`, { method: 'DELETE' });
  }
});
