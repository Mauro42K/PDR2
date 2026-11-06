import { expect, test } from '@playwright/test';

test('assigns, persists, undoes and exports a group color while accepting legacy JSON', async ({
  page,
}) => {
  const name = `Colores de grupo QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id, updatedAt } = (await created.json()) as { id: string; updatedAt: string };
  const groupId = crypto.randomUUID();
  try {
    expect(
      (
        await page.request.post(`/api/projects/${id}/tasks`, {
          data: { name: 'Tarea de color', startDate: '2026-11-01', endDate: '2026-11-05' },
        })
      ).ok(),
    ).toBeTruthy();
    const initial = (await (await page.request.get(`/api/projects/${id}`)).json()) as {
      id: string;
      name: string;
      updatedAt: string;
      tasks: Array<{ id: string; groupId?: string | null }>;
    };
    const saved = await page.request.put(`/api/projects/${id}/state`, {
      data: {
        ...initial,
        groups: [{ id: groupId, name: 'Diseño', position: 0, note: '' }],
        tasks: initial.tasks.map((task) => ({ ...task, groupId })),
      },
    });
    expect(saved.ok()).toBeTruthy();
    const current = (await (await page.request.get(`/api/projects/${id}`)).json()) as {
      tasks: Array<{ id: string }>;
    };

    await page.route('**/api/projects', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: [{ id, name, updatedAt }] })
        : route.continue(),
    );
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    const group = page.locator('.group-toolbar').filter({ hasText: 'Diseño' });
    const taskBar = page.locator(`#task-bar-${current.tasks[0].id}`);
    await expect(group).toBeVisible();
    await expect(taskBar).toBeVisible();

    await group.getByLabel('Opciones del grupo: Diseño').click();
    const palette = page.getByRole('group', { name: 'Color del grupo: Diseño' });
    await expect(palette.getByRole('button')).toHaveCount(7);
    const colors = [
      { name: 'Azul suave', token: 'blue' },
      { name: 'Turquesa suave', token: 'teal' },
      { name: 'Verde suave', token: 'green' },
      { name: 'Ámbar suave', token: 'amber' },
      { name: 'Violeta suave', token: 'violet' },
      { name: 'Rosa suave', token: 'rose' },
    ];
    for (const color of colors) {
      await palette.getByRole('button', { name: color.name }).click();
      await expect(group).toHaveClass(new RegExp(`group-color-${color.token}`));
      await expect(taskBar).toHaveClass(new RegExp(`group-color-${color.token}`));
      const contrast = await page.evaluate(() => {
        const luminance = (value: string) => {
          const channels = value
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((channel) => {
              const normalized = channel / 255;
              return normalized <= 0.04045
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
            });
          return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
        };
        const ratio = (foreground: string, background: string) => {
          const a = luminance(foreground),
            b = luminance(background);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const group = document.querySelector('.group-toolbar')!;
        const groupLabel = group.querySelector('button:first-child')!;
        const bar = document.querySelector('.bar')!;
        const barLabel = bar.querySelector('.bar-label')!;
        return {
          header: ratio(
            getComputedStyle(groupLabel).color,
            getComputedStyle(group).backgroundColor,
          ),
          taskBar: ratio(
            getComputedStyle(barLabel).color,
            getComputedStyle(bar, '::before').backgroundColor,
          ),
        };
      });
      expect(contrast.header).toBeGreaterThanOrEqual(4.5);
      expect(contrast.taskBar).toBeGreaterThanOrEqual(4.5);
    }
    await expect(page.locator('.save-status')).toHaveText('Guardado');

    await group.getByLabel('Opciones del grupo: Diseño').click();
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(group).not.toHaveClass(/group-color-rose/);
    await page.getByRole('button', { name: 'Rehacer' }).click();
    await expect(group).toHaveClass(/group-color-rose/);
    await page.reload();
    const persistedGroup = page.locator('.group-toolbar').filter({ hasText: 'Diseño' });
    await expect(persistedGroup).toHaveClass(/group-color-rose/);

    const exported = (await (await page.request.get(`/api/projects/${id}/export`)).json()) as {
      version: number;
      project: { groups: Array<{ color?: string | null }> };
    };
    expect(exported.version).toBe(3);
    expect(exported.project.groups[0].color).toBe('rose');
    const copied = await page.request.post('/api/projects/import', {
      data: { ...exported, mode: 'copy' },
    });
    expect(copied.ok()).toBeTruthy();
    const copiedProject = (await copied.json()) as {
      id: string;
      groups: Array<{ id: string; color?: string | null }>;
    };
    expect(copiedProject.groups[0].id).not.toBe(groupId);
    expect(copiedProject.groups[0].color).toBe('rose');

    const legacyCopy = await page.request.post('/api/projects/import', {
      data: {
        ...exported,
        mode: 'copy',
        project: {
          ...exported.project,
          groups: exported.project.groups.map(({ color: _color, ...legacyGroup }) => legacyGroup),
        },
      },
    });
    expect(legacyCopy.ok()).toBeTruthy();
    const legacyProject = (await legacyCopy.json()) as {
      id: string;
      groups: Array<{ color?: string | null }>;
    };
    expect(legacyProject.groups[0].color).toBeNull();
    await page.request.delete(`/api/projects/${copiedProject.id}`);
    await page.request.delete(`/api/projects/${legacyProject.id}`);
  } finally {
    await page.request.delete(`/api/projects/${id}`);
  }
});

test('keeps group color controls reachable with touch targets on a tablet viewport', async ({
  browser,
  page,
}) => {
  const name = `Color tactil QA ${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id, updatedAt } = (await created.json()) as { id: string; updatedAt: string };
  const groupId = crypto.randomUUID();
  try {
    const initial = (await (await page.request.get(`/api/projects/${id}`)).json()) as {
      id: string;
      name: string;
      updatedAt: string;
      tasks: [];
    };
    expect(
      (
        await page.request.put(`/api/projects/${id}/state`, {
          data: {
            ...initial,
            groups: [{ id: groupId, name: 'Grupo tactil', position: 0 }],
            tasks: [],
            dependencies: [],
          },
        })
      ).ok(),
    ).toBeTruthy();
    const context = await browser.newContext({
      viewport: { width: 768, height: 1024 },
      hasTouch: true,
      isMobile: true,
    });
    await context.route('**/api/projects', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: [{ id, name, updatedAt }] })
        : route.continue(),
    );
    const touch = await context.newPage();
    await touch.goto('/');
    const toolbar = touch.locator('.group-toolbar').filter({ hasText: 'Grupo tactil' });
    await toolbar.getByLabel('Opciones del grupo: Grupo tactil').tap();
    const swatch = touch
      .getByRole('group', { name: 'Color del grupo: Grupo tactil' })
      .getByRole('button', { name: 'Turquesa suave' });
    const bounds = await swatch.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await swatch.tap();
    await expect(toolbar).toHaveClass(/group-color-teal/);
    await context.close();
  } finally {
    await page.request.delete(`/api/projects/${id}`);
  }
});
