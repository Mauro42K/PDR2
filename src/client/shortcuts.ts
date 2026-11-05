import type { Locale } from '../shared/model.js';

/** Keyboard shortcuts for the timeline, listed in the shortcuts dialog. */
export function keyboardShortcuts(locale: Locale): { keys: string; action: string }[] {
  return locale === 'es'
    ? [
      { keys: 'Tab', action: 'Seleccionar una barra' },
      { keys: 'Enter', action: 'Editar la barra seleccionada; guardar la edición' },
      { keys: '← / →', action: 'Mover la tarea un día' },
      { keys: 'Mayús + ← / →', action: 'Ajustar el fin de la tarea' },
      { keys: 'Tab al campo de fecha, Enter', action: 'Abrir el calendario; flechas para moverse, Enter para elegir, Esc para cerrar' },
      { keys: 'Esc', action: 'Cancelar la edición' },
      { keys: '?', action: 'Mostrar esta ayuda' }
    ]
    : [
      { keys: 'Tab', action: 'Select a bar' },
      { keys: 'Enter', action: 'Edit the selected bar; save the edit' },
      { keys: '← / →', action: 'Move the task one day' },
      { keys: 'Shift + ← / →', action: 'Adjust the task end' },
      { keys: 'Tab to date field, Enter', action: 'Open the calendar; arrows to move, Enter to choose, Esc to close' },
      { keys: 'Esc', action: 'Cancel the edit' },
      { keys: '?', action: 'Show this help' }
    ];
}
