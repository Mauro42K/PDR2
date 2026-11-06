import { expect, test } from '@playwright/test';

test('drags the task column divider like a spreadsheet column and resets it', async ({ page }) => {
  const id = '22222222-2222-4222-8222-222222222222';
  const task = {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    name: 'Manufacturing/Assy Start Project (Critical) con un nombre muy largo',
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
  const project = {
    id,
    name: 'Ancho de columna',
    updatedAt: '2026-01-01T00:00:00Z',
    groups: [],
    tasks: [task],
    dependencies: [],
  };
  await page.route('**/api/projects**', (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).pathname === '/api/projects'
          ? [{ id, name: project.name, updatedAt: project.updatedAt }]
          : project,
    }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const cell = page.locator('.task-row .task-title-cell').first();
  const handle = page.getByRole('separator', { name: /Ancho de la columna de tareas/ });
  await expect(handle).toBeVisible();
  const automatic = (await cell.boundingBox())!.width;

  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  const dragged = (await cell.boundingBox())!.width;
  expect(dragged).toBeGreaterThan(automatic + 60);

  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  expect((await cell.boundingBox())!.width).toBeLessThan(dragged);

  await handle.dblclick();
  expect(Math.abs((await cell.boundingBox())!.width - automatic)).toBeLessThan(2);
});
