import { expect, test } from '@playwright/test';

test('requires a two-step BORRAR confirmation before permanently deleting a project', async ({
  page,
}) => {
  const name = `Project delete QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const project = (await created.json()) as { id: string; name: string };
  try {
    let visibleProjects = [{ ...project, updatedAt: new Date().toISOString() }];
    let failFirstDelete = true;
    await page.route('**/api/projects**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/projects' && request.method() === 'GET') {
        await route.fulfill({ json: visibleProjects });
      } else if (path === `/api/projects/${project.id}` && request.method() === 'DELETE') {
        if (failFirstDelete) {
          failFirstDelete = false;
          await route.fulfill({
            status: 500,
            json: {
              statusCode: 500,
              error: 'Internal Server Error',
              message: 'Error de prueba al eliminar.',
            },
          });
          return;
        }
        const response = await route.fetch();
        if (response.ok())
          visibleProjects = visibleProjects.filter((item) => item.id !== project.id);
        await route.fulfill({ response });
      } else {
        await route.continue();
      }
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await page
      .locator('.project-actions')
      .getByRole('button', { name: 'Eliminar proyecto' })
      .click();

    const dialog = page.getByRole('alertdialog', { name: 'Eliminar proyecto' });
    await expect(dialog).toContainText(name);
    await expect(dialog).toContainText('tareas, grupos, notas y dependencias');
    await expect(dialog).toContainText('no se puede deshacer');
    await expect(dialog.getByRole('button', { name: 'Eliminar proyecto' })).toHaveCount(0);
    expect((await page.request.get(`/api/projects/${project.id}`)).status()).toBe(200);

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await page
      .locator('.project-actions')
      .getByRole('button', { name: 'Eliminar proyecto' })
      .click();
    await dialog.getByRole('button', { name: 'Continuar' }).click();
    const confirmation = dialog.getByLabel('Escribe BORRAR para confirmar');
    await expect(confirmation).toBeFocused();
    const finalDelete = dialog.getByRole('button', { name: 'Eliminar proyecto' });
    await expect(finalDelete).toBeDisabled();
    await confirmation.fill('BORRAR ');
    await expect(finalDelete).toBeDisabled();
    await confirmation.fill('DELETE');
    await expect(finalDelete).toBeDisabled();
    await confirmation.fill('BORRAR');
    await expect(finalDelete).toBeEnabled();
    await finalDelete.click();
    await expect(dialog.getByRole('alert')).toHaveText('Error de prueba al eliminar.');
    await expect(dialog).toBeVisible();
    expect((await page.request.get(`/api/projects/${project.id}`)).status()).toBe(200);
    await expect(finalDelete).toBeEnabled();
    await finalDelete.click();
    await expect(dialog).toBeHidden();
    expect((await page.request.get(`/api/projects/${project.id}`)).status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: 'Crea tu primer proyecto para comenzar a planificar.' }),
    ).toBeVisible();
  } finally {
    const stillExists = await page.request.get(`/api/projects/${project.id}`);
    if (stillExists.ok()) await page.request.delete(`/api/projects/${project.id}`);
  }
});

test('shows a recoverable workspace error if refreshing projects fails after deletion', async ({
  page,
}) => {
  const name = `Project refresh error QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const project = (await created.json()) as { id: string; name: string };
  let visibleProjects = [{ ...project, updatedAt: new Date().toISOString() }];
  let failNextProjectList = false;
  await page.route('**/api/projects**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/projects' && request.method() === 'GET') {
      if (failNextProjectList) {
        failNextProjectList = false;
        await route.fulfill({
          status: 503,
          json: {
            statusCode: 503,
            error: 'Service Unavailable',
            message: 'La lista no está disponible.',
          },
        });
      } else {
        await route.fulfill({ json: visibleProjects });
      }
    } else if (path === `/api/projects/${project.id}` && request.method() === 'DELETE') {
      const response = await route.fetch();
      if (response.ok()) {
        visibleProjects = visibleProjects.filter((item) => item.id !== project.id);
        failNextProjectList = true;
      }
      await route.fulfill({ response });
    } else {
      await route.continue();
    }
  });
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await page
      .locator('.project-actions')
      .getByRole('button', { name: 'Eliminar proyecto' })
      .click();
    const dialog = page.getByRole('alertdialog', { name: 'Eliminar proyecto' });
    await dialog.getByRole('button', { name: 'Continuar' }).click();
    await dialog.getByLabel('Escribe BORRAR para confirmar').fill('BORRAR');
    await dialog.getByRole('button', { name: 'Eliminar proyecto' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name, exact: true })).toBeHidden();
    await expect(page.locator('.startup-error code')).toHaveText('La lista no está disponible.');
    expect((await page.request.get(`/api/projects/${project.id}`)).status()).toBe(404);
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(
      page.getByRole('heading', { name: 'Crea tu primer proyecto para comenzar a planificar.' }),
    ).toBeVisible();
  } finally {
    const stillExists = await page.request.get(`/api/projects/${project.id}`);
    if (stillExists.ok()) await page.request.delete(`/api/projects/${project.id}`);
  }
});

