import { describe, expect, it } from 'vitest';
import { ApiError } from './api.js';
import { localizedApiError } from './api-errors.js';

describe('localized API errors', () => {
  it('translates a recognized code in both languages without using server text', () => {
    const error = new ApiError('legacy server text', 400, { code: 'invalid_project_name' });
    expect(localizedApiError(error, 'es', 'fallback')).toBe(
      'El nombre del proyecto debe tener entre 1 y 160 caracteres.',
    );
    expect(localizedApiError(error, 'en', 'fallback')).toBe(
      'Project name must be between 1 and 160 characters.',
    );
  });
  it('keeps the progress validation message specific in both languages', () => {
    const error = new ApiError('legacy', 400, { code: 'invalid_task_progress' });
    expect(localizedApiError(error, 'es', 'fallback')).toBe(
      'El progreso de una tarea debe ser un número entero entre 0 y 100.',
    );
    expect(localizedApiError(error, 'en', 'fallback')).toBe(
      'Task progress must be an integer between 0 and 100.',
    );
  });
  it('uses the localized fallback for unknown codes and non-API errors', () => {
    expect(
      localizedApiError(
        new ApiError('server details', 400, { code: 'new_code' }),
        'en',
        'Please try again.',
      ),
    ).toBe('Please try again.');
    expect(localizedApiError(new Error('network details'), 'es', 'Inténtalo de nuevo.')).toBe(
      'Inténtalo de nuevo.',
    );
  });
});
