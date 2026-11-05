import { expect, test } from '@playwright/test';

test('edits predecessor row numbers directly inside PRED and validates/persists them', async ({ page }) => {
  const name = `Edición PRED QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id, updatedAt } = await created.json() as { id: string; updatedAt: string };
  try {
    for (const task of [
      { name: 'Diseño', startDate: '2026-11-01', endDate: '2026-11-03' },
      { name: 'Compra', startDate: '2026-11-02', endDate: '2026-11-04' },
      { name: 'Entrega', startDate: '2026-11-04', endDate: '2026-11-08' }
    ]) expect((await page.request.post(`/api/projects/${id}/tasks`, { data: task })).ok()).toBeTruthy();
    const taskIds = ((await (await page.request.get(`/api/projects/${id}`)).json()) as { tasks: Array<{ id: string }> }).tasks.map((task) => task.id);
    await page.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id, name, updatedAt }] })
      : route.continue());
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByText('Pred.', { exact: true })).toBeVisible();
    await expect(page.locator('.dependency-start')).toHaveCount(0);
    await expect(page.locator('.dependency-card')).toHaveCount(0);

    const delivery = page.locator('.task-row').filter({ has: page.getByRole('textbox', { name: 'Nombre de tarea 3' }) });
    const predecessorInput = delivery.locator('.predecessors-cell input');
    await expect(predecessorInput).toHaveValue('');
    const cellBounds = await delivery.locator('.predecessors-cell').boundingBox();
    const idleBounds = await predecessorInput.boundingBox();
    await predecessorInput.focus();
    const focusedBounds = await predecessorInput.boundingBox();
    expect(focusedBounds!.x).toBe(idleBounds!.x);
    expect(focusedBounds!.width).toBeLessThanOrEqual(cellBounds!.width);
    expect(focusedBounds!.width).toBeLessThanOrEqual(54);

    await predecessorInput.fill('1, 2');
    await predecessorInput.press('Enter');
    const conflictDialog = page.getByRole('alertdialog');
    await expect(conflictDialog).toBeVisible();
    await expect(conflictDialog).toContainText('Las fechas se superponen. Si aceptas');
    let saved = await (await page.request.get(`/api/projects/${id}`)).json() as { dependencies: Array<{ predecessorId: string; successorId: string }> };
    expect(saved.dependencies).toHaveLength(0);
    await conflictDialog.getByRole('button', { name: /Aceptar cambio/ }).click();
    await expect(predecessorInput).toHaveValue('1, 2');
    await expect(delivery.locator('.date-control-button').first()).toHaveAccessibleName('Inicio Entrega: 05/11/2026');
    await expect(delivery.locator('.date-control-button').nth(1)).toHaveAccessibleName('Fin Entrega: 09/11/2026');
    await expect(page.locator(`#task-bar-${taskIds[2]}`)).toHaveAttribute('aria-label', 'Entrega, 2026-11-05–2026-11-09');
    await expect(delivery.locator('.predecessor-conflict-mark')).toHaveCount(0);
    await expect(page.locator('.dependency-lines path[fill="none"]')).toHaveCount(2);
    await expect(page.locator('.save-status')).toHaveText('Guardado');
    saved = await (await page.request.get(`/api/projects/${id}`)).json() as typeof saved;
    expect(saved.dependencies).toHaveLength(2);
    expect(saved.dependencies.map((item) => item.predecessorId).sort()).toEqual(taskIds.slice(0, 2).sort());

    await predecessorInput.fill('1, 1');
    await predecessorInput.press('Enter');
    await expect(predecessorInput).toHaveAttribute('aria-invalid', 'true');
    await expect(delivery.getByRole('status')).toContainText('No repitas');
    await predecessorInput.fill('3');
    await predecessorInput.press('Enter');
    await expect(delivery.getByRole('status')).toContainText('sí misma');

    const purchase = page.locator('.task-row').filter({ has: page.getByRole('textbox', { name: 'Nombre de tarea 2' }) });
    const purchaseInput = purchase.locator('.predecessors-cell input');
    await purchaseInput.fill('3');
    await purchaseInput.press('Enter');
    await expect(page.getByRole('alertdialog')).not.toBeVisible();
    await expect(purchase.getByRole('status')).toContainText('crearía un ciclo de dependencias');
    await expect(purchaseInput).toHaveValue('3');
    await expect(purchaseInput).toHaveAttribute('aria-invalid', 'true');
    saved = await (await page.request.get(`/api/projects/${id}`)).json() as typeof saved;
    expect(saved.dependencies).toHaveLength(2);

    await predecessorInput.fill('1');
    await predecessorInput.press('Enter');
    await expect(predecessorInput).toHaveValue('1');
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.locator('.save-status')).toHaveText('Guardado');
    await expect(predecessorInput).toHaveValue('1, 2');
    await page.getByRole('button', { name: 'Rehacer' }).click();
    await expect(page.locator('.save-status')).toHaveText('Guardado');
    await expect(predecessorInput).toHaveValue('1');

    await predecessorInput.fill('');
    await predecessorInput.press('Enter');
    await expect(predecessorInput).toHaveValue('');
    await expect(page.locator('.dependency-lines path[fill="none"]')).toHaveCount(0);
    await page.reload();
    const restored = page.locator('.task-row').filter({ has: page.getByRole('textbox', { name: 'Nombre de tarea 3' }) }).locator('.predecessors-cell input');
    await expect(restored).toHaveValue('');
  } finally {
    await page.request.delete(`/api/projects/${id}`);
  }
});

