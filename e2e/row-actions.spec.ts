import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });

test('keeps row names stable and exposes 44px actions to mouse, keyboard and touch', async ({
  page,
}) => {
  const id = '11111111-1111-4111-8111-111111111111';
  const group = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Grupo de prueba',
    position: 0,
    note: 'Nota del grupo',
  };
  const task = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Una tarea de planificación con un nombre bastante largo',
    startDate: '2026-01-01',
    endDate: '2026-01-03',
    position: 0,
    number: 1,
    status: 'pending',
    progress: 0,
    isMilestone: false,
    groupId: group.id,
    note: 'Nota de prueba',
  };
  const project = {
    id,
    name: 'Filas aisladas',
    updatedAt: '2026-01-01T00:00:00Z',
    groups: [group],
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
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  const name = page.getByRole('textbox', { name: 'Nombre de tarea 1' });
  const trigger = page.getByLabel(`Acciones de tarea: ${task.name}`);
  await expect(name).toBeVisible();
  await expect(page.getByRole('button', { name: `Nota de tarea: ${task.name}` })).toBeVisible();
  await expect(page.getByRole('button', { name: `Nota del grupo: ${group.name}` })).toBeVisible();
  const noteButton = page.getByRole('button', { name: `Nota de tarea: ${task.name}` });
  const noteButtonBounds = await noteButton.boundingBox();
  expect(noteButtonBounds!.width).toBeGreaterThanOrEqual(44);
  expect(noteButtonBounds!.height).toBeGreaterThanOrEqual(44);
  expect(await name.evaluate((element) => getComputedStyle(element).paddingRight)).toBe('44px');
  expect(
    await page
      .locator('.group-toolbar > button:first-child')
      .evaluate((element) => getComputedStyle(element).paddingRight),
  ).toBe('52px');
  await noteButton.tap();
  const tapNote = page.getByRole('dialog', { name: `Nota · ${task.name}` });
  await expect(tapNote).toBeVisible();
  await tapNote.locator('.modal-actions').getByRole('button', { name: 'Cerrar' }).click();
  const groupNoteButton = page.getByRole('button', { name: `Nota del grupo: ${group.name}` });
  const groupNoteBounds = await groupNoteButton.boundingBox();
  expect(groupNoteBounds!.width).toBeGreaterThanOrEqual(44);
  expect(groupNoteBounds!.height).toBeGreaterThanOrEqual(44);
  await groupNoteButton.tap();
  const tapGroupNote = page.getByRole('dialog', { name: `Nota · ${group.name}` });
  await expect(tapGroupNote).toBeVisible();
  await tapGroupNote.locator('.modal-actions').getByRole('button', { name: 'Cerrar' }).click();
  const initial = await name.boundingBox();
  await name.hover();
  expect((await name.boundingBox())!.width).toBe(initial!.width);
  await name.focus();
  expect((await name.boundingBox())!.width).toBe(initial!.width);
  const bounds = await trigger.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  const groupTrigger = page.getByLabel('Opciones del grupo: Grupo de prueba');
  const groupBounds = await groupTrigger.boundingBox();
  expect(groupBounds!.width).toBeGreaterThanOrEqual(44);
  expect(groupBounds!.height).toBeGreaterThanOrEqual(44);
  await trigger.tap();
  const menu = page.locator('.task-actions[open]');
  await expect(menu.locator('.row-actions-title')).toHaveText(task.name);
  await expect(menu.getByLabel(`Grupo de ${task.name}`)).toBeVisible();
  await menu.getByRole('button', { name: 'Ver o editar nota' }).click();
  const note = page.getByRole('dialog', { name: `Nota · ${task.name}` });
  await expect(note).toBeVisible();
  await note.locator('.modal-actions').getByRole('button', { name: 'Cerrar' }).click();
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await expect(menu).toBeVisible();
  await trigger.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.tap();
  await page.locator('.task-actions[open]').getByRole('button', { name: 'Eliminar tarea' }).click();
  const confirm = page.getByRole('dialog', { name: 'Eliminar tarea' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(trigger).toBeFocused();
  await page.evaluate(() => localStorage.setItem('pdr2-locale', 'en'));
  await page.reload();
  const englishTrigger = page.getByLabel(`Task actions: ${task.name}`);
  await englishTrigger.tap();
  await expect(
    page.locator('.task-actions[open]').getByRole('button', { name: 'View or edit note' }),
  ).toBeVisible();
});
