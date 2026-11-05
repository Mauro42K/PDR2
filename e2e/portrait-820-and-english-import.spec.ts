import { expect, test } from '@playwright/test';

test.setTimeout(60000);

test('keeps row action menus inside a 820×1180 portrait viewport without horizontal overflow', async ({ page }) => {
  const name = `Portrait 820 QA ${crypto.randomUUID()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id } = await created.json() as { id: string };
  try {
    const groupId = crypto.randomUUID();
    const tasks = Array.from({ length: 6 }, (_, index) => ({ id: crypto.randomUUID(), name: `Tarea con nombre largo para portrait ${index + 1}`, startDate: '2026-11-01', endDate: `2026-11-0${index + 2}`, position: index, number: index + 1, status: 'pending', progress: 0, isMilestone: false, groupId: index < 4 ? groupId : null, note: '' }));
    const seeded = await (await page.request.get(`/api/projects/${id}`)).json() as Record<string, unknown>;
    expect((await page.request.put(`/api/projects/${id}/state`, { data: { ...seeded, groups: [{ id: groupId, name: 'Fase de portrait', position: 0, note: '', color: null }], tasks, dependencies: [] } })).ok()).toBeTruthy();
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto('/');
    const openProjects = page.getByRole('button', { name: 'Proyectos', exact: true });
    if (await openProjects.isVisible()) await openProjects.click();
    await page.locator('.project-nav:visible').filter({ hasText: name }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    for (const index of [0, 5]) {
      const row = page.locator('.task-row').nth(index);
      const menu = row.locator('details.task-actions summary');
      await menu.click({ timeout: 5000 });
      const content = row.locator('.row-actions-content');
      await expect(content).toBeVisible();
      const box = await content.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(820);
      await page.keyboard.press('Escape');
    }
  } finally {
    await page.request.delete(`/api/projects/${id}`);
  }
});

test('shows English import choices and a localized error for an invalid file', async ({ page }) => {
  const name = `English import QA ${crypto.randomUUID()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id } = await created.json() as { id: string };
  try {
    await page.addInitScript(() => localStorage.setItem('pdr2-locale', 'en'));
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    await page.locator('.projects-button').click();
    await page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Import JSON' }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'roto.json', mimeType: 'application/json', buffer: Buffer.from('{ esto no es json') });
    await expect(page.getByRole('alert').filter({ hasText: 'The file is invalid or unsupported.' }).first()).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Import project' })).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/projects/${id}`);
  }
});
