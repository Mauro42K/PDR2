import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { ApiError, api } from './api.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api.js')>();
  return { ...actual, api: { projects: vi.fn() } };
});
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
describe('localized startup API errors', () => {
  it('shows a known error in English without showing the legacy Spanish message', async () => {
    localStorage.setItem('pdr2-locale', 'en');
    vi.mocked(api.projects).mockRejectedValue(
      new ApiError('mensaje antiguo', 400, { code: 'invalid_project_name' }),
    );
    render(<App />);
    expect(
      await screen.findByText('Project name must be between 1 and 160 characters.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('mensaje antiguo')).not.toBeInTheDocument();
  });
  it('shows Spanish for a known code and hides unknown server details after retry', async () => {
    vi.mocked(api.projects)
      .mockRejectedValueOnce(new ApiError('legacy', 400, { code: 'invalid_project_name' }))
      .mockRejectedValueOnce(new ApiError('private diagnostic', 500, { code: 'unrecognized' }));
    render(<App />);
    expect(
      await screen.findByText('El nombre del proyecto debe tener entre 1 y 160 caracteres.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      (await screen.findAllByText('Sin conexión con la aplicación local')).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('private diagnostic')).not.toBeInTheDocument();
  });
});
