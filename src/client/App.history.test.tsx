import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { api } from './api.js';
import type { Project } from '../shared/model.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api.js')>();
  return {
    ...actual,
    api: {
      projects: vi.fn(),
      project: vi.fn(),
      saveProjectState: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(),
      importProject: vi.fn(),
    },
  };
});
const initial: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Plan',
  updatedAt: '2026-10-28T00:00:00Z',
  groups: [
    { id: 'g1', name: 'Uno', position: 0 },
    { id: 'g2', name: 'Dos', position: 1 },
  ],
  tasks: [
    {
      id: 'a',
      name: 'Tarea A',
      startDate: '2026-10-28',
      endDate: '2026-10-29',
      position: 0,
      number: 1,
      status: 'pending',
      progress: 0,
      isMilestone: false,
      groupId: 'g1',
      note: '',
    },
  ],
  dependencies: [],
};
const summary = (p: Project) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt });
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(api.projects).mockResolvedValue([summary(initial)]);
  vi.mocked(api.project).mockResolvedValue(structuredClone(initial));
  vi.mocked(api.saveProjectState).mockImplementation(async (p) => structuredClone(p));
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
async function moveFirstGroup() {
  const trigger = screen.getByLabelText('Opciones del grupo: Uno');
  fireEvent.click(trigger);
  const menu = trigger.closest('details')!;
  const move = await within(menu).findByRole('button', { name: 'Bajar grupo' });
  expect(move).toBeEnabled();
  fireEvent.click(move);
  await waitFor(() => expect(api.saveProjectState).toHaveBeenCalledOnce());
}

