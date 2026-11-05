import { expect, test } from '@playwright/test';

test('saves task and group notes on close, announces marks and persists empty notes', async ({ page }) => {
  const name = `Notas QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const project = await created.json() as { id: string; name: string };
  const groupId = crypto.randomUUID();
  const taskId = crypto.randomUUID();

  try {
    const initial = await (await page.request.get(`/api/projects/${project.id}`)).json() as Record<string, unknown>;
    const seeded = await page.request.put(`/api/projects/${project.id}/state`, { data: {
      ...initial,
      groups: [{ id: groupId, name: 'Planificación', position: 0, note: '' }],
      tasks: [{ id: taskId, name: 'Definir alcance', startDate: '2026-10-29', endDate: '2026-10-30', position: 0, number: 1, status: 'pending', progress: 0, isMilestone: false, groupId, note: '' }],
    } });
    expect(seeded.ok()).toBeTruthy();
    await page.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id: project.id, name, updatedAt: new Date().toISOString() }] })
      : route.continue());
    await page.goto('/');

    const taskMenu = page.locator('.task-actions');
    await taskMenu.locator('summary').click();
    await taskMenu.getByRole('button', { name: 'Añadir nota' }).click();
    const taskNote = page.getByRole('dialog', { name: 'Nota · Definir alcance' });
    await expect(taskNote.getByRole('status')).toHaveText('Se guarda automáticamente al cerrar.');
    const taskText = 'Revisar alcance con el equipo.\nConfirmar entrega ✅';
    await taskNote.getByLabel('Nota').fill(taskText);
    await taskNote.locator('.modal-actions').getByRole('button', { name: 'Cerrar' }).click();
    await expect(taskNote).toBeHidden();
    const taskMark = page.getByRole('button', { name: 'Nota de tarea: Definir alcance' });
    await expect(taskMark).toBeVisible();
    await taskMark.hover();
    const taskTooltip = page.getByRole('tooltip').filter({ hasText: 'Revisar alcance con el equipo.' });
    await expect(taskTooltip).toBeVisible();
    const tooltipBounds = await taskTooltip.boundingBox();
    const viewport = page.viewportSize()!;
    expect(tooltipBounds!.x).toBeGreaterThanOrEqual(0);
    expect(tooltipBounds!.y).toBeGreaterThanOrEqual(0);
    expect(tooltipBounds!.x + tooltipBounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(tooltipBounds!.y + tooltipBounds!.height).toBeLessThanOrEqual(viewport.height);
    await page.mouse.move(0, 0);
    await taskMark.focus();
    await expect(page.getByRole('tooltip').filter({ hasText: 'Revisar alcance con el equipo.' })).toBeVisible();
    let stored = await (await page.request.get(`/api/projects/${project.id}`)).json() as { tasks: Array<{ note: string }>; groups: Array<{ note: string }> };
    expect(stored.tasks[0].note).toBe(taskText);

    await page.reload();
    const reloadedMark = page.getByRole('button', { name: 'Nota de tarea: Definir alcance' });
    await expect(reloadedMark).toBeVisible();
    const reloadedTaskMenu = page.locator('.task-actions');
    await reloadedTaskMenu.locator('summary').click();
    await reloadedTaskMenu.getByRole('button', { name: 'Ver o editar nota' }).click();
    const reloadedTaskNote = page.getByRole('dialog', { name: 'Nota · Definir alcance' });
    await expect(reloadedTaskNote.getByLabel('Nota')).toHaveValue(taskText);
    await reloadedTaskNote.getByLabel('Nota').fill('');
    await page.keyboard.press('Escape');
    await expect(reloadedTaskNote).toBeHidden();
    await expect(page.getByRole('button', { name: 'Nota de tarea: Definir alcance' })).toHaveCount(0);
    stored = await (await page.request.get(`/api/projects/${project.id}`)).json() as typeof stored;
    expect(stored.tasks[0].note).toBe('');

    const groupMenu = page.locator('.group-menu');
    await groupMenu.locator('summary').click();
    await groupMenu.getByRole('button', { name: 'Añadir nota' }).click();
    const groupNote = page.getByRole('dialog', { name: 'Nota · Planificación' });
    const groupText = 'Confirmar dependencias antes de iniciar.\nAlinear fechas con compras ✅';
    await groupNote.getByLabel('Nota').fill(groupText);
    await page.keyboard.press('Escape');
    await expect(groupNote).toBeHidden();
    const groupMark = page.getByRole('button', { name: 'Nota del grupo: Planificación' });
    await expect(groupMark).toBeVisible();
    const groupMarker = groupMark.locator('.group-note-mark');
    const triggerBounds = await groupMark.boundingBox();
    const markerBounds = await groupMarker.boundingBox();
    expect(markerBounds!.x).toBeGreaterThanOrEqual(triggerBounds!.x);
    expect(markerBounds!.x + markerBounds!.width).toBeLessThanOrEqual(triggerBounds!.x + triggerBounds!.width);
    expect(markerBounds!.y).toBeGreaterThanOrEqual(triggerBounds!.y);
    expect(markerBounds!.y + markerBounds!.height).toBeLessThanOrEqual(triggerBounds!.y + triggerBounds!.height);
    await groupMarker.hover();
    await expect(page.getByRole('tooltip').filter({ hasText: 'Confirmar dependencias antes de iniciar.' })).toBeVisible();
    await page.mouse.move(0, 0);
    await groupMark.focus();
    await expect(page.getByRole('tooltip').filter({ hasText: 'Confirmar dependencias antes de iniciar.' })).toBeVisible();
    await groupMark.click();
    const groupNoteEditor = page.getByRole('dialog', { name: 'Nota · Planificación' });
    await expect(groupNoteEditor.getByLabel('Nota')).toHaveValue(groupText);
    await groupNoteEditor.getByLabel('Nota').fill('Confirmar dependencias con compras.\nListar fechas 📅');
    await groupNoteEditor.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(groupNoteEditor.getByRole('status')).toHaveText('Nota guardada.');
    await expect(groupNoteEditor).toBeVisible();
    await groupNoteEditor.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(groupNoteEditor).toBeHidden();
    stored = await (await page.request.get(`/api/projects/${project.id}`)).json() as typeof stored;
    expect(stored.groups[0].note).toBe('Confirmar dependencias con compras.\nListar fechas 📅');
    await page.reload();
    const reloadedGroupMark = page.getByRole('button', { name: 'Nota del grupo: Planificación' });
    await expect(reloadedGroupMark).toBeVisible();
    await reloadedGroupMark.hover();
    await expect(page.getByRole('tooltip').filter({ hasText: 'Confirmar dependencias con compras.' })).toBeVisible();
  } finally {
    await page.request.delete(`/api/projects/${project.id}`, { timeout: 2000 }).catch(() => undefined);
  }
});

test('opens a group note directly with touch on a tablet viewport', async ({ browser, page }) => {
  const name = `Nota grupo tactil QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id, updatedAt } = await created.json() as { id: string; updatedAt: string };
  const groupId = crypto.randomUUID();
  try {
    const initial = await (await page.request.get(`/api/projects/${id}`)).json() as Record<string, unknown>;
    expect((await page.request.put(`/api/projects/${id}/state`, { data: { ...initial, groups: [{ id: groupId, name: 'Grupo táctil', position: 0, note: 'Nota disponible con toque.' }] } })).ok()).toBeTruthy();
    const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true });
    await context.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id, name, updatedAt }] })
      : route.continue());
    const touch = await context.newPage();
    await touch.goto('/');
    const groupMark = touch.getByRole('button', { name: 'Nota del grupo: Grupo táctil' });
    const bounds = await groupMark.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await touch.touchscreen.tap(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    const editor = touch.getByRole('dialog', { name: 'Nota · Grupo táctil' });
    await expect(editor.getByLabel('Nota')).toHaveValue('Nota disponible con toque.');
    await editor.getByLabel('Nota').fill('Nota táctil editada.\nGuardar desde tablet ✅');
    await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(editor.getByRole('status')).toHaveText('Nota guardada.');
    await editor.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(editor).toBeHidden();
    const saved = await (await page.request.get(`/api/projects/${id}`)).json() as { groups: Array<{ note: string }> };
    expect(saved.groups[0].note).toBe('Nota táctil editada.\nGuardar desde tablet ✅');
    await context.close();
  } finally {
    await page.request.delete(`/api/projects/${id}`);
  }
});

