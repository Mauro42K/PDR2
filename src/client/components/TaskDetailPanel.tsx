import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  TASK_STATUSES,
  type Dependency,
  type Locale,
  type Task,
  type TaskGroup,
  type TaskStatus,
} from '../../shared/model.js';
import { durationDays } from '../../shared/model.js';
import { ProgressInput } from './ProgressInput.js';
import { DateControl } from './DateControl.js';
import { messages } from '../i18n.js';
import { PredecessorsCell } from './PredecessorsCell.js';

type Props = {
  task: Task;
  number: number;
  tasks: Task[];
  groups: TaskGroup[];
  dependencies: Dependency[];
  locale: Locale;
  saving: boolean;
  planningNotice?: string;
  onRename: (name: string) => void;
  onDates: (startDate: string, endDate: string) => void;
  onPlanning: (
    patch: Partial<Pick<Task, 'status' | 'progress' | 'isMilestone' | 'endDate'>>,
  ) => void;
  onGroup: (groupId: string | null) => void;
  onPredecessors: ComponentProps<typeof PredecessorsCell>['onChange'];
  onNote: (trigger: HTMLElement) => void;
  onDelete: (trigger: HTMLElement) => void;
  onClose: () => void;
};

/** Selected task details: the fields a user edits without opening the row menu. */
export function TaskDetailPanel({
  task,
  number,
  tasks,
  groups,
  dependencies,
  locale,
  saving,
  planningNotice,
  onRename,
  onDates,
  onPlanning,
  onGroup,
  onPredecessors,
  onNote,
  onDelete,
  onClose,
}: Props) {
  const [name, setName] = useState(task.name);
  // Escape restores the saved name and must not trigger the save that the blur would otherwise start.
  const cancelling = useRef(false);
  useEffect(() => setName(task.name), [task.id, task.name]);
  const es = locale === 'es';
  const commitName = () => {
    const next = name.trim();
    if (!next || next === task.name) {
      setName(task.name);
      return;
    }
    onRename(next);
  };
  const days = task.isMilestone ? 0 : Math.round(durationDays(task));
  const noteLabel = task.note?.trim()
    ? es
      ? 'Ver o editar nota'
      : 'View or edit note'
    : es
      ? 'Añadir nota'
      : 'Add note';

  return (
    <section className="task-detail" aria-labelledby="task-detail-heading">
      <div className="task-detail-head">
        <span className="task-detail-index">{String(number).padStart(2, '0')}</span>
        <h2 id="task-detail-heading" className="sr-only">
          {es ? 'Detalle de la tarea' : 'Task details'}
        </h2>
        <input
          className="task-detail-name"
          aria-label={es ? 'Nombre de la tarea' : 'Task name'}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            if (cancelling.current) {
              cancelling.current = false;
              return;
            }
            commitName();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              cancelling.current = true;
              setName(task.name);
              event.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="modal-close"
          aria-label={es ? 'Cerrar detalle' : 'Close details'}
          data-tip={es ? 'Cerrar detalle' : 'Close details'}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="task-detail-grid">
        <div className="task-detail-field">
          <span>{es ? 'Inicio' : 'Start'}</span>
          <DateControl
            className="task-detail-date"
            ariaLabel={`${es ? 'Inicio' : 'Start'} ${task.name}`}
            locale={locale}
            value={task.startDate}
            max={task.isMilestone ? undefined : task.endDate}
            onChange={(next) => {
              if (next) onDates(next, task.isMilestone ? next : task.endDate);
            }}
          />
        </div>
        <div className="task-detail-field">
          <span>{es ? 'Fin' : 'End'}</span>
          {task.isMilestone ? (
            <output className="task-detail-date">{task.endDate}</output>
          ) : (
            <DateControl
              className="task-detail-date"
              ariaLabel={`${es ? 'Fin' : 'End'} ${task.name}`}
              locale={locale}
              value={task.endDate}
              min={task.startDate}
              onChange={(next) => {
                if (next && next >= task.startDate) onDates(task.startDate, next);
              }}
            />
          )}
        </div>
        <div className="task-detail-field">
          <span>{es ? 'Duración' : 'Duration'}</span>
          <output className="task-detail-duration">
            {days} {es ? (days === 1 ? 'día' : 'días') : days === 1 ? 'day' : 'days'}
          </output>
        </div>
        <label className="task-detail-field">
          <span>{es ? 'Grupo' : 'Group'}</span>
          <select
            value={task.groupId ?? ''}
            onChange={(event) => onGroup(event.target.value || null)}
          >
            <option value="">{es ? 'Sin grupo' : 'Ungrouped'}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <label className="task-detail-field">
          <span>{es ? 'Estado' : 'Status'}</span>
          <select
            value={task.status}
            disabled={saving}
            onChange={(event) => onPlanning({ status: event.target.value as TaskStatus })}
          >
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusText(status, messages(locale))}
              </option>
            ))}
          </select>
        </label>
        <label className="task-detail-field">
          <span>{es ? 'Avance' : 'Progress'}</span>
          <ProgressInput
            progress={task.progress}
            saving={saving}
            onSave={(progress) => onPlanning({ progress })}
          />
        </label>
        <label className="task-detail-field task-detail-check">
          <input
            type="checkbox"
            checked={task.isMilestone}
            disabled={saving}
            onChange={(event) =>
              onPlanning(
                event.target.checked
                  ? { isMilestone: true, endDate: task.startDate }
                  : { isMilestone: false },
              )
            }
          />
          <span>{es ? 'Hito' : 'Milestone'}</span>
        </label>
        <div className="task-detail-field">
          <span>{es ? 'Predecesoras' : 'Predecessors'}</span>
          <PredecessorsCell
            task={task}
            tasks={tasks}
            groups={groups}
            dependencies={dependencies}
            locale={locale}
            saving={saving}
            onChange={onPredecessors}
          />
        </div>
      </div>
      {planningNotice && (
        <p className="planning-notice planning-notice-detail" role="status">
          {planningNotice}
        </p>
      )}
      <div className="task-detail-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={(event) => onNote(event.currentTarget)}
        >
          {noteLabel}
        </button>
        <button
          type="button"
          className="danger-text-button"
          onClick={(event) => onDelete(event.currentTarget)}
        >
          {es ? 'Eliminar tarea' : 'Delete task'}
        </button>
      </div>
    </section>
  );
}

function statusText(status: TaskStatus, t: ReturnType<typeof messages>) {
  return status === 'pending'
    ? t.statusPending
    : status === 'in_progress'
      ? t.statusInProgress
      : status === 'blocked'
        ? t.statusBlocked
        : t.statusCompleted;
}
