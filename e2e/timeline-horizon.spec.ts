import { expect, test } from '@playwright/test';

test('keeps a multi-year timeline and month heading usable at its far end', async ({ page }) => {
  const id = '11111111-1111-4111-8111-111111111111';
  const tasks = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Inicio',
      startDate: '2026-01-01',
      endDate: '2026-01-01',
      position: 0,
      number: 1,
      status: 'pending',
      progress: 0,
      isMilestone: false,
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Final',
      startDate: '2028-01-01',
      endDate: '2028-01-03',
      position: 1,
      number: 2,
      status: 'pending',
      progress: 0,
      isMilestone: false,
    },
  ];
  const project = {
    id,
    name: 'Horizonte aislado',
    updatedAt: '2026-01-01T00:00:00Z',
    groups: [],
    tasks,
    dependencies: [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        predecessorId: tasks[0].id,
        successorId: tasks[1].id,
      },
    ],
  };
  await page.route('**/api/projects**', (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).pathname === '/api/projects'
          ? [{ id, name: project.name, updatedAt: project.updatedAt }]
          : project,
    }),
  );
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  const scroller = page.locator('.timeline-scroll');
  const bar = page.getByRole('button', { name: /Final, 2028-01-01/ });
  await expect(bar).toBeVisible();
  await scroller.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  const month = page
    .locator('.timeline-month-segment')
    .filter({ hasText: /ene.*2028/i })
    .locator('span');
  await expect(month).toBeVisible();
  const bounds = await scroller.boundingBox();
  const monthBounds = await month.boundingBox();
  const barBounds = await bar.boundingBox();
  expect(bounds && monthBounds && barBounds).toBeTruthy();
  expect(monthBounds!.x).toBeGreaterThanOrEqual(bounds!.x);
  expect(monthBounds!.x + monthBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  expect(barBounds!.x + barBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  expect(await page.locator('.timeline-days > div').count()).toBeLessThan(120);
});

test('navigates an extreme horizon without exceeding browser canvas limits', async ({ page }) => {
  const id = '11111111-1111-4111-8111-111111111111';
  const tasks = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Inicio remoto',
      startDate: '0001-01-01',
      endDate: '0001-01-02',
      position: 0,
      number: 1,
      status: 'pending',
      progress: 0,
      isMilestone: false,
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Final remoto',
      startDate: '9999-01-01',
      endDate: '9999-01-03',
      position: 1,
      number: 2,
      status: 'pending',
      progress: 0,
      isMilestone: false,
    },
    {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      name: 'Tarea extensa',
      startDate: '0001-01-01',
      endDate: '9999-01-03',
      position: 2,
      number: 3,
      status: 'pending',
      progress: 0,
      isMilestone: false,
    },
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      name: 'Año noventa y nueve',
      startDate: '0099-02-01',
      endDate: '0099-02-02',
      position: 3,
      number: 4,
      status: 'pending',
      progress: 0,
      isMilestone: false,
    },
  ];
  const project = {
    id,
    name: 'Extremos aislados',
    updatedAt: '2026-01-01T00:00:00Z',
    groups: [],
    tasks,
    dependencies: [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        predecessorId: tasks[0].id,
        successorId: tasks[1].id,
      },
    ],
  };
  await page.route('**/api/projects**', (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).pathname === '/api/projects'
          ? [{ id, name: project.name, updatedAt: project.updatedAt }]
          : project,
    }),
  );
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  const nav = page.getByLabel('Navegación del cronograma extenso');
  await expect(nav).toBeVisible();
  await expect(page.getByRole('button', { name: /Inicio remoto, 0001/ })).toBeVisible();
  await expect(page.locator('.dependency-lines > path')).not.toHaveAttribute(
    'marker-end',
    'url(#arrow)',
  );
  await nav.getByLabel('Ir a fecha').fill('0099-02-01');
  await expect(page.getByRole('button', { name: /Año noventa y nueve, 0099/ })).toBeVisible();
  await expect(page.locator('.timeline-months')).toContainText(/feb.*99/i);
  await nav.getByLabel('Ir a fecha').fill('9999-01-01');
  const last = page.getByRole('button', { name: /Final remoto, 9999/ });
  await expect(last).toBeVisible();
  const bounds = await page.locator('.timeline-scroll').boundingBox();
  const bar = await last.boundingBox();
  expect(bar!.x).toBeGreaterThanOrEqual(bounds!.x);
  expect(bar!.x + bar!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  expect(await page.locator('.timeline-scroll').evaluate((e) => e.scrollWidth)).toBeLessThanOrEqual(
    680000,
  );
  const longBar = page.getByRole('button', { name: /Tarea extensa, 0001/ });
  await expect(longBar).toBeVisible();
  expect(await longBar.evaluate((e) => e.getBoundingClientRect().width)).toBeLessThanOrEqual(
    680000,
  );
  await expect(page.locator('.dependency-lines > path')).toHaveAttribute(
    'marker-end',
    'url(#arrow)',
  );
  await nav.getByRole('button', { name: '← Anterior' }).click();
  const lastSegment = await nav.locator('span').innerText();
  expect(lastSegment).not.toMatch(/^Tramo 1 de/);
  await nav.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(nav.getByRole('button', { name: 'Siguiente →' })).toBeDisabled();
  await nav.getByLabel('Ir a fecha').fill('0001-01-01');
  await expect(page.getByRole('button', { name: /Inicio remoto, 0001/ })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('pdr2-locale', 'en'));
  await page.reload();
  const englishNav = page.getByLabel('Long timeline navigation');
  await expect(englishNav).toBeVisible();
  await englishNav.getByRole('button', { name: 'Next →' }).focus();
  await page.keyboard.press('Enter');
  await expect(englishNav.locator('[aria-live]')).toContainText('Segment 2 of');
  await englishNav.getByLabel('Go to date').fill('0099-02-01');
  await expect(page.locator('.timeline-months')).toContainText(/feb.*99/i);
});

test('removes per-bar chain controls while keeping task bars and long-horizon navigation', async ({
  page,
}) => {
  const id = '11111111-1111-4111-8111-111111111111';
  const tasks = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Origen remoto',
      startDate: '0001-01-01',
      endDate: '0001-01-02',
      position: 0,
      number: 1,
      status: 'pending',
      progress: 0,
      isMilestone: false,
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Destino remoto',
      startDate: '9999-01-01',
      endDate: '9999-01-03',
      position: 1,
      number: 2,
      status: 'pending',
      progress: 0,
      isMilestone: false,
    },
  ];
  const project = {
    id,
    name: 'Conexión aislada',
    updatedAt: '2026-01-01T00:00:00Z',
    groups: [],
    tasks,
    dependencies: [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        predecessorId: tasks[0].id,
        successorId: tasks[1].id,
      },
    ],
  };
  await page.route('**/api/projects**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/projects' && request.method() === 'GET')
      return route.fulfill({ json: [{ id, name: project.name, updatedAt: project.updatedAt }] });
    return route.fulfill({ json: project });
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  await expect(page.locator('.dependency-start')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Origen remoto, 0001/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Destino remoto, 9999/ })).toHaveCount(0);
  await expect(page.locator('.dependency-lines path[fill="none"]')).toHaveCount(1);
  const nav = page.getByLabel('Navegación del cronograma extenso');
  await nav.getByLabel('Ir a fecha').fill('9999-01-01');
  await expect(nav.locator('[aria-live]')).toContainText(/tramo/i);
  await expect(page.getByRole('button', { name: /Destino remoto, 9999/ })).toBeVisible();
  await expect(page.locator('.dependency-lines path[fill="none"]')).toHaveCount(1);
});
