import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
]) {
  test(`creates a group and a task from touch controls at ${viewport.width}×${viewport.height}`, async ({
    page,
    browser,
  }) => {
    const name = `iPad punto 07 QA ${Date.now()}`;
    const created = await page.request.post('/api/projects', { data: { name } });
    const project = (await created.json()) as { id: string; name: string };
    const context = await browser.newContext({
      viewport,
      hasTouch: true,
      baseURL: process.env.PLAYWRIGHT_BASE_URL,
    });
    // On an iPad opened through the Mac's private HTTP address Safari reports
    // an insecure context and does not expose crypto.randomUUID(). Simulate that
    // exact API difference while keeping the isolated E2E server reachable.
    await context.addInitScript(() => {
      Object.defineProperty(Crypto.prototype, 'randomUUID', {
        configurable: true,
        value: undefined,
      });
    });

    try {
      await context.route('**/api/projects', (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({ json: [{ id: project.id, name, updatedAt: new Date().toISOString() }] })
          : route.continue(),
      );
      const touchPage = await context.newPage();
      await touchPage.goto('/');
      expect(await touchPage.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
      expect(await touchPage.evaluate(() => typeof crypto.getRandomValues)).toBe('function');

      const addGroup = touchPage.getByRole('button', { name: '+ Grupo' });
      const addGroupBounds = await addGroup.boundingBox();
      expect(addGroupBounds!.width).toBeGreaterThanOrEqual(44);
      expect(addGroupBounds!.height).toBeGreaterThanOrEqual(44);
      await touchPage.touchscreen.tap(
        addGroupBounds!.x + addGroupBounds!.width / 2,
        addGroupBounds!.y + addGroupBounds!.height / 2,
      );

      const groupDialog = touchPage.getByRole('dialog', { name: 'Nuevo grupo' });
      const groupName = groupDialog.getByLabel('Nombre del grupo');
      expect(await groupName.evaluate((element) => getComputedStyle(element).fontSize)).toBe(
        '16px',
      );
      const groupNameBounds = await groupName.boundingBox();
      await touchPage.touchscreen.tap(
        groupNameBounds!.x + groupNameBounds!.width / 2,
        groupNameBounds!.y + groupNameBounds!.height / 2,
      );
      await touchPage.keyboard.type('Plan iPad');
      const saveGroup = groupDialog.getByRole('button', { name: 'Guardar' });
      const saveGroupBounds = await saveGroup.boundingBox();
      expect(saveGroupBounds!.width).toBeGreaterThanOrEqual(44);
      expect(saveGroupBounds!.height).toBeGreaterThanOrEqual(44);
      await touchPage.touchscreen.tap(
        saveGroupBounds!.x + saveGroupBounds!.width / 2,
        saveGroupBounds!.y + saveGroupBounds!.height / 2,
      );
      await expect(touchPage.getByRole('button', { name: /Plan iPad/ })).toBeVisible();

      const groupMenu = touchPage.locator('.group-menu');
      const groupMenuTrigger = groupMenu.locator('summary');
      const groupMenuBounds = await groupMenuTrigger.boundingBox();
      expect(groupMenuBounds!.width).toBeGreaterThanOrEqual(44);
      expect(groupMenuBounds!.height).toBeGreaterThanOrEqual(44);
      await touchPage.touchscreen.tap(
        groupMenuBounds!.x + groupMenuBounds!.width / 2,
        groupMenuBounds!.y + groupMenuBounds!.height / 2,
      );
      await expect(groupMenu).toHaveAttribute('open', '');

      const contextualAdd = groupMenu.getByRole('button', { name: 'Añadir tarea a este grupo' });
      const contextualBounds = await contextualAdd.boundingBox();
      expect(contextualBounds!.width).toBeGreaterThanOrEqual(44);
      expect(contextualBounds!.height).toBeGreaterThanOrEqual(44);
      await contextualAdd.tap();
      await expect(touchPage.getByLabel('Grupo de la nueva tarea')).toHaveValue(/.+/);
      const taskDialog = touchPage.getByRole('dialog', { name: 'Nueva tarea' });
      await expect(taskDialog).toBeVisible();
      const nameInput = taskDialog.getByPlaceholder('Agregar tarea');
      expect(await nameInput.evaluate((element) => getComputedStyle(element).fontSize)).toBe(
        '16px',
      );
      const nameBounds = await nameInput.boundingBox();
      expect(nameBounds!.height).toBeGreaterThanOrEqual(44);
      await touchPage.touchscreen.tap(
        nameBounds!.x + nameBounds!.width / 2,
        nameBounds!.y + nameBounds!.height / 2,
      );
      await expect(nameInput).toBeFocused();
      await touchPage.keyboard.type('Revisar en iPad');
      const addTask = taskDialog.getByRole('button', { name: 'Agregar tarea' });
      await expect(addTask).toBeEnabled();
      const addTaskBounds = await addTask.boundingBox();
      expect(addTaskBounds!.width).toBeGreaterThanOrEqual(44);
      expect(addTaskBounds!.height).toBeGreaterThanOrEqual(44);
      await touchPage.touchscreen.tap(
        addTaskBounds!.x + addTaskBounds!.width / 2,
        addTaskBounds!.y + addTaskBounds!.height / 2,
      );

      await expect(touchPage.locator('.task-row input').first()).toHaveValue('Revisar en iPad');
      await expect(touchPage.locator('.save-status')).toHaveText('Guardado');
      const stored = (await (
        await touchPage.request.get(`/api/projects/${project.id}`)
      ).json()) as {
        groups: Array<{ id: string; name: string }>;
        tasks: Array<{ name: string; groupId: string }>;
      };
      expect(stored.groups).toEqual([expect.objectContaining({ name: 'Plan iPad' })]);
      expect(stored.tasks).toEqual([
        expect.objectContaining({ name: 'Revisar en iPad', groupId: stored.groups[0].id }),
      ]);

      // Verify the new global toolbar action directly with touch, independently
      // of the group-context path above, and persist a non-default date range.
      const globalAddTask = touchPage.getByRole('button', { name: '+ Tarea' });
      const globalAddBounds = await globalAddTask.boundingBox();
      expect(globalAddBounds!.width).toBeGreaterThanOrEqual(44);
      expect(globalAddBounds!.height).toBeGreaterThanOrEqual(44);
      await touchPage.touchscreen.tap(
        globalAddBounds!.x + globalAddBounds!.width / 2,
        globalAddBounds!.y + globalAddBounds!.height / 2,
      );
      const globalDialog = touchPage.getByRole('dialog', { name: 'Nueva tarea' });
      const globalName = globalDialog.getByPlaceholder('Agregar tarea');
      const globalNameBounds = await globalName.boundingBox();
      await touchPage.touchscreen.tap(
        globalNameBounds!.x + globalNameBounds!.width / 2,
        globalNameBounds!.y + globalNameBounds!.height / 2,
      );
      await touchPage.keyboard.type('Tarea desde acceso global');
      await globalDialog.getByLabel('Grupo de la nueva tarea').selectOption(stored.groups[0].id);

      const startDateButton = globalDialog.getByRole('button', { name: /Inicio nueva:/ });
      const startDateBounds = await startDateButton.boundingBox();
      await touchPage.touchscreen.tap(
        startDateBounds!.x + startDateBounds!.width / 2,
        startDateBounds!.y + startDateBounds!.height / 2,
      );
      const startPicker = touchPage.getByRole('dialog', { name: /Inicio nueva:/ });
      await expect(startPicker).toBeVisible();
      const startDay = startPicker.getByRole('button', { name: /^[^,]+, 3 de noviembre de 2026$/ });
      const startDayBounds = await startDay.boundingBox();
      await touchPage.touchscreen.tap(
        startDayBounds!.x + startDayBounds!.width / 2,
        startDayBounds!.y + startDayBounds!.height / 2,
      );
      await expect(startDateButton).toHaveAccessibleName(/03\/11\/2026$/);

      const endDateButton = globalDialog.getByRole('button', { name: /Fin nueva:/ });
      const endDateBounds = await endDateButton.boundingBox();
      await touchPage.touchscreen.tap(
        endDateBounds!.x + endDateBounds!.width / 2,
        endDateBounds!.y + endDateBounds!.height / 2,
      );
      const endPicker = touchPage.getByRole('dialog', { name: /Fin nueva:/ });
      const endDay = endPicker.getByRole('button', { name: /^sábado, 7 de noviembre de 2026$/ });
      const endDayBounds = await endDay.boundingBox();
      await touchPage.touchscreen.tap(
        endDayBounds!.x + endDayBounds!.width / 2,
        endDayBounds!.y + endDayBounds!.height / 2,
      );
      await expect(endDateButton).toHaveAccessibleName(/07\/11\/2026$/);

      const globalSave = globalDialog.getByRole('button', { name: 'Agregar tarea' });
      const globalSaveBounds = await globalSave.boundingBox();
      expect(globalSaveBounds!.width).toBeGreaterThanOrEqual(44);
      expect(globalSaveBounds!.height).toBeGreaterThanOrEqual(44);
      await touchPage.touchscreen.tap(
        globalSaveBounds!.x + globalSaveBounds!.width / 2,
        globalSaveBounds!.y + globalSaveBounds!.height / 2,
      );
      await expect(touchPage.getByRole('dialog', { name: 'Nueva tarea' })).toBeHidden();
      const finalProject = (await (
        await touchPage.request.get(`/api/projects/${project.id}`)
      ).json()) as {
        tasks: Array<{ name: string; groupId: string; startDate: string; endDate: string }>;
      };
      expect(finalProject.tasks).toContainEqual(
        expect.objectContaining({
          name: 'Tarea desde acceso global',
          groupId: stored.groups[0].id,
          startDate: '2026-11-03',
          endDate: '2026-11-07',
        }),
      );
    } finally {
      await context.close();
      await page.request.delete(`/api/projects/${project.id}`);
    }
  });
}