test('edits predecessor numbers directly with touch on a tablet viewport', async ({ browser, page }) => {
  const name = `PRED táctil QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id, updatedAt } = await created.json() as { id: string; updatedAt: string };
  try {
    for (const taskName of ['Inicio', 'Cierre', 'Revisión']) expect((await page.request.post(`/api/projects/${id}/tasks`, { data: { name: taskName, startDate: '2026-11-01', endDate: '2026-11-03' } })).ok()).toBeTruthy();
    const taskIds = ((await (await page.request.get(`/api/projects/${id}`)).json()) as { tasks: Array<{ id: string }> }).tasks.map((task) => task.id);
    const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true });
    await context.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id, name, updatedAt }] })
      : route.continue());
    const touch = await context.newPage();
    await touch.goto('/');
    const row = touch.locator('.task-row').filter({ has: touch.getByRole('textbox', { name: 'Nombre de tarea 3' }) });
    const input = row.locator('.predecessors-cell input');
    const bounds = await input.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(54);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await touch.touchscreen.tap(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await input.fill('1, 2');
    await input.press('Enter');
    const conflictDialog = touch.getByRole('alertdialog');
    await expect(conflictDialog).toBeVisible();
    const saveResponse = touch.waitForResponse((response) => response.url().endsWith(`/api/projects/${id}/state`) && response.request().method() === 'PUT');
    await conflictDialog.getByRole('button', { name: /Aceptar cambio/ }).tap();
    expect((await saveResponse).ok()).toBeTruthy();
    await expect(input).toHaveValue('1, 2');
    await expect(row.locator('.date-control-button').first()).toHaveAccessibleName('Inicio Revisión: 04/11/2026');
    await expect(row.locator('.date-control-button').nth(1)).toHaveAccessibleName('Fin Revisión: 06/11/2026');
    await expect(touch.locator(`#task-bar-${taskIds[2]}`)).toHaveAttribute('aria-label', 'Revisión, 2026-11-04–2026-11-06');
    await expect(touch.locator('.dependency-card')).toHaveCount(0);
    const saved = await (await touch.request.get(`/api/projects/${id}`)).json() as { dependencies: Array<{ predecessorId: string; successorId: string }> };
    expect(saved.dependencies).toHaveLength(2);
    await context.close();
  } finally {
    await page.request.delete(`/api/projects/${id}`);
  }
});

test('keeps the PRED conflict confirmation in the selected English locale', async ({ page }) => {
  const name = `English PRED QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id, updatedAt } = await created.json() as { id: string; updatedAt: string };
  try {
    for (const task of [
      { name: 'Predecessor', startDate: '2026-11-01', endDate: '2026-11-02' },
      { name: 'Successor', startDate: '2026-11-02', endDate: '2026-11-04' }
    ]) expect((await page.request.post(`/api/projects/${id}/tasks`, { data: task })).ok()).toBeTruthy();
    await page.addInitScript(() => localStorage.setItem('pdr2-locale', 'en'));
    await page.route('**/api/projects', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [{ id, name, updatedAt }] })
      : route.continue());
    await page.goto('/');
    const row = page.locator('.task-row').filter({ has: page.getByRole('textbox', { name: 'Task name 2' }) });
    const input = row.locator('.predecessors-cell input');
    await input.fill('1');
    await input.press('Enter');
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('If you accept, the successor will start the day after its predecessors finish and keep its duration.');
    await expect(dialog).toContainText('Current dates');
    await expect(dialog).toContainText('Dates after accepting');
    await expect(dialog).not.toContainText(/Fechas actuales|Fechas al aceptar|Si aceptas/);
    await dialog.getByRole('button', { name: /Accept change/ }).click();
    await expect(row.locator('.date-control-button').first()).toHaveAccessibleName('Start Successor: 11/03/2026');
    await expect(row.locator('.date-control-button').nth(1)).toHaveAccessibleName('End Successor: 11/05/2026');
  } finally {
    await page.request.delete(`/api/projects/${id}`);
  }
});