describe('F2 historial de sesión', () => {
  it('advierte antes de guardar una predecesora con fechas solapadas y permite rechazarla', async () => {
    const overlapping = structuredClone(initial);
    overlapping.tasks.push({
      id: 'b',
      name: 'Tarea B',
      startDate: '2026-10-29',
      endDate: '2026-10-31',
      position: 1,
      number: 2,
      status: 'pending' as const,
      progress: 0,
      isMilestone: false,
      groupId: null,
      note: '',
    });
    vi.mocked(api.project).mockResolvedValue(overlapping);
    await open();
    const predecessorField = screen.getByLabelText(
      'Predecesoras de Tarea B; escribe números de tarea separados por comas',
    );
    fireEvent.focus(predecessorField);
    fireEvent.change(predecessorField, { target: { value: '1' } });
    fireEvent.blur(predecessorField);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Tarea A (2026-10-29) → Tarea B (2026-10-30)');
    expect(api.saveProjectState).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rechazar cambio' }));
    await waitFor(() => expect(predecessorField).toHaveValue(''));
    expect(api.saveProjectState).not.toHaveBeenCalled();
  });
  it('guarda la predecesora solapada solo después de aceptar el aviso', async () => {
    const overlapping = structuredClone(initial);
    overlapping.tasks.push({
      id: 'b',
      name: 'Tarea B',
      startDate: '2026-10-29',
      endDate: '2026-10-31',
      position: 1,
      number: 2,
      status: 'pending' as const,
      progress: 0,
      isMilestone: false,
      groupId: null,
      note: '',
    });
    vi.mocked(api.project).mockResolvedValue(overlapping);
    await open();
    const predecessorField = screen.getByLabelText(
      'Predecesoras de Tarea B; escribe números de tarea separados por comas',
    );
    fireEvent.focus(predecessorField);
    fireEvent.change(predecessorField, { target: { value: '1' } });
    fireEvent.blur(predecessorField);
    const dialog = await screen.findByRole('alertdialog');
    expect(api.saveProjectState).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: /Aceptar cambio/ }));
    await waitFor(() => expect(api.saveProjectState).toHaveBeenCalledOnce());
    const accepted = vi.mocked(api.saveProjectState).mock.calls[0][0];
    expect(accepted.dependencies).toEqual([
      { id: expect.any(String), predecessorId: 'a', successorId: 'b' },
    ]);
    expect(accepted.tasks[1]).toMatchObject({ startDate: '2026-10-30', endDate: '2026-11-01' });
  });
  it('no avanza historial si undo falla y permite reintentar y rehacer', async () => {
    await open();
    await moveFirstGroup();
    const undo = screen.getByRole('button', { name: 'Deshacer' });
    const redo = screen.getByRole('button', { name: 'Rehacer' });
    await waitFor(() => expect(undo).toBeEnabled());
    vi.mocked(api.saveProjectState).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.click(undo);
    expect(
      (await screen.findAllByText('No se pudo guardar. Revisa la conexión y vuelve a intentarlo.'))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Failed to fetch')).toBeNull();
    expect(undo).toBeEnabled();
    expect(redo).toBeDisabled();
    fireEvent.click(undo);
    await waitFor(() => expect(redo).toBeEnabled());
    expect(vi.mocked(api.saveProjectState).mock.calls[2][0].groups?.map((g) => g.name)).toEqual([
      'Uno',
      'Dos',
    ]);
    fireEvent.click(redo);
    await waitFor(() => expect(undo).toBeEnabled());
    expect(vi.mocked(api.saveProjectState).mock.calls[3][0].groups?.map((g) => g.name)).toEqual([
      'Dos',
      'Uno',
    ]);
  });
  it('conserva un borrador rechazado durante otro guardado y permite reintentarlo', async () => {
    await open();
    let finishSave!: () => void;
    vi.mocked(api.saveProjectState).mockImplementationOnce(
      (p) =>
        new Promise((done) => {
          finishSave = () => done(structuredClone(p));
        }),
    );
    await moveFirstGroup();
    const field = screen.getByDisplayValue('Tarea A');
    fireEvent.change(field, { target: { value: 'Nombre pendiente' } });
    fireEvent.blur(field);
    expect(api.updateTask).not.toHaveBeenCalled();
    expect(field).toHaveValue('Nombre pendiente');
    const pending = vi.mocked(api.saveProjectState).mock.calls[0][0];
    finishSave();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Deshacer' })).toBeEnabled());
    vi.mocked(api.updateTask).mockImplementation(async (_id, _task, input) => ({
      ...pending,
      tasks: pending.tasks.map((t) => ({ ...t, name: input.name })),
    }));
    fireEvent.focus(field);
    fireEvent.blur(field);
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledOnce());
    expect(screen.getByDisplayValue('Nombre pendiente')).toBeInTheDocument();
  });
  it('impide cambiar de proyecto hasta que termine el guardado', async () => {
    const second = {
      ...structuredClone(initial),
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Otro plan',
    };
    vi.mocked(api.projects).mockResolvedValue([summary(initial), summary(second)]);
    vi.mocked(api.project).mockImplementation(async (id) =>
      structuredClone(id === second.id ? second : initial),
    );
    await open();
    let finishSave!: () => void;
    vi.mocked(api.saveProjectState).mockImplementationOnce(
      (p) =>
        new Promise((done) => {
          finishSave = () => done(structuredClone(p));
        }),
    );
    await moveFirstGroup();
    fireEvent.click(screen.getByRole('button', { name: /Otro plan/ }));
    expect(api.project).not.toHaveBeenCalledWith(second.id);
    expect(screen.getByText('Espera a que termine la operación.')).toBeInTheDocument();
    finishSave();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Deshacer' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Otro plan/ }));
    await waitFor(() => expect(api.project).toHaveBeenCalledWith(second.id));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Deshacer' })).toBeDisabled());
  });
  it('restaura tarea eliminada y sus dependencias en una operación', async () => {
    const linked = structuredClone(initial);
    linked.tasks.push({
      id: 'b',
      name: 'Tarea B',
      startDate: '2026-10-30',
      endDate: '2026-10-31',
      position: 1,
      number: 1,
      status: 'pending' as const,
      progress: 0,
      isMilestone: false,
      groupId: null,
      note: '',
    });
    linked.dependencies = [{ id: 'dep', predecessorId: 'a', successorId: 'b' }];
    vi.mocked(api.project).mockResolvedValue(linked);
    vi.mocked(api.deleteTask).mockResolvedValue({
      ...linked,
      tasks: linked.tasks.filter((t) => t.id !== 'a'),
      dependencies: [],
    });
    await open();
    const trigger = screen.getByLabelText('Acciones de tarea: Tarea A');
    fireEvent.click(trigger);
    fireEvent.click(
      within(trigger.closest('details')!).getByRole('button', { name: 'Eliminar tarea' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Eliminar tarea' });
    expect(dialog).toHaveTextContent('Tarea A');
    expect(api.deleteTask).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    const confirmation = within(dialog).getByLabelText('Escribe BORRAR para confirmar');
    fireEvent.change(confirmation, { target: { value: 'DELETE' } });
    expect(within(dialog).getByRole('button', { name: 'Eliminar tarea' })).toBeDisabled();
    fireEvent.change(confirmation, { target: { value: 'BORRAR' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar tarea' }));
    await waitFor(() => expect(api.deleteTask).toHaveBeenCalledWith(initial.id, 'a'));
    await waitFor(() => expect(screen.queryByDisplayValue('Tarea A')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(() => expect(api.saveProjectState).toHaveBeenCalled());
    const restored = vi.mocked(api.saveProjectState).mock.calls[0][0];
    expect(restored.tasks.map((t) => t.id)).toEqual(['a', 'b']);
    expect(restored.dependencies).toEqual(linked.dependencies);
  });
  it('limpia historial solamente después de una importación exitosa', async () => {
    await open();
    await moveFirstGroup();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Deshacer' })).toBeEnabled());
    const imported: Project = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Importado',
      updatedAt: initial.updatedAt,
      groups: [],
      tasks: [],
      dependencies: [],
    };
    const file = new File(['{}'], 'plan.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', {
      value: async () =>
        JSON.stringify({
          format: 'pdr2-project',
          version: 2,
          exportedAt: initial.updatedAt,
          project: imported,
        }),
    });
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });
    const copy = await screen.findByRole('button', { name: /crear una copia/i });
    vi.mocked(api.importProject).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.click(copy);
    expect(
      (await screen.findAllByText('No se pudo guardar. Revisa la conexión y vuelve a intentarlo.'))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeEnabled();
    vi.mocked(api.importProject).mockResolvedValueOnce(imported);
    vi.mocked(api.projects).mockResolvedValueOnce([summary(initial), summary(imported)]);
    vi.mocked(api.project).mockResolvedValueOnce(imported);
    fireEvent.click(copy);
    await screen.findByRole('heading', { name: 'Importado' });
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeDisabled();
  });
});
