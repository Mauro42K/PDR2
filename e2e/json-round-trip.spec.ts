import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type Snapshot = {
  groups: Array<{ name: string; position: number; color: string | null; note: string }>;
  tasks: Array<{ name: string; startDate: string; endDate: string; group: string | null; note: string }>;
  dependencies: Array<{ predecessor: string; successor: string }>;
};

/** Compares projects by content, not by ids, because copies and replacements regenerate ids. */
function snapshot(project: Record<string, unknown>): Snapshot {
  const groups = (project.groups as Array<{ id: string; name: string; position: number; color?: string | null; note?: string }> ?? []);
  const tasks = project.tasks as Array<{ id: string; name: string; startDate: string; endDate: string; groupId?: string | null; note?: string }>;
  const deps = project.dependencies as Array<{ predecessorId: string; successorId: string }>;
  const nameOf = new Map(tasks.map((task) => [task.id, task.name]));
  const groupNameOf = new Map(groups.map((group) => [group.id, group.name]));
  return {
    groups: groups.map((group) => ({ name: group.name, position: group.position, color: group.color ?? null, note: group.note ?? '' })).sort((a, b) => a.position - b.position),
    tasks: tasks.map((task) => ({ name: task.name, startDate: task.startDate, endDate: task.endDate, group: task.groupId ? groupNameOf.get(task.groupId) ?? null : null, note: task.note ?? '' })).sort((a, b) => a.name.localeCompare(b.name)),
    dependencies: deps.map((dep) => ({ predecessor: nameOf.get(dep.predecessorId) ?? '', successor: nameOf.get(dep.successorId) ?? '' })).sort((a, b) => `${a.predecessor}>${a.successor}`.localeCompare(`${b.predecessor}>${b.successor}`)),
  };
}

async function fetchProject(page: Page, id: string) {
  return await (await page.request.get(`/api/projects/${id}`)).json() as Record<string, unknown>;
}

async function uploadFile(page: Page, file: { name: string; json: unknown }) {
  await page.getByRole('button', { name: 'Importar JSON' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: file.name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file.json)) });
  await expect(page.getByRole('dialog', { name: 'Importar proyecto' })).toBeVisible();
}

test.setTimeout(90000);

test('exports v2 JSON from the UI and imports it as a copy or replacement without losing groups, colors, notes or dependencies', async ({ page }) => {
  const name = `Ida y vuelta JSON QA ${crypto.randomUUID()}`;
  const created = await page.request.post('/api/projects', { data: { name } });
  const { id } = await created.json() as { id: string };
  const groupA = crypto.randomUUID();
  const groupB = crypto.randomUUID();
  const taskA = crypto.randomUUID();
  const taskB = crypto.randomUUID();
  const taskC = crypto.randomUUID();
  const dependencyId = crypto.randomUUID();
  try {
    const seeded = await fetchProject(page, id);
    expect((await page.request.put(`/api/projects/${id}/state`, { data: {
      ...seeded,
      groups: [
        { id: groupA, name: 'Diseño', position: 0, color: 'teal', note: 'Nota del grupo\nÑandú 🚀' },
        { id: groupB, name: 'Compras', position: 1, color: null, note: '' }
      ],
      tasks: [
        { id: taskA, name: 'Boceto', startDate: '2026-11-01', endDate: '2026-11-03', position: 0, number: 1, status: 'pending', progress: 0, isMilestone: false, groupId: groupA, note: 'Revisar alcance\nSegunda línea ✔' },
        { id: taskB, name: 'Pedido', startDate: '2026-11-04', endDate: '2026-11-06', position: 1, number: 2, status: 'pending', progress: 0, isMilestone: false, groupId: null, note: '' },
        { id: taskC, name: 'Entrega', startDate: '2026-11-07', endDate: '2026-11-09', position: 2, number: 3, status: 'pending', progress: 0, isMilestone: false, groupId: groupB, note: '' }
      ],
      dependencies: [{ id: dependencyId, predecessorId: taskA, successorId: taskC }, { id: crypto.randomUUID(), predecessorId: taskB, successorId: taskC }]
    } })).ok()).toBeTruthy();
    const original = snapshot(await fetchProject(page, id));

    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    await page.locator('.projects-button').click();
    await page.getByRole('navigation', { name: 'Proyectos' }).getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar JSON' }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(await readFile((await download.path())!, 'utf8')) as { version: number; project: Record<string, unknown> };
    expect(exported.version).toBe(3);
    expect(snapshot(exported.project)).toEqual(original);

    await uploadFile(page, { name: 'ida.pdr2.json', json: exported });
    await page.getByRole('button', { name: 'Crear una copia' }).click();
    await expect(page.getByRole('dialog', { name: 'Importar proyecto' })).toBeHidden();
    let copyId = '';
    await expect.poll(async () => { const copies = await (await page.request.get('/api/projects')).json() as Array<{ id: string; name: string }>; copyId = copies.find((item) => item.name === `${name} (copia)`)?.id ?? ''; return copyId; }).not.toBe('');
    expect(snapshot(await fetchProject(page, copyId))).toEqual(original);
    await page.request.delete(`/api/projects/${copyId}`);

    await page.request.put(`/api/projects/${id}/state`, { data: { ...(await fetchProject(page, id)), tasks: [] } });
    await page.reload();
    await page.locator('.projects-button').click();
    await page.getByRole('navigation', { name: 'Proyectos' }).getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await uploadFile(page, { name: 'ida.pdr2.json', json: exported });
    page.once('dialog', (dialog) => void dialog.accept());
    const importResponse = page.waitForResponse((r) => r.url().includes('/api/projects/import') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Confirmar reemplazo' }).click();
    const body = await (await importResponse).json() as { tasks: Array<{ name: string; groupId: string | null }>; groups: Array<{ id: string }> };
    await expect(page.getByRole('button', { name: 'Deshacer' })).toBeDisabled();
    await page.reload();
    await page.locator('.projects-button').click();
    await page.getByRole('navigation', { name: 'Proyectos' }).getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.locator('.group-toolbar-ungrouped')).toHaveText('Sin grupo');
    await expect(page.locator('.group-toolbar.group-color-teal').first()).toBeVisible();
  } finally {
    await page.request.delete(`/api/projects/${id}`);
  }
});
