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
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Proyecto',
  updatedAt: '2026-10-28T00:00:00Z',
  groups: [
    { id: 'g1', name: 'Primero', position: 0 },
    { id: 'g2', name: 'Segundo', position: 1 },
  ],
  tasks: [
    {
      id: 'a',
      name: 'Tarea A',
      startDate: '2026-10-28',
      endDate: '2026-10-29',
      position: 0,
      number: 1,
      status: 'pending' as const,
      progress: 0,
      isMilestone: false,
      groupId: 'g1',
      note: '',
    },
    {
      id: 'b',
      name: 'Tarea B',
      startDate: '2026-10-30',
      endDate: '2026-10-31',
      position: 1,
      number: 2,
      status: 'pending',
      progress: 0,
      isMilestone: false,
      groupId: 'g2',
      note: '',
    },
  ],
  dependencies: [],
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
describe('F2 organización', () => {
  it('crea una tarea desde el menú del grupo, deja el destino explícito y agrupa el undo', async () => {
    await open();
    fireEvent.click(screen.getByLabelText('Opciones del grupo: Segundo'));
    const groupMenu = screen.getByLabelText('Opciones del grupo: Segundo').closest('details')!;
    fireEvent.click(within(groupMenu).getByRole('button', { name: 'Añadir tarea a este grupo' }));
    expect(screen.getByRole('combobox', { name: 'Grupo de la nueva tarea' })).toHaveValue('g2');
    const name = screen.getByRole('textbox', { name: 'Nombre de tarea' });
    fireEvent.change(name, { target: { value: 'Nueva tarea contextual' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar tarea' }));
    await waitFor(() => expect(api.saveProjectState).toHaveBeenCalledOnce());
    const saved = vi.mocked(api.saveProjectState).mock.calls[0][0];
    expect(saved.tasks).toHaveLength(3);
    expect(saved.tasks[2]).toMatchObject({
      name: 'Nueva tarea contextual',
      groupId: 'g2',
      position: 2,
    });
    await waitFor(() =>
      expect(screen.getByDisplayValue('Nueva tarea contextual')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Deshacer/ }));
    await waitFor(() => expect(api.saveProjectState).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.saveProjectState).mock.calls[1][0].tasks).toHaveLength(2);
  });
  it('pliega la tarea y barra correspondientes y reordena los grupos', async () => {
    await open();
    const first = screen.getByRole('button', { name: /Primero/ });
    expect(document.querySelectorAll('.timeline-group-row')).toHaveLength(2);
    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByDisplayValue('Tarea A')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tarea A, 2026/ })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Tarea B')).toBeInTheDocument();
    expect(document.querySelectorAll('.timeline-group-row')).toHaveLength(2);
    fireEvent.click(first);
    fireEvent.click(screen.getByLabelText('Opciones del grupo: Primero'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Bajar grupo' })[0]);
    await waitFor(() => expect(vi.mocked(api.saveProjectState)).toHaveBeenCalled());
    expect(vi.mocked(api.saveProjectState).mock.calls[0][0].groups?.map((g) => g.name)).toEqual([
      'Segundo',
      'Primero',
    ]);
  });
  it('mantiene un encabezado sincronizado cuando el grupo está vacío', async () => {
    vi.mocked(api.project).mockResolvedValueOnce({
      ...structuredClone(project),
      groups: [...project.groups!, { id: 'g3', name: 'Vacío', position: 2 }],
    });
    await open();
    expect(screen.getByRole('button', { name: /Vacío/ })).toBeInTheDocument();
    expect(document.querySelectorAll('.timeline-group-row')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /Vacío/ }));
    expect(document.querySelectorAll('.timeline-group-row')).toHaveLength(3);
  });
  it('permite consultar el nombre completo, cambiar grupo y cerrar acciones con Escape', async () => {
    await open();
    const trigger = screen.getByLabelText('Acciones de tarea: Tarea A');
    const menu = trigger.closest('details')!;
    fireEvent.click(trigger);
    expect(menu).toHaveAttribute('open');
    expect(within(menu).getByText('Tarea A')).toBeInTheDocument();
    fireEvent.change(within(menu).getByRole('combobox', { name: 'Grupo de Tarea A' }), {
      target: { value: 'g2' },
    });
    await waitFor(() => expect(vi.mocked(api.saveProjectState)).toHaveBeenCalled());
    expect(vi.mocked(api.saveProjectState).mock.calls[0][0].tasks[0].groupId).toBe('g2');
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(menu).not.toHaveAttribute('open');
    expect(trigger).toHaveFocus();
  });
  it('conserva borrador si guardar nota falla y permite reintentar', async () => {
    await open();
    vi.mocked(api.saveProjectState).mockRejectedValueOnce(new Error('Error al guardar'));
    const taskMenu = screen.getByLabelText('Acciones de tarea: Tarea A').closest('details')!;
    fireEvent.click(screen.getByLabelText('Acciones de tarea: Tarea A'));
    fireEvent.click(within(taskMenu).getByRole('button', { name: 'Añadir nota' }));
    const dialog = screen.getByRole('dialog', { name: /Nota · Tarea A/ });
    const field = within(dialog).getByLabelText('Nota');
    fireEvent.change(field, { target: { value: 'Una nota\nmultilínea' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent('No se pudo guardar'),
    );
    expect(field).toHaveValue('Una nota\nmultilínea');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('status')).toHaveTextContent('Nota guardada.'),
    );
    expect(screen.getByRole('dialog', { name: /Nota · Tarea A/ })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Nota · Tarea A/ })).not.toBeInTheDocument(),
    );
    expect(api.saveProjectState).toHaveBeenCalledTimes(2);
    expect(within(taskMenu).getByRole('button', { name: 'Ver o editar nota' })).toBeInTheDocument();
  });
  it('muestra marcas persistentes y guarda notas de grupo con deshacer', async () => {
    vi.mocked(api.project).mockResolvedValueOnce({
      ...structuredClone(project),
      tasks: [{ ...project.tasks[0], note: 'Anotación' }, project.tasks[1]],
    });
    await open();
    expect(document.querySelectorAll('.task-note-mark')).toHaveLength(1);
    expect(document.querySelectorAll('.group-note-mark')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Nota de tarea: Tarea A' })).toBeInTheDocument();
    const groupMenu = screen.getByLabelText('Opciones del grupo: Primero').closest('details')!;
    fireEvent.click(screen.getByLabelText('Opciones del grupo: Primero'));
    fireEvent.click(within(groupMenu).getByRole('button', { name: 'Añadir nota' }));
    const dialog = screen.getByRole('dialog', { name: /Nota · Primero/ });
    fireEvent.change(within(dialog).getByLabelText('Nota'), { target: { value: 'Nota de grupo' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(document.querySelectorAll('.group-note-mark')).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Nota del grupo: Primero' })).toBeInTheDocument();
    expect(vi.mocked(api.saveProjectState).mock.calls[0][0].groups?.[0].note).toBe('Nota de grupo');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Nota · Primero/ })).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Deshacer/ }));
    await waitFor(() => expect(document.querySelectorAll('.group-note-mark')).toHaveLength(0));
  });
  it('exige confirmación y palabra antes de eliminar sin borrar tareas', async () => {
    await open();
    fireEvent.click(screen.getByLabelText('Opciones del grupo: Primero'));
    fireEvent.click(
      within(screen.getByLabelText('Opciones del grupo: Primero').closest('details')!).getByRole(
        'button',
        { name: 'Eliminar grupo' },
      ),
    );
    const dialog = screen.getByRole('dialog', { name: 'Eliminar grupo' });
    expect(within(dialog).getByText(/se conservarán sin grupo/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    const field = within(dialog).getByLabelText('Escribe BORRAR para confirmar');
    fireEvent.change(field, { target: { value: 'incorrecto' } });
    expect(within(dialog).getByRole('button', { name: 'Eliminar grupo' })).toBeDisabled();
    fireEvent.change(field, { target: { value: 'BORRAR' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar grupo' }));
    await waitFor(() => expect(api.saveProjectState).toHaveBeenCalledOnce());
    const saved = vi.mocked(api.saveProjectState).mock.calls[0][0];
    expect(saved.groups?.map((g) => g.name)).toEqual(['Segundo']);
    expect(saved.tasks).toHaveLength(2);
    expect(saved.tasks[0].groupId).toBeNull();
  });
});
