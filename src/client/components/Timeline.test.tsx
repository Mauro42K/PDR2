import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Timeline } from './Timeline.js';
import type { Project } from '../../shared/model.js';

const project: Project = { id: 'p1', name: 'Plan', updatedAt: '', tasks: [{ id: 't1', name: 'Diseño', startDate: '2026-10-28', endDate: '2026-10-30', position: 0, number: 1, status: 'pending' as const, progress: 0, isMilestone: false }], dependencies: [] };
describe('Timeline', () => {
  it('covers dates beyond 420 days while rendering only the visible calendar window', () => {
    const early = { id: 'early', name: 'Inicio', startDate: '2026-01-01', endDate: '2026-01-01', position: 0, number: 1, status: 'pending' as const, progress: 0, isMilestone: false };
    const late = { id: 'late', name: 'Final', startDate: '2028-01-01', endDate: '2028-01-03', position: 1, number: 2, status: 'pending' as const, progress: 0, isMilestone: false };
    const longPlan: Project = { ...project, tasks: [early, late], dependencies: [{ id: 'dep', predecessorId: early.id, successorId: late.id }] };
    const view = render(<Timeline project={longPlan} locale="es" onMove={vi.fn()} onSelect={vi.fn()} onKeyboardNotice={vi.fn()} />);
    const scroller = view.container.querySelector('.timeline-scroll')!;
    const canvas = view.container.querySelector<HTMLElement>('.timeline-canvas')!;
    const bar = view.getByRole('button', { name: 'Final, 2028-01-01–2028-01-03' });
    const lastBarEdge = parseFloat(bar.style.left) + parseFloat(bar.style.width);
    expect(parseFloat(canvas.style.width)).toBeGreaterThan(lastBarEdge);
    expect(view.container.querySelectorAll('.timeline-days > div').length).toBeLessThan(120);
    expect(view.container.querySelectorAll('.grid-lines > span')).toHaveLength(0);
    fireEvent.scroll(scroller, { target: { scrollLeft: parseFloat(bar.style.left) - 100 } });
    expect(view.container.querySelector('.timeline-months')).toHaveTextContent(/ene.*2028/i);
    expect(view.container.querySelectorAll('.timeline-days > div').length).toBeLessThan(120);
    expect(view.container.querySelector('.dependency-lines > path')?.getAttribute('d')).toContain(`H${bar.style.left.replace('px', '')}`);
    const fullWidth = canvas.style.width;
    view.rerender(<Timeline project={{ ...longPlan, tasks: [early], dependencies: [] }} rangeTasks={longPlan.tasks} rows={[{ kind: 'task', task: early }, { kind: 'group', id: 'folded' }]} locale="es" onMove={vi.fn()} onSelect={vi.fn()} onKeyboardNotice={vi.fn()} />);
    expect(canvas.style.width).toBe(fullWidth);
  });
  it.each([1, 6])('connects the end of a %i-day predecessor to the successor across group rows', (days) => {
    const start = '2026-10-28';
    const end = `2026-${days === 1 ? '10-28' : '11-02'}`;
    const predecessor = { id: 'a', name: 'Origen', startDate: start, endDate: end, position: 0, number: 1, status: 'pending' as const, progress: 0, isMilestone: false };
    const successor = { id: 'b', name: 'Destino', startDate: '2026-11-10', endDate: '2026-11-11', position: 1, number: 2, status: 'pending' as const, progress: 0, isMilestone: false };
    const plan: Project = { ...project, tasks: [predecessor, successor], dependencies: [{ id: 'd', predecessorId: 'a', successorId: 'b' }] };
    const rows = [{ kind: 'group' as const, id: 'g' }, { kind: 'task' as const, task: predecessor }, { kind: 'group' as const, id: 'g2' }, { kind: 'task' as const, task: successor }];
    const view = render(<Timeline rows={rows} project={plan} locale="es" onMove={vi.fn()} onSelect={vi.fn()} onKeyboardNotice={vi.fn()} />);
    const bar = view.getByRole('button', { name: `Origen, ${start}–${end}` });
    const edge = parseFloat(bar.style.left) + parseFloat(bar.style.width);
    const path = view.container.querySelector('.dependency-lines > path')!;
    expect(path.getAttribute('d')).toMatch(new RegExp(`^M${edge},69 `));
  });
  it('renders task bars with their date range and weekend grid', () => {
    render(<Timeline project={project} locale="es" onMove={vi.fn()} onSelect={vi.fn()} onKeyboardNotice={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Diseño, 2026-10-28–2026-10-30' })).toBeInTheDocument();
    expect(document.querySelector('.sr-only')).toHaveTextContent('Las dependencias son fin a inicio');
  });

  it('previews keyboard date edits and commits them with Enter', () => {
    const onMove = vi.fn();
    const onKeyboardNotice = vi.fn();
    const view = render(<Timeline project={project} locale="es" onMove={onMove} onSelect={vi.fn()} onKeyboardNotice={onKeyboardNotice} />);
    const bar = view.getByRole('button', { name: 'Diseño, 2026-10-28–2026-10-30' });
    fireEvent.keyDown(bar, { key: 'Enter' });
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    fireEvent.keyDown(bar, { key: 'ArrowLeft', shiftKey: true });
    expect(view.getByRole('button', { name: 'Diseño, 2026-10-29–2026-10-30' })).toHaveAttribute('aria-pressed', 'true');
    expect(onKeyboardNotice).toHaveBeenLastCalledWith(expect.stringContaining('Vista previa de Diseño: 2026-10-29 a 2026-10-30'));
    fireEvent.keyDown(bar, { key: 'Enter' });
    expect(onMove).toHaveBeenCalledWith(project.tasks[0], '2026-10-29', '2026-10-30');
    expect(view.getByRole('button', { name: 'Diseño, 2026-10-28–2026-10-30' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('cancels a keyboard date preview with Escape', () => {
    const onMove = vi.fn();
    const onKeyboardNotice = vi.fn();
    const view = render(<Timeline project={project} locale="en" onMove={onMove} onSelect={vi.fn()} onKeyboardNotice={onKeyboardNotice} />);
    const bar = view.getByRole('button', { name: 'Diseño, 2026-10-28–2026-10-30' });
    fireEvent.keyDown(bar, { key: 'Enter' });
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    expect(onKeyboardNotice).toHaveBeenLastCalledWith(expect.stringContaining('Preview for Diseño: 2026-10-29'));
    fireEvent.keyDown(bar, { key: 'Escape' });
    expect(onMove).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Diseño, 2026-10-28–2026-10-30' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('asks what to do when focus leaves a changed keyboard preview and saves on request', async () => {
    const onMove = vi.fn();
    const view = render(<div><Timeline project={project} locale="es" onMove={onMove} onSelect={vi.fn()} onKeyboardNotice={vi.fn()} /><button type="button">Siguiente control</button></div>);
    const dialog = view.container.querySelector('dialog')!;
    Object.defineProperty(dialog, 'showModal', { configurable: true, value: () => dialog.setAttribute('open', '') });
    Object.defineProperty(dialog, 'close', { configurable: true, value: () => dialog.removeAttribute('open') });
    const bar = view.getByRole('button', { name: 'Diseño, 2026-10-28–2026-10-30' });
    fireEvent.keyDown(bar, { key: 'Enter' });
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    fireEvent.blur(bar, { relatedTarget: view.getByRole('button', { name: 'Siguiente control' }) });
    expect(await view.findByRole('heading', { name: 'Hay cambios de fechas sin guardar' })).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Guardar cambios' }));
    expect(onMove).toHaveBeenCalledWith(project.tasks[0], '2026-10-29', '2026-10-31');
  });

  it('discards keyboard preview changes when requested after focus leaves', async () => {
    const onMove = vi.fn();
    const view = render(<div><Timeline project={project} locale="en" onMove={onMove} onSelect={vi.fn()} onKeyboardNotice={vi.fn()} /><button type="button">Next control</button></div>);
    const dialog = view.container.querySelector('dialog')!;
    Object.defineProperty(dialog, 'showModal', { configurable: true, value: () => dialog.setAttribute('open', '') });
    Object.defineProperty(dialog, 'close', { configurable: true, value: () => dialog.removeAttribute('open') });
    const bar = view.getByRole('button', { name: 'Diseño, 2026-10-28–2026-10-30' });
    fireEvent.keyDown(bar, { key: 'Enter' });
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    fireEvent.blur(bar, { relatedTarget: view.getByRole('button', { name: 'Next control' }) });
    expect(await view.findByRole('heading', { name: 'Date changes are unsaved' })).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Discard changes' }));
    expect(onMove).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Diseño, 2026-10-28–2026-10-30' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps dependency creation in the task table and leaves timeline bars for schedule editing', () => {
    const onSelect = vi.fn();
    const twoTasks = { ...project, tasks: [...project.tasks, { id: 't2', name: 'Entrega', startDate: '2026-11-02', endDate: '2026-11-03', position: 1, number: 2, status: 'pending' as const, progress: 0, isMilestone: false }] };
    const view = render(<Timeline project={twoTasks} locale="es" onMove={vi.fn()} onSelect={onSelect} onKeyboardNotice={vi.fn()} />);
    expect(view.container.querySelectorAll('.dependency-start')).toHaveLength(0);
    const bar = view.getByRole('button', { name: 'Entrega, 2026-11-02–2026-11-03' });
    fireEvent.focus(bar);
    expect(onSelect).toHaveBeenCalledWith('t2');
  });

  it('cancels an interrupted pointer gesture without committing its preview', () => {
    const onMove = vi.fn();
    const view = render(<Timeline project={project} locale="es" onMove={onMove} onSelect={vi.fn()} onKeyboardNotice={vi.fn()} />);
    const bar = view.getByRole('button', { name: 'Diseño, 2026-10-28–2026-10-30' });
    const body = document.querySelector('.timeline-body');
    fireEvent.pointerDown(bar, { pointerId: 1, clientX: 10 });
    fireEvent.pointerMove(body!, { pointerId: 1, clientX: 78 });
    expect(view.getByRole('button', { name: 'Diseño, 2026-10-30–2026-11-01' })).toBeInTheDocument();
    fireEvent.pointerCancel(body!, { pointerId: 1 });
    expect(onMove).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Diseño, 2026-10-28–2026-10-30' })).toBeInTheDocument();
  });
});
