import type { Locale } from '../shared/model.js';
import { componentMessages } from './component-messages.js';

/** Keyboard shortcuts for the timeline, listed in the shortcuts dialog. */
export function keyboardShortcuts(locale: Locale): { keys: string; action: string }[] {
  return componentMessages(locale).shortcuts.map((shortcut) => ({ ...shortcut }));
}
