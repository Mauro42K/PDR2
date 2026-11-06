import { useState } from 'react';
import { componentMessages } from '../component-messages.js';
import type { Locale } from '../../shared/model.js';

type Props = {
  kind: 'task' | 'group';
  itemId: string;
  name: string;
  note: string;
  locale: Locale;
  onOpen: (trigger: HTMLButtonElement) => void;
};

/** Shared note affordance: hover/focus previews the text; activation opens the editor. */
export function NotePreviewTrigger({ kind, itemId, name, note, locale, onOpen }: Props) {
  const [placement, setPlacement] = useState<'above' | 'below'>('below');
  const copy = componentMessages(locale);
  const label = kind === 'task' ? copy.taskNote(name) : copy.groupNote(name);
  const id = `${kind}-note-preview-${itemId}`;
  const placePreview = (trigger: HTMLButtonElement) => {
    const bounds = trigger.getBoundingClientRect();
    setPlacement(window.innerHeight - bounds.bottom < bounds.top ? 'above' : 'below');
  };
  return (
    <button
      type="button"
      className={`note-preview-trigger ${kind}-note-preview-trigger`}
      aria-label={label}
      aria-haspopup="dialog"
      aria-describedby={id}
      onMouseEnter={(event) => placePreview(event.currentTarget)}
      onFocus={(event) => placePreview(event.currentTarget)}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <span className={`note-mark ${kind}-note-mark`} aria-hidden="true" />
      <span className={`note-preview note-preview-${placement}`} id={id} role="tooltip">
        {note}
      </span>
    </button>
  );
}