test('supports the project deletion flow with touch-sized targets on a tablet', async ({
  browser,
}) => {
  const name = `Project delete tablet QA ${Date.now()}`;
  const baseURL = process.env.PLAYWRIGHT_BASE_URL!;
  const response = await fetch(`${baseURL}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const project = (await response.json()) as { id: string; name: string };
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    isMobile: true,
    hasTouch: true,
    baseURL,
  });
  try {
    let visibleProjects = [{ ...project, updatedAt: new Date().toISOString() }];
    await context.route('**/api/projects**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/projects' && request.method() === 'GET') {
        await route.fulfill({ json: visibleProjects });
      } else if (path === `/api/projects/${project.id}` && request.method() === 'DELETE') {
        const response = await route.fetch();
        if (response.ok())
          visibleProjects = visibleProjects.filter((item) => item.id !== project.id);
        await route.fulfill({ response });
      } else {
        await route.continue();
      }
    });
    const page = await context.newPage();
    await page.goto('/');
    const trigger = page
      .locator('.project-actions')
      .getByRole('button', { name: 'Eliminar proyecto' });
    const triggerBounds = await trigger.boundingBox();
    expect(triggerBounds!.width).toBeGreaterThanOrEqual(44);
    expect(triggerBounds!.height).toBeGreaterThanOrEqual(44);
    await page.touchscreen.tap(
      triggerBounds!.x + triggerBounds!.width / 2,
      triggerBounds!.y + triggerBounds!.height / 2,
    );
    const dialog = page.getByRole('alertdialog', { name: 'Eliminar proyecto' });
    const closeButton = dialog.getByRole('button', { name: 'Cerrar' });
    const closeBounds = await closeButton.boundingBox();
    expect(closeBounds!.width).toBeGreaterThanOrEqual(44);
    expect(closeBounds!.height).toBeGreaterThanOrEqual(44);
    await page.touchscreen.tap(
      closeBounds!.x + closeBounds!.width / 2,
      closeBounds!.y + closeBounds!.height / 2,
    );
    await expect(dialog).toBeHidden();
    await page.touchscreen.tap(
      triggerBounds!.x + triggerBounds!.width / 2,
      triggerBounds!.y + triggerBounds!.height / 2,
    );
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Continuar' }).click();
    const confirmInput = dialog.getByLabel('Escribe BORRAR para confirmar');
    const inputBounds = await confirmInput.boundingBox();
    expect(inputBounds!.height).toBeGreaterThanOrEqual(40);
    await confirmInput.fill('BORRAR');
    const finalDelete = dialog.getByRole('button', { name: 'Eliminar proyecto' });
    const deleteBounds = await finalDelete.boundingBox();
    expect(deleteBounds!.width).toBeGreaterThanOrEqual(44);
    expect(deleteBounds!.height).toBeGreaterThanOrEqual(44);
    await page.touchscreen.tap(
      deleteBounds!.x + deleteBounds!.width / 2,
      deleteBounds!.y + deleteBounds!.height / 2,
    );
    await expect(dialog).toBeHidden();
    expect((await page.request.get(`/api/projects/${project.id}`)).status()).toBe(404);
  } finally {
    await context.close();
    const stillExists = await fetch(`${baseURL}/api/projects/${project.id}`);
    if (stillExists.ok) await fetch(`${baseURL}/api/projects/${project.id}`, { method: 'DELETE' });
  }
});
