import { expect, test } from '@playwright/test';

const id = '11111111-1111-4111-8111-111111111111';
const first = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Diseño de la planta',
  startDate: '2026-01-05',
  endDate: '2026-01-09',
  position: 0,
  number: 1,
  status: 'pending',
  progress: 0,
  isMilestone: false,
  groupId: null,
  note: '',
};
const second = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  name: 'Compra de equipos',
  startDate: '2026-01-12',
  endDate: '2026-01-14',
  position: 1,
  number: 2,
  status: 'pending',
  progress: 0,
  isMilestone: false,
  groupId: null,
  note: '',
};

function projectJson(tasks: (typeof first)[]) {
  return {
    id,
    name: 'Panel de detalle',
    updatedAt: '2026-01-01T00:00:00Z',
    groups: [],
    tasks,
    dependencies: [],
  };
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/projects**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/projects')
      return route.fulfill({
        json: [{ id, name: 'Panel de detalle', updatedAt: '2026-01-01T00:00:00Z' }],
      });
    if (route.request().method() === 'PATCH')
      return route.fulfill({
        json: projectJson([{ ...first, name: 'Diseño final de la planta' }, second]),
      });
    return route.fulfill({ json: projectJson([first, second]) });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
});

test('opens the detail panel from a row and closes it without changing the project', async ({
  page,
}) => {
  await expect(page.locator('.task-detail')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Nombre de tarea 1' }).click();
  const panel = page.locator('.task-detail');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Nombre de la tarea' })).toHaveValue(first.name);
  await expect(panel.locator('.task-detail-duration')).toHaveText('5 días');
  await panel.getByRole('button', { name: 'Cerrar detalle' }).click();
  await expect(page.locator('.task-detail')).toHaveCount(0);
});

test('renames the selected task from the panel and saves on blur', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Nombre de tarea 1' }).click();
  const input = page.locator('.task-detail').getByRole('textbox', { name: 'Nombre de la tarea' });
  const saved = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().includes(`/tasks/${first.id}`),
  );
  await input.fill('Diseño final de la planta');
  await input.press('Enter');
  const request = await saved;
  expect(request.postDataJSON()).toMatchObject({
    name: 'Diseño final de la planta',
    startDate: first.startDate,
    endDate: first.endDate,
  });
});

test('Escape in the name field restores the saved name', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Nombre de tarea 1' }).click();
  const input = page.locator('.task-detail').getByRole('textbox', { name: 'Nombre de la tarea' });
  await input.fill('Nombre sin guardar');
  await input.press('Escape');
  await expect(input).toHaveValue(first.name);
});

test('the delete action in the panel opens the confirmation for the selected task', async ({
  page,
}) => {
  await page.getByRole('textbox', { name: 'Nombre de tarea 2' }).click();
  await page.locator('.task-detail').getByRole('button', { name: 'Eliminar tarea' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: second.name })).toBeVisible();
});
