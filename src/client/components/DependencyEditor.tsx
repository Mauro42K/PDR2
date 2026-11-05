import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Dependency, Locale, Task, TaskGroup } from '../../shared/model.js';
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
export function DependencyEditor({ task, tasks, groups, dependencies, locale, saving, onAdd, onRemove }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [candidate, setCandidate] = useState('');
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const menu = toggleRef.current?.closest('details.row-actions');
    if (!(menu instanceof HTMLDetailsElement)) return;
    // The native toggle event is queued; opening must not erase edits made
    // immediately after a user activates the editor.
    const resetDraft = () => { if (!menu.open) { setExpanded(false); setCandidate(''); } };
    menu.addEventListener('toggle', resetDraft);
    return () => menu.removeEventListener('toggle', resetDraft);
  }, []);
  useLayoutEffect(() => {
    const menu = toggleRef.current?.closest('details.row-actions');
    if (menu instanceof HTMLDetailsElement) positionRowActions(menu);
  }, [expanded, candidate, dependencies.length]);
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
    event.preventDefault(); event.stopPropagation(); setExpanded(false); setCandidate(''); toggleRef.current?.focus();
  };
  return <div className="dependency-editor" onKeyDown={onKeyDown}>
    <button ref={toggleRef} type="button" aria-expanded={expanded} onClick={() => { if (expanded) setCandidate(''); setExpanded((value) => !value); }}>
      {locale === 'es' ? 'Predecesoras' : 'Predecessors'} <span className="dependency-count">{incoming.length}</span>
    </button>
    {expanded && <div className="dependency-editor-body">
      <p className="dependency-direction">{locale === 'es' ? 'Terminan antes de' : 'Finish before'} <strong>{task.name}</strong></p>
      {incoming.length ? <ul className="dependency-editor-list">{incoming.map((dependency) => {
        const source = tasks.find((item) => item.id === dependency.predecessorId);
        const sourceLabel = source ? taskReference(source, groups, locale) : '—';
        return <li key={dependency.id}><span>{sourceLabel}</span><button type="button" disabled={saving} aria-label={`${locale === 'es' ? 'Quitar predecesora' : 'Remove predecessor'}: ${sourceLabel} → ${taskReference(task, groups, locale)}`} onClick={() => void onRemove(dependency.id)}>{locale === 'es' ? 'Quitar' : 'Remove'}</button></li>;
      })}</ul> : <p className="dependency-editor-empty">{locale === 'es' ? 'Sin predecesoras.' : 'No predecessors.'}</p>}
      <form onSubmit={(event) => void submit(event)}>
        <label>{locale === 'es' ? 'Añadir predecesora' : 'Add predecessor'}
          <select aria-label={`${locale === 'es' ? 'Predecesora para' : 'Predecessor for'} ${task.name}`} value={candidate} onChange={(event) => setCandidate(event.target.value)}>
            <option value="">{locale === 'es' ? 'Selecciona una tarea' : 'Select a task'}</option>
            {tasks.filter((item) => item.id !== task.id).map((item) => <option key={item.id} value={item.id} disabled={incoming.some((dependency) => dependency.predecessorId === item.id)}>{taskReference(item, groups, locale)}{incoming.some((dependency) => dependency.predecessorId === item.id) ? (locale === 'es' ? ' (ya añadida)' : ' (already added)') : ''}</option>)}
          </select>
        </label>
        {overlap && <p className="dependency-warning" role="status">{locale === 'es' ? 'Las fechas se superponen; la sucesora comienza antes de que termine la predecesora.' : 'Dates overlap; the successor starts before the predecessor finishes.'}</p>}
        <div className="dependency-editor-actions"><button type="submit" className="dependency-editor-add" disabled={!candidate || saving || incoming.some((dependency) => dependency.predecessorId === candidate)}>{locale === 'es' ? 'Conectar' : 'Connect'}</button>{candidate && <button type="button" onClick={() => setCandidate('')}>{locale === 'es' ? 'Cancelar' : 'Cancel'}</button>}</div>
      </form>
    </div>}
  </div>;
}
