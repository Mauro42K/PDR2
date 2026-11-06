import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DependencyEditor } from './DependencyEditor.js';
import type { Task } from '../../shared/model.js';

const tasks: Task[] = [
  {
    id: 'a',
    name: 'Diseño',
    startDate: '2026-01-01',
    endDate: '2026-01-04',
    position: 0,
    number: 1,
    status: 'pending' as const,
    progress: 0,
    isMilestone: false,
  },
  {
    id: 'b',
    name: 'Compra',
    startDate: '2026-01-03',
    endDate: '2026-01-07',
    position: 1,
    number: 2,
    status: 'pending' as const,
    progress: 0,
    isMilestone: false,
  },
  {
    id: 'c',
    name: 'Entrega',
    startDate: '2026-01-05',
    endDate: '2026-01-06',
    position: 2,
    number: 3,
    status: 'pending' as const,
    progress: 0,
    isMilestone: false,
  },
];

describe('DependencyEditor', () => {
  it('shows multiple predecessors, excludes duplicates, warns about overlap and allows removal', async () => {
    const onAdd = vi.fn().mockResolvedValue(true);
    const onRemove = vi.fn().mockResolvedValue(true);
    render(
      <DependencyEditor
        task={tasks[2]}
        tasks={tasks}
        groups={[]}
        dependencies={[{ id: 'd', predecessorId: 'a', successorId: 'c' }]}
        locale="es"
        saving={false}
        onAdd={onAdd}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Predecesoras/ }));
    expect(
      screen.getByRole('button', {
        name: 'Quitar predecesora: #1 · Diseño · Sin grupo → #3 · Entrega · Sin grupo',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: '#1 · Diseño · Sin grupo (ya añadida)' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Predecesora para Entrega'), { target: { value: 'b' } });
    expect(screen.getByRole('status')).toHaveTextContent('fechas se superponen');
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('b', 'c'));
    await waitFor(() => expect(screen.getByLabelText('Predecesora para Entrega')).toHaveValue(''));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Quitar predecesora: #1 · Diseño · Sin grupo → #3 · Entrega · Sin grupo',
      }),
    );
    expect(onRemove).toHaveBeenCalledWith('d');
  });
  it('retains the selection after an error and Escape closes with focus returned', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    render(
      <DependencyEditor
        task={tasks[2]}
        tasks={tasks}
        groups={[]}
        dependencies={[]}
        locale="en"
        saving={false}
        onAdd={onAdd}
        onRemove={vi.fn()}
      />,
    );
    const toggle = screen.getByRole('button', { name: /Predecessors/ });
    fireEvent.click(toggle);
    const selector = screen.getByLabelText('Predecessor for Entrega');
    fireEvent.change(selector, { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('a', 'c'));
    expect(selector).toHaveValue('a');
    fireEvent.keyDown(selector, { key: 'Escape' });
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
  it('distinguishes tasks with the same name using row number and group', () => {
    const duplicates = [
      { ...tasks[0], name: 'Revisión', groupId: 'g1' },
      { ...tasks[1], name: 'Revisión', groupId: 'g2' },
      tasks[2],
    ];
    render(
      <DependencyEditor
        task={duplicates[2]}
        tasks={duplicates}
        groups={[
          { id: 'g1', name: 'Diseño', position: 0 },
          { id: 'g2', name: 'Compra', position: 1 },
        ]}
        dependencies={[{ id: 'd', predecessorId: 'b', successorId: 'c' }]}
        locale="es"
        saving={false}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Predecesoras/ }));
    expect(screen.getByRole('option', { name: '#1 · Revisión · Diseño' })).toHaveValue('a');
    expect(screen.getByRole('option', { name: '#2 · Revisión · Compra (ya añadida)' })).toHaveValue(
      'b',
    );
    expect(
      screen.getByRole('button', {
        name: 'Quitar predecesora: #2 · Revisión · Compra → #3 · Entrega · Sin grupo',
      }),
    ).toBeInTheDocument();
  });
  it('discards the candidate and collapses when its row menu closes and reopens', async () => {
    const view = render(
      <details open className="row-actions">
        <summary>Acciones</summary>
        <DependencyEditor
          task={tasks[2]}
          tasks={tasks}
          groups={[]}
          dependencies={[]}
          locale="es"
          saving={false}
          onAdd={vi.fn()}
          onRemove={vi.fn()}
        />
      </details>,
    );
    const menu = view.container.querySelector('details')!;
    const toggle = screen.getByRole('button', { name: /Predecesoras/ });
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('Predecesora para Entrega'), { target: { value: 'a' } });
    menu.open = false;
    fireEvent(menu, new Event('toggle'));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'));
    menu.open = true;
    fireEvent(menu, new Event('toggle'));
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Predecesora para Entrega')).toHaveValue('');
  });
});
