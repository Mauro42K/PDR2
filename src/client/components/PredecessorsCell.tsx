import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dependency, Locale, Task, TaskGroup } from '../../shared/model.js';
import { taskReference } from '../taskReference.js';

type Props = {
  task: Task;
  tasks: Task[];
  groups: TaskGroup[];
  dependencies: Dependency[];
  locale: Locale;
  saving: boolean;
  onChange: (
    successorId: string,
    predecessorIds: string[],
  ) => Promise<'saved' | 'rejected' | 'failed' | 'cycle'>;
};

/** Compact inline row-number editor; values never expand over the Gantt. */
export function PredecessorsCell({
  task,
  tasks,
  groups,
  dependencies,
  locale,
  saving,
  onChange,
}: Props) {
  const incoming = dependencies.filter((dependency) => dependency.successorId === task.id);
  const taskNumbers = useMemo(
    () => new Map(tasks.map((item) => [item.id, String(item.number)])),
    [tasks],
  );
  const labels = incoming.map((dependency) => {
    const source = tasks.find((item) => item.id === dependency.predecessorId);
    return source
      ? `${taskNumbers.get(source.id)} · ${taskReference(source, groups, locale)}`
      : '—';
  });
  const numberList = incoming
    .map((dependency) => Number(taskNumbers.get(dependency.predecessorId)))
    .sort((a, b) => a - b)
    .join(', ');
  const title = labels.length
    ? labels.join('\n')
    : locale === 'es'
      ? 'Sin predecesoras'
      : 'No predecessors';
  const hasConflict = incoming.some(
    (dependency) =>
      (tasks.find((item) => item.id === dependency.predecessorId)?.endDate ?? '') >= task.startDate,
  );
  const [draft, setDraft] = useState(numberList);
  const [editing, setEditing] = useState(false);
  const [validationError, setValidationError] = useState('');
  // A rejected cycle keeps the typed numbers on screen with the reason, instead of erasing them.
  const [rejected, setRejected] = useState<string | null>(null);
  const skipBlurCommit = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(numberList);
  }, [editing, numberList]);

  /** Returns the task numbers typed in the draft, or null after showing the reason it is invalid. */
  const validateDraft = (): number[] | null => {
    const value = draft.trim();
    if (!value) return [];
    const parts = value.split(',').map((part) => part.trim());
    if (parts.some((part) => !/^\d+$/.test(part))) {
      setValidationError(
        locale === 'es'
          ? 'Usa números de tarea separados por comas.'
          : 'Use task numbers separated by commas.',
      );
      return null;
    }
    const numbers = parts.map(Number);
    if (new Set(numbers).size !== numbers.length) {
      setValidationError(
        locale === 'es' ? 'No repitas un número de tarea.' : 'Do not repeat a task number.',
      );
      return null;
    }
    const missing = numbers.find((number) => !tasks.some((item) => item.number === number));
    if (missing !== undefined) {
      setValidationError(
        locale === 'es'
          ? `No existe ninguna tarea con el número ${missing}.`
          : `There is no task with number ${missing}.`,
      );
      return null;
    }
    if (numbers.includes(task.number)) {
      setValidationError(
        locale === 'es'
          ? 'Una tarea no puede depender de sí misma.'
          : 'A task cannot depend on itself.',
      );
      return null;
    }
    return numbers;
  };

  const commit = async (source: 'blur' | 'enter') => {
    if (!editing || saving) return;
    const numbers = validateDraft();
    if (!numbers) {
      // An invalid draft never reaches the server. Leaving the field reverts it and keeps the reason visible.
      if (source === 'blur') {
        setDraft(numberList);
        setEditing(false);
      }
      return;
    }
    const predecessorIds = numbers.map(
      (number) => tasks.find((item) => item.number === number)!.id,
    );
    const existingIds = incoming.map((dependency) => dependency.predecessorId).sort();
    const nextIds = [...predecessorIds].sort();
    setValidationError('');
    if (
      existingIds.length === nextIds.length &&
      existingIds.every((id, index) => id === nextIds[index])
    ) {
      setEditing(false);
      return;
    }
    const result = await onChange(task.id, predecessorIds);
    if (result === 'cycle') {
      setRejected(draft);
      setEditing(false);
      setValidationError(
        locale === 'es'
          ? 'Esa predecesora crearía un ciclo de dependencias.'
          : 'That predecessor would create a dependency cycle.',
      );
      return;
    }
    if (result !== 'failed') {
      if (result === 'rejected') setDraft(numberList);
      setEditing(false);
    }
  };

  const label =
    locale === 'es'
      ? `Predecesoras de ${task.name}; escribe números de tarea separados por comas`
      : `Predecessors of ${task.name}; enter row numbers separated by commas`;
  const conflictLabel = locale === 'es' ? 'Las fechas se superponen.' : 'Dates overlap.';

  return (
    <div className={`predecessors-cell${editing ? ' is-editing' : ''}`} title={title}>
      <input
        aria-label={label}
        aria-invalid={!!validationError}
        aria-describedby={validationError ? `predecessor-error-${task.id}` : undefined}
        inputMode="text"
        value={editing ? draft : (rejected ?? numberList)}
        placeholder="—"
        maxLength={200}
        disabled={saving}
        onFocus={() => {
          if (!editing) setDraft(numberList);
          setRejected(null);
          setEditing(true);
          setValidationError('');
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          setValidationError('');
        }}
        onBlur={() => {
          if (skipBlurCommit.current) {
            skipBlurCommit.current = false;
            return;
          }
          void commit('blur');
        }}
        onKeyDown={(event) => {
          // Enter leaves the field only when the draft is valid, so the user can correct an invalid one in place.
          if (event.key === 'Enter') {
            event.preventDefault();
            if (validateDraft() !== null) event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            skipBlurCommit.current = true;
            setDraft(numberList);
            setEditing(false);
            setValidationError('');
            event.currentTarget.blur();
          }
        }}
      />
      {hasConflict && (
        <span
          className="predecessor-conflict-mark"
          aria-label={conflictLabel}
          title={conflictLabel}
        >
          !
        </span>
      )}
      {validationError && (
        <span className="predecessor-error" id={`predecessor-error-${task.id}`} role="status">
          {validationError}
        </span>
      )}
    </div>
  );
}
