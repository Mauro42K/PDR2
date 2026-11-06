import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { api } from './api.js';
import type { Project } from '../shared/model.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api.js')>();
  return { ...actual, api: { projects: vi.fn(), project: vi.fn(), saveProjectState: vi.fn() } };
});
const project: Project = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Orden',
  updatedAt: '2026-10-28T00:00:00Z',
  groups: [{ id: 'g1', name: 'Primero', position: 0 }],
  tasks: [
    {
      id: 'a',
      name: 'Tarea A',
      startDate: '2026-10-28',
      endDate: '2026-10-28',
      position: 0,
      number: 1,
      status: 'pending',
      progress: 0,
      isMilestone: false,
      groupId: 'g1',
      note: '',
    },
    {
      id: 'b',
      name: 'Tarea B',
      startDate: '2026-10-29',
      endDate: '2026-10-29',
      position: 1,
      number: 2,
      status: 'pending',
      progress: 0,
      isMilestone: false,
      groupId: 'g1',
      note: '',
    },
    {
      id: 'c',
      name: 'Tarea C',
      startDate: '2026-10-30',
      endDate: '2026-10-30',
      position: 2,
      number: 3,
      status: 'pending',
      progress: 0,
      isMilestone: false,
      groupId: null,
      note: '',
    },
  ],
  dependencies: [{ id: 'd1', predecessorId: 'a', successorId: 'b' }],
};
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(api.projects).mockResolvedValue([
    { id: project.id, name: project.name, updatedAt: project.updatedAt },
  ]);
  vi.mocked(api.project).mockResolvedValue(structuredClone(project));
  vi.mocked(api.saveProjectState).mockImplementation(async (value) => structuredClone(value));
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
async function open() {
  render(<App />);
  await screen.findByDisplayValue('Tarea A');
}
function openTaskMenu(name: string) {
  fireEvent.click(screen.getByLabelText(`Acciones de tarea: ${name}`));
  return screen.getByLabelText(`Acciones de tarea: ${name}`).closest('details')!;
}
describe('orden de tareas (AF-20)', () => {
  it('baja una tarea dentro de su grupo sin cambiar números ni predecesoras, y lo guarda', async () => {
    await open();
    const menu = openTaskMenu('Tarea A');
    fireEvent.click(within(menu).getByRole('button', { name: 'Bajar tarea' }));
    await waitFor(() => expect(api.saveProjectState).toHaveBeenCalledOnce());
    const saved = vi.mocked(api.saveProjectState).mock.calls[0][0];
    expect(saved.tasks.map((t) => [t.id, t.position, t.number])).toEqual([
      ['a', 1, 1],
      ['b', 0, 2],
      ['c', 2, 3],
    ]);
    expect(saved.dependencies).toEqual(project.dependencies);
  });

  it('no ofrece mover una tarea de «Sin grupo» cuando es la única de su ámbito', async () => {
    await open();
    const menu = openTaskMenu('Tarea C');
    expect(within(menu).getByRole('button', { name: 'Subir tarea' })).toBeDisabled();
    expect(within(menu).getByRole('button', { name: 'Bajar tarea' })).toBeDisabled();
  });

  it('deshabilita subir en la primera y bajar en la última tarea de su grupo', async () => {
    await open();
    const menu = openTaskMenu('Tarea A');
    expect(within(menu).getByRole('button', { name: 'Subir tarea' })).toBeDisabled();
    expect(within(menu).getByRole('button', { name: 'Bajar tarea' })).toBeEnabled();
    fireEvent.click(within(menu).getByRole('button', { name: 'Bajar tarea' }));
    await waitFor(() => expect(api.saveProjectState).toHaveBeenCalledOnce());
    const movedMenu = openTaskMenu('Tarea A');
    expect(within(movedMenu).getByRole('button', { name: 'Subir tarea' })).toBeEnabled();
    expect(within(movedMenu).getByRole('button', { name: 'Bajar tarea' })).toBeDisabled();
  });
});