test('keeps the note draft open after a save failure and allows a retry', async ({ page }) => {
  const name = `Reintento nota QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const project = await created.json() as { id: string; name: string };
  const taskId = crypto.randomUUID();
  try {
    const initial = await (await page.request.get(`/api/projects/${project.id}`)).json() as Record<string, unknown>;
    expect((await page.request.put(`/api/projects/${project.id}/state`, { data: {
      ...initial,
      tasks: [{ id: taskId, name: 'Preparar revisión', startDate: '2026-10-29', endDate: '2026-10-30', position: 0, number: 1, status: 'pending', progress: 0, isMilestone: false, groupId: null, note: '' }],
    } })).ok()).toBeTruthy();
    await page.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id: project.id, name, updatedAt: new Date().toISOString() }] })
      : route.continue());
    let failNextSave = true;
    await page.route(`**/api/projects/${project.id}/state`, async (route) => {
      if (route.request().method() === 'PUT' && failNextSave) {
        failNextSave = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Fallo temporal de prueba' }) });
        return;
      }
      await route.continue();
    });
    await page.addInitScript(() => localStorage.setItem('pdr2-locale', 'en'));
    await page.goto('/');

    const menu = page.locator('.task-actions');
    await menu.locator('summary').click();
    await menu.getByRole('button', { name: 'Add note' }).click();
    const editor = page.getByRole('dialog', { name: 'Note · Preparar revisión' });
    const text = 'Conservar el borrador y reintentar el guardado.';
    await editor.getByLabel('Note').fill(text);
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('alert')).toContainText('Could not save. Check the connection and try again.');
    await expect(editor.getByLabel('Note')).toHaveValue(text);

    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor.getByRole('status')).toHaveText('Note saved.');
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: 'Save and close' }).click();
    await expect(editor).toBeHidden();
    await page.getByRole('button', { name: 'Task note: Preparar revisión' }).click();
    const closeEditor = page.getByRole('dialog', { name: 'Note · Preparar revisión' });
    const closeText = `${text}\nNota cerrada con × ✅`;
    await closeEditor.getByLabel('Note').fill(closeText);
    await closeEditor.locator('.modal-heading .modal-close').click();
    await expect(closeEditor).toBeHidden();
    const saved = await (await page.request.get(`/api/projects/${project.id}`)).json() as { tasks: Array<{ note: string }> };
    expect(saved.tasks[0].note).toBe(closeText);
    const mark = page.getByRole('button', { name: 'Task note: Preparar revisión' });
    await mark.hover();
    await expect(page.getByRole('tooltip').filter({ hasText: 'Nota cerrada con × ✅' })).toBeVisible();
    await mark.click();
    const englishEditor = page.getByRole('dialog', { name: 'Note · Preparar revisión' });
    await expect(englishEditor.getByRole('status')).toHaveText('The note is saved automatically when you close it.');
    await englishEditor.getByRole('button', { name: 'Save and close' }).click();
    await expect(englishEditor).toBeHidden();
  } finally {
    await page.request.delete(`/api/projects/${project.id}`, { timeout: 2000 }).catch(() => undefined);
  }
});
