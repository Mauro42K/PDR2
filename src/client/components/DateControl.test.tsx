import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateControl } from './DateControl.js';

describe('DateControl', () => {
  it('opens a calendar, disables dates outside the valid range, and selects a day', () => {
    const onChange = vi.fn();
    render(<DateControl value="2026-11-23" min="2026-11-20" locale="es" ariaLabel="Inicio nueva" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Inicio nueva/ }));

    expect(screen.getByRole('dialog', { name: /noviembre de 2026/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /15 de noviembre de 2026/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /24 de noviembre de 2026/i }));

    expect(onChange).toHaveBeenCalledWith('2026-11-24');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves between months and closes with Escape while restoring focus', async () => {
    render(<DateControl value="2026-11-23" locale="en" ariaLabel="Start date" onChange={() => undefined} />);
    const trigger = screen.getByRole('button', { name: /Start date/ });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));

    expect(screen.getByRole('dialog', { name: /December 2026/i })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('keeps one calendar date in the Tab order and supports arrow-key movement', () => {
    render(<DateControl value="2026-11-23" locale="en" ariaLabel="Start date" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Start date/ }));
    const grid = screen.getByRole('grid', { name: /November 2026/i });
    const enabledDays = grid.querySelectorAll<HTMLButtonElement>('.date-picker-day:not(:disabled)');
    expect(screen.getAllByRole('row')).toHaveLength(7);
    expect(Array.from(enabledDays).filter((button) => button.tabIndex === 0)).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Monday, November 23, 2026/i })).toHaveFocus();

    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: /Tuesday, November 24, 2026/i })).toHaveFocus();
    expect(Array.from(grid.querySelectorAll<HTMLButtonElement>('.date-picker-day:not(:disabled)')).filter((button) => button.tabIndex === 0)).toHaveLength(1);
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: /Tuesday, December 1, 2026/i })).toHaveFocus();
  });
});
