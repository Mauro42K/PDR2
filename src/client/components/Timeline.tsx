import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Dependency, Project, Task } from '../../shared/model.js';
import { dayMs, groupSummary, isISODate } from '../../shared/model.js';
import { messages } from '../i18n.js';
import type { Locale } from '../../shared/model.js';

type TimelineRow = { kind: 'group'; id: string } | { kind: 'task'; task: Task };
type Props = {
  rows?: TimelineRow[];
  project: Project;
  rangeTasks?: Task[];
  locale: Locale;
  zoom?: number | 'fit';
  rowHeight?: number;
  showProgress?: boolean;
  onMove: (task: Task, start: string, end: string) => void;
  onSelect: (id: string) => void;
  onKeyboardNotice: (notice: string) => void;
};
const day = (value: string) => Date.parse(`${value}T00:00:00Z`);
const toDate = (value: number) => new Date(value).toISOString().slice(0, 10);
const shift = (date: string, days: number) => toDate(day(date) + days * dayMs);
// Canvas budgets in pixels (F3-02, sección 5.2). Segments keep every canvas well below browser layout limits.
const MAX_UNSEGMENTED_PX = 3_400_000;
const SEGMENT_PX = 680_000;
const MILESTONE_PX = 16;

export function Timeline({
  project,
  rows,
  rangeTasks = project.tasks,
  locale,
  zoom = 34,
  rowHeight = 46,
  showProgress = false,
  onMove,
  onSelect,
  onKeyboardNotice,
}: Props) {
  const displayRows: TimelineRow[] = rows ?? project.tasks.map((task) => ({ kind: 'task', task }));
  const groupsById = useMemo(
    () => new Map((project.groups ?? []).map((group) => [group.id, group])),
    [project.groups],
  );
  const t = messages(locale);
  const scroller = useRef<HTMLDivElement>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const focusAfterDecision = useRef<HTMLElement | null>(null);
  const [confirmingBlur, setConfirmingBlur] = useState(false);
  const [gesture, setGesture] = useState<{
    id: string;
    x: number;
    start: string;
    end: string;
    mode: 'move' | 'left' | 'right';
    preview: number;
  } | null>(null);
  const [keyboardEdit, setKeyboardEdit] = useState<{
    id: string;
    start: string;
    end: string;
    action: 'move' | 'resize';
  } | null>(null);
  const [viewport, setViewport] = useState({ left: 0, width: 800 });
  const [segment, setSegment] = useState(0);
  const [jumpDate, setJumpDate] = useState('');
  const pendingScroll = useRef<number | null>(null);
  useEffect(() => {
    setSegment(0);
    setJumpDate('');
    pendingScroll.current = 0;
  }, [project.id]);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const update = () =>
      setViewport({ left: element.scrollLeft, width: element.clientWidth || 800 });
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, []);
  useEffect(() => {
    const dialog = confirmDialog.current;
    if (confirmingBlur && dialog && !dialog.open) dialog.showModal();
  }, [confirmingBlur]);
  const finishBlurDecision = (decision: 'save' | 'discard' | 'continue') => {
    const edit = keyboardEdit;
    const task = edit && project.tasks.find((item) => item.id === edit.id);
    const dialog = confirmDialog.current;
    if (
      decision === 'save' &&
      edit &&
      task &&
      (edit.start !== task.startDate || edit.end !== task.endDate)
    )
      onMove(task, edit.start, edit.end);
    if (decision !== 'continue') setKeyboardPreview(null);
    setConfirmingBlur(false);
    if (dialog?.open) dialog.close();
    const target =
      (decision === 'continue' ? null : focusAfterDecision.current) ??
      (task ? document.getElementById(`task-bar-${task.id}`) : null);
    focusAfterDecision.current = null;
    requestAnimationFrame(() => target?.focus());
  };
  const { first: rangeFirst, count: rangeCount } = useMemo(() => {
    if (!rangeTasks.length) {
      const now = new Date();
      const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7);
      return { first: start, count: 35 };
    }
    const min = Math.min(...rangeTasks.map((x) => day(x.startDate)));
    const max = Math.max(...rangeTasks.map((x) => day(x.endDate)));
    const firstDate = min - 3 * dayMs;
    const size = Math.max(35, Math.ceil((max - firstDate) / dayMs) + 8);
    return { first: firstDate, count: size };
  }, [rangeTasks]);
  // Ajustar: el zoom cubre el rango completo en el ancho visible, entre 8 y 50 px por día.
  const dayWidth =
    zoom === 'fit' ? Math.min(50, Math.max(8, Math.floor(viewport.width / rangeCount))) : zoom;
  const MAX_UNSEGMENTED_DAYS = Math.floor(MAX_UNSEGMENTED_PX / dayWidth);
  const SEGMENT_DAYS = Math.floor(SEGMENT_PX / dayWidth);
  const segmentCount = rangeCount > MAX_UNSEGMENTED_DAYS ? Math.ceil(rangeCount / SEGMENT_DAYS) : 1;
  const activeSegment = Math.min(segment, segmentCount - 1);
  const first = rangeFirst + (segmentCount > 1 ? activeSegment * SEGMENT_DAYS * dayMs : 0);
  const count =
    segmentCount > 1
      ? Math.min(SEGMENT_DAYS, rangeCount - activeSegment * SEGMENT_DAYS)
      : rangeCount;
  const segmentLast = first + (count - 1) * dayMs;
  useLayoutEffect(() => {
    if (pendingScroll.current === null || !scroller.current) return;
    scroller.current.scrollLeft = pendingScroll.current;
    setViewport({ left: scroller.current.scrollLeft, width: scroller.current.clientWidth || 800 });
    pendingScroll.current = null;
  }, [first]);
  const navigateSegment = (next: number, position = 0) => {
    const target = Math.max(0, Math.min(segmentCount - 1, next));
    if (target === activeSegment && scroller.current) {
      scroller.current.scrollLeft = position;
      setViewport({
        left: scroller.current.scrollLeft,
        width: scroller.current.clientWidth || 800,
      });
    } else {
      pendingScroll.current = position;
      setSegment(target);
    }
  };
  const jumpToDate = (value: string) => {
    setJumpDate(value);
    if (!isISODate(value)) return;
    const offset = Math.floor((day(value) - rangeFirst) / dayMs);
    if (offset < 0 || offset >= rangeCount) return;
    const target = Math.floor(offset / SEGMENT_DAYS);
    navigateSegment(target, (offset % SEGMENT_DAYS) * dayWidth);
  };
  // Render only dates near the viewport, while the canvas covers the full range.
  // One month of overscan keeps the current month label available while scrolling.
  const visibleStart = Math.min(count - 1, Math.max(0, Math.floor(viewport.left / dayWidth) - 40));
  const visibleEnd = Math.min(count, Math.ceil((viewport.left + viewport.width) / dayWidth) + 40);
  const labels = useMemo(
    () =>
      Array.from({ length: Math.max(0, visibleEnd - visibleStart) }, (_, offset) => {
        const index = visibleStart + offset;
        return { index, date: new Date(first + index * dayMs) };
      }),
    [first, visibleStart, visibleEnd],
  );
  const saturdayOffset = ((6 - new Date(first).getUTCDay() + 7) % 7) * dayWidth;
  const px = (date: string) => ((day(date) - first) / dayMs) * dayWidth;
  const previewNotice = (edit: NonNullable<typeof keyboardEdit>, task: Task) =>
    t.keyboardPreview
      .replace('{task}', task.name)
      .replace('{start}', edit.start)
      .replace('{end}', edit.end)
      .replace('{action}', edit.action === 'move' ? t.keyboardMove : t.keyboardResize);
  const setKeyboardPreview = (edit: NonNullable<typeof keyboardEdit> | null, task?: Task) => {
    setKeyboardEdit(edit);
    onKeyboardNotice(edit && task ? previewNotice(edit, task) : '');
  };
  const pointerDown = (event: React.PointerEvent, task: Task, mode: 'move' | 'left' | 'right') => {
    if (task.isMilestone && mode !== 'move') return;
    event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === 'function')
      event.currentTarget.setPointerCapture(event.pointerId);
    setKeyboardPreview(null);
    setGesture({
      id: task.id,
      x: event.clientX,
      start: task.startDate,
      end: task.endDate,
      mode,
      preview: 0,
    });
  };
  const cancelGesture = () => setGesture(null);
  const barKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, task: Task) => {
    if (confirmingBlur) return;
    if (event.key === 'Escape') {
      if (keyboardEdit?.id === task.id || gesture?.id === task.id) {
        event.preventDefault();
        event.stopPropagation();
        setKeyboardPreview(null);
        setGesture(null);
      }
      return;
    }
    if (!keyboardEdit || keyboardEdit.id !== task.id) {
      if (event.key === 'Enter') {
        event.preventDefault();
        setKeyboardPreview(
          { id: task.id, start: task.startDate, end: task.endDate, action: 'move' },
          task,
        );
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (keyboardEdit.start !== task.startDate || keyboardEdit.end !== task.endDate)
        onMove(task, keyboardEdit.start, keyboardEdit.end);
      setKeyboardPreview(null);
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    if (event.shiftKey && task.isMilestone) return;
    if (event.shiftKey) {
      const end = shift(keyboardEdit.end, delta);
      if (end >= keyboardEdit.start)
        setKeyboardPreview({ ...keyboardEdit, end, action: 'resize' }, task);
    } else
      setKeyboardPreview(
        {
          ...keyboardEdit,
          start: shift(keyboardEdit.start, delta),
          end: shift(keyboardEdit.end, delta),
          action: 'move',
        },
        task,
      );
  };
  const pointerMove = (event: React.PointerEvent) => {
    if (!gesture) return;
    const delta = Math.round((event.clientX - gesture.x) / dayWidth);
    setGesture({ ...gesture, preview: delta });
  };
  const pointerUp = () => {
    if (!gesture) return;
    if (gesture.preview !== 0) {
      const start =
        gesture.mode === 'right' ? gesture.start : shift(gesture.start, gesture.preview);
      const end = gesture.mode === 'left' ? gesture.end : shift(gesture.end, gesture.preview);
      if (start <= end) {
        const task = project.tasks.find((x) => x.id === gesture.id);
        if (task) onMove(task, start, end);
      }
    }
    setGesture(null);
  };
  const depEndpoints = (dependency: Dependency) => ({
    from: project.tasks.find((x) => x.id === dependency.predecessorId),
    to: project.tasks.find((x) => x.id === dependency.successorId),
  });
  return (
    <div
      className="timeline-scroll"
      ref={scroller}
      onScroll={(event) =>
        setViewport({
          left: event.currentTarget.scrollLeft,
          width: event.currentTarget.clientWidth || 800,
        })
      }
    >
      <div className="timeline-canvas" style={{ width: `${count * dayWidth}px` }}>
        <div className="timeline-head">
          <div className="timeline-months">
            {labels
              .filter(({ date, index }) => date.getUTCDate() === 1 || index === 0)
              .map(({ date, index }) => {
                const nextMonth = new Date(date);
                nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
                const days = Math.min(
                  count - index,
                  Math.round((nextMonth.valueOf() - date.valueOf()) / dayMs),
                );
                return (
                  <div
                    className="timeline-month-segment"
                    key={index}
                    style={{ left: `${index * dayWidth}px`, width: `${days * dayWidth}px` }}
                  >
                    <span>
                      {date.toLocaleDateString(locale === 'es' ? 'es' : 'en', {
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'UTC',
                      })}
                    </span>
                  </div>
                );
              })}
          </div>
          <div className="timeline-days">
            {labels.map(({ date, index }) => (
              <div
                className={date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 'weekend' : ''}
                key={index}
                style={{ left: `${index * dayWidth}px` }}
              >
                {date.getUTCDate()}
              </div>
            ))}
          </div>
        </div>
        <div
          className="timeline-body"
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={cancelGesture}
        >
          {displayRows.map((row) => {
            if (row.kind === 'group') {
              const summary = groupSummary(rangeTasks.filter((item) => item.groupId === row.id));
              const left = summary ? Math.max(0, px(summary.startDate)) : 0;
              const right = summary
                ? Math.min(count * dayWidth, px(summary.endDate) + dayWidth)
                : 0;
              const width = right - left;
              const labelPosition =
                width >= 40 ? 'inside' : count * dayWidth - right >= 40 ? 'after' : 'before';
              return (
                <div
                  key={`group-${row.id}`}
                  className="timeline-row timeline-group-row"
                  style={{ width: `${count * dayWidth}px` }}
                >
                  {summary && width > 0 && (
                    <div
                      className="group-summary-bar"
                      role="img"
                      aria-label={`${groupsById.get(row.id)?.name}: ${summary.progress} %`}
                      style={{ left: `${left}px`, width: `${width}px` }}
                    >
                      <span
                        className="group-summary-progress"
                        style={{ width: `${summary.progress}%` }}
                      />
                      <span
                        className={`group-summary-percent group-summary-percent-${labelPosition}`}
                        aria-hidden="true"
                      >
                        {summary.progress} %
                      </span>
                    </div>
                  )}
                </div>
              );
            }
            const task = row.task;
            const active = gesture?.id === task.id;
            const keyboardActive = keyboardEdit?.id === task.id;
            const start = keyboardActive
              ? keyboardEdit.start
              : active && gesture.mode !== 'right'
                ? shift(gesture.start, gesture.preview)
                : task.startDate;
            const end = keyboardActive
              ? keyboardEdit.end
              : active && gesture.mode !== 'left'
                ? shift(gesture.end, gesture.preview)
                : task.endDate;
            const overlapsSegment = day(end) >= first && day(start) <= segmentLast;
            const startInSegment = day(start) >= first && day(start) <= segmentLast;
            const endInSegment = day(end) >= first && day(end) <= segmentLast;
            const left = Math.max(0, px(start));
            const width = Math.max(0, Math.min(count * dayWidth, px(end) + dayWidth) - left);
            return (
              <div
                className="timeline-row"
                key={task.id}
                style={{ width: `${count * dayWidth}px` }}
              >
                <div
                  className="grid-lines"
                  style={{ backgroundPosition: `0 0, ${saturdayOffset}px 0` }}
                />
                {overlapsSegment && task.isMilestone && (
                  <button
                    id={`task-bar-${task.id}`}
                    type="button"
                    className={`milestone ${active || keyboardActive ? 'bar-preview' : ''}`}
                    aria-label={`${task.name}, ${start}`}
                    aria-describedby="timeline-keyboard-help"
                    aria-pressed={keyboardActive}
                    style={{ left: `${px(start) + dayWidth / 2 - MILESTONE_PX / 2}px` }}
                    onFocus={() => onSelect(task.id)}
                    onPointerDown={(event) => pointerDown(event, task, 'move')}
                    onKeyDown={(event) => barKeyDown(event, task)}
                  >
                    <span aria-hidden="true">◆</span>
                  </button>
                )}
                {overlapsSegment && !task.isMilestone && (
                  <button
                    id={`task-bar-${task.id}`}
                    type="button"
                    className={`bar${groupsById.get(task.groupId ?? '')?.color ? ` group-color-${groupsById.get(task.groupId ?? '')?.color}` : ''} ${active || keyboardActive ? 'bar-preview' : ''}`}
                    aria-label={`${task.name}, ${start}–${end}`}
                    aria-describedby="timeline-keyboard-help"
                    aria-pressed={keyboardActive}
                    style={{ left: `${left}px`, width: `${width}px` }}
                    onFocus={() => onSelect(task.id)}
                    onBlur={(event) => {
                      if (
                        keyboardEdit?.id === task.id &&
                        (keyboardEdit.start !== task.startDate || keyboardEdit.end !== task.endDate)
                      ) {
                        focusAfterDecision.current =
                          event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
                        setConfirmingBlur(true);
                      } else if (keyboardEdit?.id === task.id) setKeyboardPreview(null);
                    }}
                    onPointerDown={(event) => pointerDown(event, task, 'move')}
                    onKeyDown={(event) => barKeyDown(event, task)}
                  >
                    {showProgress && (
                      <span
                        className="bar-progress"
                        style={{ width: `${task.progress}%` }}
                        aria-hidden="true"
                      />
                    )}
                    {startInSegment && (
                      <span
                        className="resize-handle start-handle"
                        aria-label={t.start}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          pointerDown(event, task, 'left');
                        }}
                      />
                    )}
                    <span className="bar-label">
                      {active && gesture.preview ? `${start} → ${end}` : task.name}
                    </span>
                    {endInSegment && (
                      <span
                        className="resize-handle end-handle"
                        aria-label={t.end}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          pointerDown(event, task, 'right');
                        }}
                      />
                    )}
                  </button>
                )}
              </div>
            );
          })}
          <svg
            className="dependency-lines"
            aria-hidden="true"
            width={count * dayWidth}
            height={displayRows.length * rowHeight}
          >
            {project.dependencies.map((dependency) => {
              const { from, to } = depEndpoints(dependency);
              if (!from || !to) return null;
              const y1 =
                (displayRows.findIndex((row) => row.kind === 'task' && row.task.id === from.id) +
                  0.5) *
                rowHeight;
              const y2 =
                (displayRows.findIndex((row) => row.kind === 'task' && row.task.id === to.id) +
                  0.5) *
                rowHeight;
              const rawX1 = px(from.endDate) + dayWidth;
              const rawX2 = px(to.startDate);
              if (
                (rawX1 < 0 && rawX2 < 0) ||
                (rawX1 > count * dayWidth && rawX2 > count * dayWidth)
              )
                return null;
              const x1 = Math.max(0, Math.min(count * dayWidth, rawX1));
              const x2 = Math.max(0, Math.min(count * dayWidth, rawX2));
              const mid = Math.min(count * dayWidth, Math.max(x1 + 10, x2 - 10));
              return (
                <path
                  key={dependency.id}
                  d={`M${x1},${y1} H${mid} V${y2} H${x2}`}
                  fill="none"
                  stroke="#9aaeba"
                  strokeWidth="1.5"
                  markerEnd={rawX2 >= 0 && rawX2 <= count * dayWidth ? 'url(#arrow)' : undefined}
                />
              );
            })}
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#9aaeba" />
              </marker>
            </defs>
          </svg>
        </div>
      </div>
      {segmentCount > 1 && (
        <div
          className="timeline-segment-nav"
          style={{ width: `${viewport.width}px` }}
          aria-label={
            locale === 'es' ? 'Navegación del cronograma extenso' : 'Long timeline navigation'
          }
        >
          <button
            type="button"
            disabled={activeSegment === 0 || !!gesture || !!keyboardEdit}
            onClick={() => navigateSegment(activeSegment - 1)}
          >
            {locale === 'es' ? '← Anterior' : '← Previous'}
          </button>
          <span aria-live="polite">
            {locale === 'es'
              ? `Tramo ${activeSegment + 1} de ${segmentCount}`
              : `Segment ${activeSegment + 1} of ${segmentCount}`}
          </span>
          <button
            type="button"
            disabled={activeSegment === segmentCount - 1 || !!gesture || !!keyboardEdit}
            onClick={() => navigateSegment(activeSegment + 1)}
          >
            {locale === 'es' ? 'Siguiente →' : 'Next →'}
          </button>
          <label>
            {locale === 'es' ? 'Ir a fecha' : 'Go to date'}{' '}
            <input
              type="date"
              value={jumpDate}
              disabled={!!gesture || !!keyboardEdit}
              min={rangeTasks.reduce(
                (min, task) => (task.startDate < min ? task.startDate : min),
                rangeTasks[0].startDate,
              )}
              max={rangeTasks.reduce(
                (max, task) => (task.endDate > max ? task.endDate : max),
                rangeTasks[0].endDate,
              )}
              onChange={(event) => jumpToDate(event.target.value)}
            />
          </label>
        </div>
      )}
      <span className="sr-only">{t.dependencyHelp}</span>
      <dialog
        className="keyboard-blur-dialog"
        ref={confirmDialog}
        aria-labelledby="keyboard-blur-title"
        onCancel={(event) => {
          event.preventDefault();
          finishBlurDecision('continue');
        }}
      >
        <h2 id="keyboard-blur-title">{t.keyboardBlurTitle}</h2>
        <p>{t.keyboardBlurText}</p>
        <div className="dialog-actions">
          <button type="button" autoFocus onClick={() => finishBlurDecision('continue')}>
            {t.continueEditing}
          </button>
          <button type="button" onClick={() => finishBlurDecision('discard')}>
            {t.discard}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => finishBlurDecision('save')}
          >
            {t.saveChanges}
          </button>
        </div>
      </dialog>
    </div>
  );
}
