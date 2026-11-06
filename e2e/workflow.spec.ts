import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

let projectName = '';
test.afterEach(async ({ page }) => {
  if (!projectName) return;
  const response = await page.request.get('/api/projects');
  const items = (await response.json()) as Array<{ id: string; name: string }>;
  for (const item of items.filter(
    (x) => x.name === projectName || x.name.startsWith(`${projectName} `),
  ))
    await page.request.delete(`/api/projects/${item.id}`);
  projectName = '';
});

test('create project, add scheduled tasks, connect dependency and export JSON', async ({
  page,
}) => {
  let visibleProjects: Array<{ id: string; name: string; updatedAt: string }> = [];
  await page.route('**/api/projects**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/projects' && request.method() === 'GET') {
      await route.fulfill({ json: visibleProjects });
    } else if (
      (path === '/api/projects' || path === '/api/projects/import') &&
      request.method() === 'POST'
    ) {
      const response = await route.fetch();
      const created = (await response.json()) as { id: string; name: string; updatedAt: string };
      if (response.ok())
        visibleProjects = [
          ...visibleProjects,
          { id: created.id, name: created.name, updatedAt: created.updatedAt },
        ];
      await route.fulfill({ response });
    } else {
      await route.continue();
    }
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Crea tu primer proyecto para comenzar a planificar.' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: /Nuevo proyecto/ })
    .first()
    .click();
  projectName = `QA ${Date.now()}`;
  await page.getByLabel('Nombre del proyecto').fill(projectName);
  await page.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('heading', { name: projectName, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ Tarea' }).click();
  let taskDialog = page.getByRole('dialog', { name: 'Nueva tarea' });
  let createTaskName = taskDialog.getByPlaceholder('Agregar tarea');
  await createTaskName.fill('Diseño');
  await expect(createTaskName).toHaveValue('Diseño');
  await expect(taskDialog.getByRole('button', { name: 'Agregar tarea' })).toBeEnabled();
  await taskDialog.getByRole('button', { name: 'Agregar tarea' }).click();
  await expect(page.getByRole('button', { name: /Diseño,/ })).toBeVisible();
  await page.getByRole('button', { name: '+ Tarea' }).click();
  taskDialog = page.getByRole('dialog', { name: 'Nueva tarea' });
  createTaskName = taskDialog.getByPlaceholder('Agregar tarea');
  await createTaskName.fill('Construcción');
  await expect(createTaskName).toHaveValue('Construcción');
  await expect(taskDialog.getByRole('button', { name: 'Agregar tarea' })).toBeEnabled();
  await taskDialog.getByRole('button', { name: 'Agregar tarea' }).click();
  await expect(page.getByRole('button', { name: /Construcción,/ })).toBeVisible();
  const constructionRow = page
    .locator('.task-row')
    .filter({ has: page.getByRole('textbox', { name: 'Nombre de tarea 2' }) });
  const predecessors = constructionRow.locator('.predecessors-cell input');
  await predecessors.fill('1');
  await predecessors.press('Enter');
  await expect(predecessors).toHaveValue('1');
  // New tasks may share dates, so the PRED edit can require explicit conflict
  // acceptance before the relationship is persisted and its line is rendered.
  const conflict = page.getByRole('alertdialog');
  if (await conflict.count())
    await conflict.getByRole('button', { name: /Aceptar cambio/ }).click();
  await expect(page.locator('.save-status')).toHaveText('Guardado');
  await expect(page.locator('.dependency-lines path[fill="none"]')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Nombre de tarea 1' })).toHaveValue('Diseño');
  await expect(page.getByRole('textbox', { name: 'Nombre de tarea 2' })).toHaveValue(
    'Construcción',
  );
  await expect(
    page
      .locator('.task-row')
      .filter({ has: page.getByRole('textbox', { name: 'Nombre de tarea 2' }) })
      .locator('.predecessors-cell input'),
  ).toHaveValue('1');
  const projects = (await (await page.request.get('/api/projects')).json()) as Array<{
    id: string;
    name: string;
  }>;
  const current = (await (
    await page.request.get(
      `/api/projects/${projects.find((item) => item.name === projectName)!.id}`,
    )
  ).json()) as { tasks: Array<{ startDate: string }> };
  const storedDate = current.tasks[0].startDate;
  await page.getByRole('button', { name: 'Ajustes' }).first().click();
  const language = page.getByLabel('Idioma');
  await language.selectOption('en');
  await expect(page.locator('.task-row .date-control-value').first()).toHaveText(
    new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${storedDate}T00:00:00Z`)),
  );
  await page.getByLabel('Language').selectOption('es');
  await expect(page.locator('.task-row .date-control-value').first()).toHaveText(
    new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${storedDate}T00:00:00Z`)),
  );
  await page
    .locator('#settings-dialog')
    .evaluate((element) => (element as HTMLDialogElement).close());
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('.pdr2.json');
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8')) as unknown;
  await page.getByRole('button', { name: 'Importar JSON' }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'plan.pdr2.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.getByRole('dialog', { name: 'Importar proyecto' })).toBeVisible();
  await page.getByRole('button', { name: 'Crear una copia' }).click();
  await expect(page.getByRole('heading', { name: `${projectName} (copia)` })).toBeVisible();
});

test('manages incoming dependencies per task, validates cycles and restores changes', async ({
  page,
}) => {
  const created = await page.request.post('/api/projects', {
    data: { name: `Predecesoras QA ${Date.now()}` },
  });
  const { id, name, updatedAt } = (await created.json()) as {
    id: string;
    name: string;
    updatedAt: string;
  };
  try {
    for (const [taskName, startDate, endDate] of [
      ['Diseño', '2026-01-01', '2026-01-02'],
      ['Compra', '2026-01-02', '2026-01-05'],
      ['Entrega', '2026-01-04', '2026-01-08'],
    ]) {
      const response = await page.request.post(`/api/projects/${id}/tasks`, {
        data: { name: taskName, startDate, endDate },
      });
      expect(response.ok()).toBeTruthy();
    }
    await page.route('**/api/projects', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: [{ id, name, updatedAt }] })
        : route.continue(),
    );
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    const trigger = page.getByLabel('Acciones de tarea: Entrega');
    await trigger.click();
    const menu = page.locator('.task-actions[open]');
    await menu.getByRole('button', { name: /Predecesoras/ }).click();
    const panel = menu.locator('.row-actions-content');
    const bounds = await panel.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(768);
    const selector = menu.getByLabel('Predecesora para Entrega');
    await selector.selectOption({ label: '#1 · Diseño · Sin grupo' });
    await menu.getByRole('button', { name: 'Conectar', exact: true }).click();
    await expect(
      menu.getByRole('button', {
        name: 'Quitar predecesora: #1 · Diseño · Sin grupo → #3 · Entrega · Sin grupo',
      }),
    ).toBeVisible();
    await expect(selector.locator('option', { hasText: 'Diseño' })).toHaveAttribute('disabled', '');
    await selector.selectOption({ label: '#2 · Compra · Sin grupo' });
    await expect(menu.getByRole('status')).toContainText('superponen');
    await menu.getByRole('button', { name: 'Conectar', exact: true }).click();
    await expect(
      menu.getByRole('button', {
        name: 'Quitar predecesora: #2 · Compra · Sin grupo → #3 · Entrega · Sin grupo',
      }),
    ).toBeVisible();
    await menu
      .getByRole('button', {
        name: 'Quitar predecesora: #1 · Diseño · Sin grupo → #3 · Entrega · Sin grupo',
      })
      .click();
    await expect(
      menu.getByRole('button', {
        name: 'Quitar predecesora: #1 · Diseño · Sin grupo → #3 · Entrega · Sin grupo',
      }),
    ).toHaveCount(0);
    await expect(page.locator('.save-status')).toHaveText('Guardado');
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByRole('button', { name: 'Rehacer' })).toBeEnabled();
    await trigger.click();
    await page
      .locator('.task-actions[open]')
      .getByRole('button', { name: /Predecesoras/ })
      .click();
    await expect(
      page.locator('.task-actions[open]').getByRole('button', {
        name: 'Quitar predecesora: #1 · Diseño · Sin grupo → #3 · Entrega · Sin grupo',
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Rehacer' }).click();
    await trigger.click();
    await page
      .locator('.task-actions[open]')
      .getByRole('button', { name: /Predecesoras/ })
      .click();
    await expect(
      page.locator('.task-actions[open]').getByRole('button', {
        name: 'Quitar predecesora: #1 · Diseño · Sin grupo → #3 · Entrega · Sin grupo',
      }),
    ).toHaveCount(0);
    await page
      .locator('.task-actions[open]')
      .getByLabel('Predecesora para Entrega')
      .selectOption({ label: '#1 · Diseño · Sin grupo' });
    await page.mouse.click(2, 2);
    await trigger.click();
    await expect(
      page.locator('.task-actions[open]').getByRole('button', { name: /Predecesoras/ }),
    ).toHaveAttribute('aria-expanded', 'false');
    await page
      .locator('.task-actions[open]')
      .getByRole('button', { name: /Predecesoras/ })
      .click();
    await expect(
      page.locator('.task-actions[open]').getByLabel('Predecesora para Entrega'),
    ).toHaveValue('');
    // The expanded row menu can cover the next task's action trigger. Close it
    // with an unobscured outside click before opening another row's menu.
    await page.locator('.editor-footer').click();
    await expect(page.locator('.task-actions[open]')).toHaveCount(0);
    await page.getByLabel('Acciones de tarea: Compra').click();
    const other = page.locator('.task-actions[open]');
    await other.getByRole('button', { name: /Predecesoras/ }).click();
    await other
      .getByLabel('Predecesora para Compra')
      .selectOption({ label: '#3 · Entrega · Sin grupo' });
    await other.getByRole('button', { name: 'Conectar', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'ciclo' })).toBeVisible();
    await expect(other.getByLabel('Predecesora para Compra')).not.toHaveValue('');
    await page.reload();
    await page.getByLabel('Acciones de tarea: Entrega').click();
    await page
      .locator('.task-actions[open]')
      .getByRole('button', { name: /Predecesoras/ })
      .click();
    await expect(
      page.locator('.task-actions[open]').getByRole('button', {
        name: 'Quitar predecesora: #2 · Compra · Sin grupo → #3 · Entrega · Sin grupo',
      }),
    ).toBeVisible();
  } finally {
    await page.request.delete(`/api/projects/${id}`);
  }
});
