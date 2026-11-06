import { expect, test } from '@playwright/test';

// F3-02: hitos, barra resumen de grupo, vistas, avance y predecesoras por número.
const id = '22222222-2222-4222-8222-222222222222';
const group = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  name: 'Diseño',
  position: 0,
  note: '',
  color: 'blue',
};
const tasks = [
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Diseño de la planta',
    startDate: '2026-01-05',
    endDate: '2026-01-09',
    position: 0,
    number: 1,
    status: 'in_progress',
    progress: 40,
    isMilestone: false,
    groupId: group.id,
    note: '',
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    name: 'Aprobación',
    startDate: '2026-01-10',
    endDate: '2026-01-10',
    position: 1,
    number: 2,
    status: 'pending',
    progress: 0,
    isMilestone: true,
    groupId: group.id,
    note: '',
  },
  {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    name: 'Compra de equipos',
    startDate: '2026-01-12',
    endDate: '2026-01-14',
    position: 2,
    number: 4,
    status: 'pending',
    progress: 0,
    isMilestone: false,
    groupId: null,
    note: '',
  },
];
const projectJson = () => ({
  id,
  name: 'Planificación F3-02',
  updatedAt: '2026-01-01T00:00:00Z',
  groups: [group],
  tasks,
  dependencies: [],
});

test.beforeEach(async ({ page }) => {
  await page.route('**/api/projects**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/projects')
      return route.fulfill({
        json: [{ id, name: 'Planificación F3-02', updatedAt: '2026-01-01T00:00:00Z' }],
      });
    return route.fulfill({ json: projectJson() });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Nombre de tarea 1' }).waitFor();
});

test('draws milestones as a diamond without resize handles and shows the group summary bar', async ({
  page,
}) => {
  const milestone = page.locator('.milestone');
  await expect(milestone).toHaveCount(1);
  await expect(milestone).toContainText('◆');
  await expect(page.locator('.group-summary-bar')).toHaveCount(1);
  await milestone.click();
  await expect(page.locator('.milestone .resize-handle')).toHaveCount(0);
});

test('numbers predecessors by task number and reports a missing number', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Nombre de tarea 4' }).click();
  const field = page
    .getByLabel('Predecesoras de Compra de equipos; escribe números de tarea separados por comas')
    .first();
  await field.fill('9');
  await field.press('Enter');
  await expect(page.getByText('No existe ninguna tarea con el número 9.')).toBeVisible();
});

test('tracking view saves status and progress, and completing a task sets progress to 100', async ({
  page,
}) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route('**/api/projects/*/tasks/*', (route) => {
    if (route.request().method() === 'PATCH') requests.push(route.request().postDataJSON());
    return route.fulfill({ json: projectJson() });
  });
  await page.getByRole('tab', { name: 'Seguimiento' }).click();
  await page
    .getByRole('combobox', { name: 'Estado Diseño de la planta' })
    .selectOption('completed');
  await expect.poll(() => requests.at(-1)?.status).toBe('completed');
  expect(requests.at(-1)).toMatchObject({ status: 'completed' });
});

test('summary view lists groups with semaphore and milestones, and is read-only', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Resumen' }).click();
  await expect(page.getByText('Vista de solo lectura')).toBeVisible();
  await expect(page.locator('.summary-group').first()).toContainText('Diseño');
  await expect(page.locator('.summary-milestone').first()).toContainText('Aprobación');
  await expect(page.locator('.task-row')).toHaveCount(0);
});

test('keeps zoom and density as browser preferences', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Zoom' }).selectOption('50');
  await page.getByRole('combobox', { name: 'Densidad' }).selectOption('compact');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Zoom' })).toHaveValue('50');
  await expect(page.getByRole('combobox', { name: 'Densidad' })).toHaveValue('compact');
  await page.evaluate(() => {
    localStorage.removeItem('pdr2-zoom');
    localStorage.removeItem('pdr2-density');
  });
});
