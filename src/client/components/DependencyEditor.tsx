import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type { Dependency, Locale, Task, TaskGroup } from '../../shared/model.js';
import { componentMessages } from '../component-messages.js';
import { taskReference } from '../taskReference.js';
import { positionRowActions } from '../positionRowActions.js';

type Props = {
  task: Task;
  tasks: Task[];
  groups: TaskGroup[];
  dependencies: Dependency[];
  locale: Locale;
  saving: boolean;
  onAdd: (predecessorId: string, successorId: string) => Promise<boolean>;
  onRemove: (dependencyId: string) => Promise<boolean>;
};

/** Contextual editor for incoming relationships; persistence and validation remain in the API. */
export function DependencyEditor({
  task,
  tasks,
  groups,
  dependencies,
  locale,
  saving,
  onAdd,
  onRemove,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [candidate, setCandidate] = useState('');
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const menu = toggleRef.current?.closest('details.row-actions');
    if (!(menu instanceof HTMLDetailsElement)) return;
    // The native toggle event is queued; opening must not erase edits made
    // immediately after a user activates the editor.
    const resetDraft = () => {
      if (!menu.open) {
        setExpanded(false);
        setCandidate('');
      }
    };
    menu.addEventListener('toggle', resetDraft);
    return () => menu.removeEventListener('toggle', resetDraft);
  }, []);
  useLayoutEffect(() => {
    const menu = toggleRef.current?.closest('details.row-actions');
    if (menu instanceof HTMLDetailsElement) positionRowActions(menu);
  }, [expanded, candidate, dependencies.length]);
  const copy = componentMessages(locale);
  const incoming = dependencies.filter((dependency) => dependency.successorId === task.id);
  const chosen = tasks.find((item) => item.id === candidate);
  const overlap = !!chosen && chosen.endDate >= task.startDate;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!candidate || saving) return;
    if (await onAdd(candidate, task.id)) setCandidate('');
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !expanded) return;
    event.preventDefault();
    event.stopPropagation();
    setExpanded(false);
    setCandidate('');
    toggleRef.current?.focus();
  };
  return (
    <div className="dependency-editor" onKeyDown={onKeyDown}>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          if (expanded) setCandidate('');
          setExpanded((value) => !value);
        }}
      >
        {copy.predecessors} <span className="dependency-count">{incoming.length}</span>
      </button>
      {expanded && (
        <div className="dependency-editor-body">
          <p className="dependency-direction">
            {copy.finishesBefore} <strong>{task.name}</strong>
          </p>
          {incoming.length ? (
            <ul className="dependency-editor-list">
              {incoming.map((dependency) => {
                const source = tasks.find((item) => item.id === dependency.predecessorId);
                const sourceLabel = source ? taskReference(source, groups, locale) : '—';
                return (
                  <li key={dependency.id}>
                    <span>{sourceLabel}</span>
                    <button
                      type="button"
                      disabled={saving}
                      aria-label={`${copy.removePredecessor}: ${sourceLabel} → ${taskReference(task, groups, locale)}`}
                      onClick={() => void onRemove(dependency.id)}
                    >
                      {copy.remove}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dependency-editor-empty">{copy.noPredecessors}</p>
          )}
          <form onSubmit={(event) => void submit(event)}>
            <label>
              {copy.addPredecessor}
              <select
                aria-label={copy.predecessorFor(task.name)}
                value={candidate}
                onChange={(event) => setCandidate(event.target.value)}
              >
                <option value="">{copy.selectTask}</option>
                {tasks
                  .filter((item) => item.id !== task.id)
                  .map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                      disabled={incoming.some((dependency) => dependency.predecessorId === item.id)}
                    >
                      {taskReference(item, groups, locale)}
                      {incoming.some((dependency) => dependency.predecessorId === item.id)
                        ? copy.alreadyAdded
                        : ''}
                    </option>
                  ))}
              </select>
            </label>
            {overlap && (
              <p className="dependency-warning" role="status">
                {copy.overlapWarning}
              </p>
            )}
            <div className="dependency-editor-actions">
              <button
                type="submit"
                className="dependency-editor-add"
                disabled={
                  !candidate ||
                  saving ||
                  incoming.some((dependency) => dependency.predecessorId === candidate)
                }
              >
                {copy.connect}
              </button>
              {candidate && (
                <button type="button" onClick={() => setCandidate('')}>
                  {copy.cancel}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
