import { apiErrorMessages } from '../shared/api-errors.js';
import type { Locale } from '../shared/model.js';
import { ApiError } from './api.js';

export function localizedApiError(error: unknown, locale: Locale, fallback: string): string {
  if (!(error instanceof ApiError) || !error.data || typeof error.data !== 'object')
    return fallback;
  const code = (error.data as { code?: unknown }).code;
  if (typeof code !== 'string' || !Object.hasOwn(apiErrorMessages, code)) return fallback;
  const translations = apiErrorMessages[code as keyof typeof apiErrorMessages];
  return translations[locale === 'es' ? 0 : 1];
}
