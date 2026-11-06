import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { FormEvent } from 'react';
import { ApiError, api } from './api.js';
import { localizedApiError } from './api-errors.js';
import { createId } from './id.js';
import { messages } from './i18n.js';
import { Timeline } from './components/Timeline.js';
import { DateControl } from './components/DateControl.js';
import { ProgressInput } from './components/ProgressInput.js';
import { TaskDetailPanel } from './components/TaskDetailPanel.js';
import { DependencyEditor } from './components/DependencyEditor.js';
import { PredecessorsCell } from './components/PredecessorsCell.js';
import { NotePreviewTrigger } from './components/NotePreviewTrigger.js';
import { GroupColorPicker } from './components/GroupColorPicker.js';
import { planningNotice } from './planningNotice.js';
import { keyboardShortcuts } from './shortcuts.js';

type UiError = string | { cause: unknown; fallback: 'syncError' | 'saveError' | 'error' };
type Theme = 'system' | 'light' | 'dark';
const THEME_OPTIONS: { value: Theme; label: 'themeSystem' | 'themeLight' | 'themeDark' }[] = [
  { value: 'system', label: 'themeSystem' },
  { value: 'light', label: 'themeLight' },
  { value: 'dark', label: 'themeDark' },
];
import { positionRowActions } from './positionRowActions.js';
import { canMoveTaskWithinScope, moveTaskWithinScope } from '../shared/orden-tareas.js';
import { appendHistoryEntry } from './history.js';
import {
  TASK_STATUSES,
  calendarAlert,
  dayMs,
  durationDays,
  predecessorsCreateCycle,
  todayLocal,
  validateProjectFile,
  type Locale,
  type Project,
  type ProjectFile,
  type ProjectSummary,
  type SaveState,
  type Task,
  type TaskGroup,
  type TaskStatus,
} from '../shared/model.js';
import { SummaryView } from './components/SummaryView.js';

const statusIcons: Record<TaskStatus, string> = {
  pending: '○',
  in_progress: '◐',
  blocked: '⊘',
  completed: '✓',
};

type Planning = Partial<Pick<Task, 'status' | 'progress' | 'isMilestone'>>;
type DateConflictState = {
  kind: 'dates';
  task: Task;
  startDate: string;
  endDate: string;
  planning?: Planning;
};
type ViewMode = 'planning' | 'tracking' | 'summary';
type ZoomMode = '20' | '34' | '50' | 'fit';
type DensityMode = 'comfortable' | 'compact';
/** Reads a saved preference; storage can be blocked, so every read falls back to the default. */
const readPref = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
};
const writePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage can be unavailable; the view still works for this session. */
  }
};
type PredecessorConflictState = {
  kind: 'predecessors';
  task: Task;
  predecessorIds: string[];
  conflictingPredecessorIds: string[];
  proposedStartDate: string;
  proposedEndDate: string;
};
type ConflictState = DateConflictState | PredecessorConflictState;
type PredecessorChangeResult = 'saved' | 'rejected' | 'failed' | 'cycle';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const defaultStart = () => today();
const defaultEnd = () => todayLocal(new Date(Date.now() + 4 * dayMs));

export function App() {
  const [locale, setLocale] = useState<Locale>(() =>
    localStorage.getItem('pdr2-locale') === 'en' ? 'en' : 'es',
  );
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('pdr2-theme');
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });
  useEffect(() => {
    // "system" removes the attribute so the stylesheet follows prefers-color-scheme.
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = theme;
    localStorage.setItem('pdr2-theme', theme);
  }, [theme]);
  const t = messages(locale);
  const statusLabels: Record<TaskStatus, string> = {
    pending: t.statusPending,
    in_progress: t.statusInProgress,
    blocked: t.statusBlocked,
    completed: t.statusCompleted,
  };
  const deletionConfirmationWord = t.deletionConfirmationWord;
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [error, setError] = useState<UiError>('');
  const [projectNameMode, setProjectNameMode] = useState<'create' | 'rename' | null>(null);
  const renameProjectLabel = t.renameProjectLabel;
  const [projectDrawerOpen, setProjectDrawerOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [taskNameDrafts, setTaskNameDrafts] = useState<Record<string, string>>({});
  const [taskName, setTaskName] = useState('');
  const [taskTargetGroupId, setTaskTargetGroupId] = useState('');
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const taskCreateNameRef = useRef<HTMLInputElement>(null);
  const [taskStart, setTaskStart] = useState(defaultStart());
  const [taskEnd, setTaskEnd] = useState(defaultEnd());
  const [taskIsMilestone, setTaskIsMilestone] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [reopenedTask, setReopenedTask] = useState<{ id: string; progress: number } | null>(null);
  // The task column width: null means automatic (the longest name), otherwise the width the user dragged.
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [view, setView] = useState<ViewMode>(() =>
    readPref<ViewMode>('pdr2-view', ['planning', 'tracking', 'summary'], 'planning'),
  );
  const [zoom, setZoom] = useState<ZoomMode>(() =>
    readPref<ZoomMode>('pdr2-zoom', ['20', '34', '50', 'fit'], '34'),
  );
  const [density, setDensity] = useState<DensityMode>(() =>
    readPref<DensityMode>('pdr2-density', ['comfortable', 'compact'], 'comfortable'),
  );
  // Alerts depend on the calendar day: recalculate on focus and every minute (F3-02, sección 6).
  const [today, setToday] = useState(() => todayLocal());
  // Compact density only applies with a fine pointer: touch targets keep 44 px rows (F3-02, sección 5.3).
  const coarsePointer =
    typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  useEffect(() => writePref('pdr2-view', view), [view]);
  useEffect(() => writePref('pdr2-zoom', zoom), [zoom]);
  useEffect(() => writePref('pdr2-density', density), [density]);
  useEffect(() => {
    const refresh = () => setToday(todayLocal());
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [nameWidth, setNameWidth] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem('pdr2-name-width'));
    return saved >= 120 && saved <= 720 ? saved : null;
  });
  useEffect(() => {
    try {
      localStorage.removeItem('pdr2-name-step');
      if (nameWidth === null) localStorage.removeItem('pdr2-name-width');
      else localStorage.setItem('pdr2-name-width', String(nameWidth));
    } catch {
      /* The width still applies for this session. */
    }
  }, [nameWidth]);
  const [keyboardNotice, setKeyboardNotice] = useState('');
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [importFile, setImportFile] = useState<ProjectFile | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importTarget, setImportTarget] = useState('');
  const [history, setHistory] = useState<{ past: Project[]; future: Project[] }>({
    past: [],
    future: [],
  });
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [noteTarget, setNoteTarget] = useState<
    { kind: 'task'; item: Task } | { kind: 'group'; item: TaskGroup } | null
  >(null);
  const [groupDialog, setGroupDialog] = useState<{
    mode: 'create' | 'rename' | 'delete';
    groupId?: string;
    step: number;
  } | null>(null);
  const [groupDraft, setGroupDraft] = useState('');
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [deleteTaskStep, setDeleteTaskStep] = useState<1 | 2>(1);
  const [deleteTaskDraft, setDeleteTaskDraft] = useState('');
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deleteProjectStep, setDeleteProjectStep] = useState<1 | 2>(1);
  const [deleteProjectName, setDeleteProjectName] = useState('');
  const [deleteProjectDraft, setDeleteProjectDraft] = useState('');
  const [deletingProject, setDeletingProject] = useState(false);
  const [deleteProjectError, setDeleteProjectError] = useState<UiError>('');
  const deleteProjectDialogRef = useRef<HTMLDialogElement>(null);
  const deleteProjectInputRef = useRef<HTMLInputElement>(null);
  const deleteProjectCancelRef = useRef<HTMLButtonElement>(null);
  const deleteProjectTriggerRef = useRef<HTMLButtonElement>(null);
  const actionDialogRef = useRef<HTMLDialogElement>(null);
  const actionReturnFocusRef = useRef<HTMLElement | null>(null);
  const taskDialogRef = useRef<HTMLDialogElement>(null);
  const taskDialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaveFeedback, setNoteSaveFeedback] = useState<'idle' | 'saved'>('idle');
  const noteDialogRef = useRef<HTMLDialogElement>(null);
  const noteReturnFocusRef = useRef<HTMLElement | null>(null);
  const historyRef = useRef(history);
  historyRef.current = history;
  const projectRef = useRef(project);
  projectRef.current = project;
  const writeLock = useRef(false);
  const navigationVersion = useRef(0);
  const navigating = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const projectDrawerRef = useRef<HTMLDialogElement>(null);
  const projectDrawerTriggerRef = useRef<HTMLButtonElement>(null);
  const projectDrawerCloseRef = useRef<HTMLButtonElement>(null);
  const newProjectDialogRef = useRef<HTMLDialogElement>(null);
  const newProjectInputRef = useRef<HTMLInputElement>(null);
  const newProjectReturnFocusRef = useRef<HTMLElement | null>(null);
  const conflictDialogRef = useRef<HTMLDialogElement>(null);
  const conflictRejectRef = useRef<HTMLButtonElement>(null);
  const conflictReturnFocusRef = useRef<HTMLElement | null>(null);
  const predecessorConflictResolveRef = useRef<((result: PredecessorChangeResult) => void) | null>(
    null,
  );

  const refreshProjects = useCallback(
    async (currentId?: string) => {
      const items = await api.projects();
      setProjects(items);
      const id = currentId ?? project?.id;
      const next =
        id && items.some((item) => item.id === id)
          ? await api.project(id)
          : items.length
            ? await api.project(items[0].id)
            : null;
      projectRef.current = next;
      setProject(next);
    },
    [project?.id],
  );
  useEffect(() => {
    void refreshProjects().catch((e: unknown) => setError(userFacingError(e, 'syncError')));
  }, []);
  useEffect(() => {
    localStorage.setItem('pdr2-locale', locale);
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    if (noteTarget && noteDialogRef.current && !noteDialogRef.current.open)
      noteDialogRef.current.showModal();
  }, [noteTarget]);
  useEffect(() => {
    const dialog = taskDialogRef.current;
    if (!dialog) return;
    if (taskDialogOpen && !dialog.open) dialog.showModal();
    if (!taskDialogOpen && dialog.open) {
      dialog.close();
      requestAnimationFrame(() => taskDialogReturnFocusRef.current?.focus());
    }
  }, [taskDialogOpen]);
  useEffect(() => {
    if ((groupDialog || deleteTaskId) && actionDialogRef.current && !actionDialogRef.current.open) {
      actionDialogRef.current.showModal();
      // autoFocus runs before showModal(), so focus the first field here; otherwise the close button keeps focus and typing is lost.
      actionDialogRef.current.querySelector<HTMLInputElement>('input')?.focus();
    }
  }, [groupDialog, deleteTaskId]);
  useEffect(() => {
    const dialog = deleteProjectDialogRef.current;
    if (!dialog) return;
    if (deleteProjectOpen && !dialog.open) {
      dialog.showModal();
      deleteProjectCancelRef.current?.focus();
    }
    if (!deleteProjectOpen && dialog.open) {
      dialog.close();
      requestAnimationFrame(() => deleteProjectTriggerRef.current?.focus());
    }
    if (deleteProjectOpen && deleteProjectStep === 2) deleteProjectInputRef.current?.focus();
  }, [deleteProjectOpen, deleteProjectStep]);
  useEffect(() => {
    const dialog = projectDrawerRef.current;
    if (!dialog) return;
    if (projectDrawerOpen && !dialog.open) {
      dialog.showModal();
      projectDrawerCloseRef.current?.focus();
    } else if (!projectDrawerOpen && dialog.open) {
      dialog.close();
      projectDrawerTriggerRef.current?.focus();
    }
  }, [projectDrawerOpen]);
  useEffect(() => {
    const dialog = newProjectDialogRef.current;
    if (!dialog) return;
    if (projectNameMode && !dialog.open) {
      dialog.showModal();
      newProjectInputRef.current?.focus();
    } else if (!projectNameMode && dialog.open) {
      dialog.close();
      newProjectReturnFocusRef.current?.focus();
    }
  }, [projectNameMode]);
  useEffect(() => {
    const dialog = conflictDialogRef.current;
    if (!dialog) return;
    if (conflict && !dialog.open) {
      dialog.showModal();
      conflictRejectRef.current?.focus();
    } else if (!conflict && dialog.open) {
      dialog.close();
      conflictReturnFocusRef.current?.focus();
    }
  }, [conflict]);

  const openNewProject = (trigger?: HTMLElement | null) => {
    const triggerIsInDrawer = !!trigger && projectDrawerRef.current?.contains(trigger);
    newProjectReturnFocusRef.current = triggerIsInDrawer
      ? projectDrawerTriggerRef.current
      : (trigger ?? null);
    if (triggerIsInDrawer) setProjectDrawerOpen(false);
    setProjectName('');
    setProjectNameMode('create');
  };
  const openRenameProject = (trigger: HTMLButtonElement) => {
    if (!project || writeLock.current || navigating.current) return;
    newProjectReturnFocusRef.current = trigger;
    setError('');
    setProjectName(project.name);
    setProjectNameMode('rename');
  };
  const openProjectDrawer = () => {
    projectDrawerTriggerRef.current?.focus();
    setProjectDrawerOpen(true);
  };
  const selectProject = (id: string) => {
    if (writeLock.current || navigating.current) {
      setError(t.appWaitForTheOperationTo);
      return;
    }
    if (id === projectRef.current?.id) {
      setProjectDrawerOpen(false);
      return;
    }
    const version = ++navigationVersion.current;
    navigating.current = true;
    setError('');
    void api
      .project(id)
      .then((loaded) => {
        if (version !== navigationVersion.current) return;
        projectRef.current = loaded;
        setProject(loaded);
        setHistory({ past: [], future: [] });
        setCollapsedGroups([]);
        setConflict(null);
        setTaskNameDrafts({});
      })
      .catch((e: unknown) => {
        if (version === navigationVersion.current) setError(userFacingError(e, 'syncError'));
      })
      .finally(() => {
        if (version === navigationVersion.current) navigating.current = false;
      });
    setProjectDrawerOpen(false);
  };

  const userFacingError = (
    cause: unknown,
    fallback: 'syncError' | 'saveError' | 'error',
  ): UiError => ({ cause, fallback });
  const displayError = (value: UiError) =>
    typeof value === 'string' ? value : localizedApiError(value.cause, locale, t[value.fallback]);
  const updateProject = useCallback(
    async (operation: () => Promise<Project>, conflictData?: DateConflictState) => {
      if (writeLock.current || navigating.current) {
        setError(t.appWaitForTheOperationTo2);
        return false;
      }
      writeLock.current = true;
      setSaveState('saving');
      setError('');
      try {
        const before = projectRef.current;
        const updated = await operation();
        if (before?.id === updated.id)
          setHistory((h) => ({ past: appendHistoryEntry(h.past, before), future: [] }));
        projectRef.current = updated;
        setProject(updated);
        setProjects((items) =>
          items.map((item) =>
            item.id === updated.id
              ? { ...item, name: updated.name, updatedAt: updated.updatedAt }
              : item,
          ),
        );
        setSaveState('saved');
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && conflictData) {
          setSaveState('saved');
          conflictReturnFocusRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setConflict(conflictData);
        } else {
          setSaveState('error');
          setError(userFacingError(e, 'saveError'));
        }
        return false;
      } finally {
        writeLock.current = false;
      }
    },
    [t.saveError, project],
  );
  const restoreHistory = async (direction: 'undo' | 'redo') => {
    if (!project) return;
    if (writeLock.current || navigating.current) {
      setError(t.appWaitForTheOperationTo2);
      return;
    }
    const h = historyRef.current;
    const source = direction === 'undo' ? h.past : h.future;
    if (!source.length) return;
    const target = source[source.length - 1];
    writeLock.current = true;
    setSaveState('saving');
    try {
      const saved = await api.saveProjectState({ ...target, id: project.id });
      projectRef.current = saved;
      setProject(saved);
      setProjects((items) =>
        items.map((item) =>
          item.id === saved.id ? { ...item, name: saved.name, updatedAt: saved.updatedAt } : item,
        ),
      );
      setHistory(
        direction === 'undo'
          ? { past: h.past.slice(0, -1), future: appendHistoryEntry(h.future, project) }
          : { past: appendHistoryEntry(h.past, project), future: h.future.slice(0, -1) },
      );
      setSaveState('saved');
    } catch (e) {
      setSaveState('error');
      setError(userFacingError(e, 'saveError'));
    } finally {
      writeLock.current = false;
    }
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input,textarea,[contenteditable="true"]')) return;
      event.preventDefault();
      void restoreHistory(event.shiftKey ? 'redo' : 'undo');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const openShortcuts = () => {
    const dialog = document.getElementById('shortcuts-dialog') as HTMLDialogElement | null;
    if (dialog && !dialog.open) dialog.showModal();
  };
  useEffect(() => {
    // "?" opens the shortcuts dialog unless the user is typing or another dialog is already open.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (
        (target instanceof HTMLElement &&
          target.matches('input,textarea,select,[contenteditable="true"]')) ||
        document.querySelector('dialog[open]')
      )
        return;
      event.preventDefault();
      openShortcuts();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const changeState = async (next: Project) =>
    project ? updateProject(() => api.saveProjectState(next)) : false;
  const openGroupDialog = (
    mode: 'create' | 'rename' | 'delete',
    groupId?: string,
    returnFocus?: HTMLElement | null,
  ) => {
    actionReturnFocusRef.current =
      returnFocus ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setGroupDraft(
      mode === 'rename' ? (project?.groups?.find((g) => g.id === groupId)?.name ?? '') : '',
    );
    setGroupDialog({ mode, groupId, step: 1 });
  };
  const closeActionDialog = () => {
    setGroupDialog(null);
    setDeleteTaskId(null);
    setDeleteTaskStep(1);
    setDeleteTaskDraft('');
    requestAnimationFrame(() => actionReturnFocusRef.current?.focus());
  };
  const confirmDeleteTask = async () => {
    if (!deleteTaskId) return;
    if (deleteTaskStep === 1) {
      setDeleteTaskDraft('');
      setDeleteTaskStep(2);
      return;
    }
    if (deleteTaskDraft !== deletionConfirmationWord || !project) return;
    if (await updateProject(() => api.deleteTask(project.id, deleteTaskId))) closeActionDialog();
  };
  const saveGroup = async () => {
    if (!project || !groupDialog) return;
    const { mode, groupId } = groupDialog;
    if (mode === 'delete') {
      if (groupDialog.step === 1) {
        setGroupDraft('');
        setGroupDialog({ ...groupDialog, step: 2 });
        return;
      }
      if (groupDraft !== deletionConfirmationWord) return;
      if (
        await changeState({
          ...project,
          groups: (project.groups ?? []).filter((g) => g.id !== groupId),
          tasks: project.tasks.map((task) =>
            task.groupId === groupId ? { ...task, groupId: null } : task,
          ),
        })
      )
        closeActionDialog();
      return;
    }
    const name = groupDraft.trim();
    if (!name) return;
    const groups =
      mode === 'create'
        ? [
            ...(project.groups ?? []),
            { id: createId(), name, position: project.groups?.length ?? 0 },
          ]
        : (project.groups ?? []).map((g) => (g.id === groupId ? { ...g, name } : g));
    if (await changeState({ ...project, groups })) closeActionDialog();
  };
  const editNote = (
    target: { kind: 'task'; item: Task } | { kind: 'group'; item: TaskGroup },
    returnFocus?: HTMLElement | null,
  ) => {
    noteReturnFocusRef.current =
      returnFocus ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setNoteSaveFeedback('idle');
    setError('');
    setNoteTarget(target);
    setNoteDraft(target.item.note ?? '');
  };
  const closeNote = () => {
    setNoteTarget(null);
    requestAnimationFrame(() => noteReturnFocusRef.current?.focus());
  };
  const saveNote = async (closeAfterSave = true) => {
    if (!project || !noteTarget) return;
    setNoteSaveFeedback('idle');
    const next =
      noteTarget.kind === 'task'
        ? {
            ...project,
            tasks: project.tasks.map((item) =>
              item.id === noteTarget.item.id ? { ...item, note: noteDraft } : item,
            ),
          }
        : {
            ...project,
            groups: (project.groups ?? []).map((item) =>
              item.id === noteTarget.item.id ? { ...item, note: noteDraft } : item,
            ),
          };
    const alreadySaved = noteDraft === (noteTarget.item.note ?? '');
    const saved = alreadySaved || (await changeState(next));
    if (saved) {
      setNoteSaveFeedback('saved');
      if (!alreadySaved)
        setNoteTarget((current) => {
          if (noteTarget.kind === 'task')
            return current?.kind === 'task' && current.item.id === noteTarget.item.id
              ? { kind: 'task', item: { ...current.item, note: noteDraft } }
              : current;
          return current?.kind === 'group' && current.item.id === noteTarget.item.id
            ? { kind: 'group', item: { ...current.item, note: noteDraft } }
            : current;
        });
      if (closeAfterSave) closeNote();
    }
  };

  // Native details keeps the control keyboard accessible; only one row menu stays open.
  const closeRowMenu = (element: HTMLElement) => {
    const details = element.closest('details');
    const trigger = details?.querySelector('summary') ?? null;
    if (details) details.open = false;
    return trigger;
  };
  const openTaskDialog = (groupId?: string, returnFocus?: HTMLElement | null) => {
    taskDialogReturnFocusRef.current =
      returnFocus ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setTaskName('');
    setTaskTargetGroupId(
      groupId && project?.groups?.some((group) => group.id === groupId) ? groupId : '',
    );
    setTaskStart(defaultStart());
    setTaskEnd(defaultEnd());
    setTaskIsMilestone(false);
    setTaskDialogOpen(true);
  };
  const closeTaskDialog = () => {
    setTaskDialogOpen(false);
    setTaskName('');
    setTaskTargetGroupId('');
  };
  const rowMenuKeyDown = (event: React.KeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== 'Escape' || !event.currentTarget.open) return;
    event.preventDefault();
    event.stopPropagation();
    const trigger = closeRowMenu(event.currentTarget);
    trigger?.focus();
  };
  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      document.querySelectorAll<HTMLDetailsElement>('details.row-actions[open]').forEach((menu) => {
        if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
      });
    };
    document.addEventListener('click', closeOutside);
    const reposition = () =>
      document
        .querySelectorAll<HTMLDetailsElement>('details.row-actions[open]')
        .forEach(positionRowActions);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('click', closeOutside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, []);

  const submitProjectName = async (event: FormEvent) => {
    event.preventDefault();
    const name = projectName.trim();
    if (!name || !projectNameMode) return;
    if (projectNameMode === 'rename') {
      if (!project || name === project.name) return;
      if (await updateProject(() => api.renameProject(project.id, name))) setProjectNameMode(null);
      return;
    }
    if (writeLock.current || navigating.current) {
      setError(t.appWaitForTheOperationTo);
      return;
    }
    writeLock.current = true;
    ++navigationVersion.current;
    try {
      const created = await api.createProject(name);
      setProjectName('');
      setProjectNameMode(null);
      setHistory({ past: [], future: [] });
      await refreshProjects(created.id);
    } catch (e) {
      setError(userFacingError(e, 'error'));
    } finally {
      writeLock.current = false;
    }
  };
  const createTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!project || !taskName.trim() || (!taskIsMilestone && taskEnd < taskStart)) return;
    const submittedName = taskName.trim();
    const groupId = (project.groups ?? []).some((group) => group.id === taskTargetGroupId)
      ? taskTargetGroupId || null
      : null;
    const task: Task = {
      id: createId(),
      name: submittedName,
      startDate: taskStart,
      endDate: taskIsMilestone ? taskStart : taskEnd,
      position: Math.max(-1, ...project.tasks.map((item) => item.position)) + 1,
      groupId,
      note: '',
      number: 0,
      status: 'pending',
      progress: 0,
      isMilestone: taskIsMilestone,
    };
    const ok = await updateProject(() =>
      api.saveProjectState({ ...project, tasks: [...project.tasks, task] }),
    );
    if (ok) {
      setTaskName('');
      setTaskTargetGroupId('');
      setSelectedTaskId('');
      setTaskDialogOpen(false);
    }
  };
  const saveTask = async (
    task: Task,
    startDate: string,
    endDate: string,
    accept = false,
    planning: Planning = {},
  ) => {
    if (!project) return;
    const change: DateConflictState = { kind: 'dates', task, startDate, endDate, planning };
    const ok = await updateProject(
      () =>
        api.updateTask(
          project.id,
          task.id,
          { name: task.name, startDate, endDate, ...planning },
          accept,
        ),
      change,
    );
    if (ok) setConflict(null);
  };
  /** Status, progress and milestone. A change of dates goes through the same dependency check as a date edit. */
  const savePlanning = async (
    task: Task,
    patch: Partial<Pick<Task, 'status' | 'progress' | 'isMilestone' | 'endDate'>>,
  ) => {
    if (!project) return;
    const { endDate = task.endDate, ...planning } = patch;
    if (endDate !== task.endDate) {
      await saveTask(task, task.startDate, endDate, false, planning);
      return;
    }
    const progress = planning.progress;
    const reopened =
      task.status === 'completed' &&
      planning.status === undefined &&
      progress !== undefined &&
      progress < 100;
    if (reopened) planning.status = 'in_progress';
    const saved = await updateProject(() =>
      api.updateTask(project.id, task.id, {
        name: task.name,
        startDate: task.startDate,
        endDate,
        status: task.status,
        progress: task.progress,
        isMilestone: task.isMilestone,
        ...planning,
      }),
    );
    if (saved && (planning.status !== undefined || progress !== undefined)) {
      setReopenedTask((previous) =>
        reopened ? { id: task.id, progress } : previous?.id === task.id ? null : previous,
      );
    }
  };
  const noticeForTask = (task: Task) =>
    planningNotice(
      task,
      t,
      reopenedTask?.id === task.id && reopenedTask.progress === task.progress,
    );

  const acceptConflict = async () => {
    if (!conflict) return;
    if (conflict.kind === 'dates') {
      await saveTask(conflict.task, conflict.startDate, conflict.endDate, true, conflict.planning);
      return;
    }
    const result = await persistTaskPredecessors(conflict.task.id, conflict.predecessorIds, {
      startDate: conflict.proposedStartDate,
      endDate: conflict.proposedEndDate,
    });
    if (result) {
      setConflict(null);
      predecessorConflictResolveRef.current?.('saved');
      predecessorConflictResolveRef.current = null;
    } else {
      setConflict(null);
      predecessorConflictResolveRef.current?.('failed');
      predecessorConflictResolveRef.current = null;
    }
  };
  const rejectConflict = () => {
    setConflict(null);
    predecessorConflictResolveRef.current?.('rejected');
    predecessorConflictResolveRef.current = null;
  };
  const addTaskDependency = async (from: string, to: string) =>
    project ? updateProject(() => api.addDependency(project.id, from, to)) : false;
  const removeTaskDependency = async (id: string) =>
    project ? updateProject(() => api.removeDependency(project.id, id)) : false;
  const persistTaskPredecessors = async (
    successorId: string,
    predecessorIds: string[],
    adjustedDates?: Pick<Task, 'startDate' | 'endDate'>,
  ) => {
    const current = projectRef.current;
    if (!current) return false;
    const dependencies = current.dependencies.filter(
      (dependency) => dependency.successorId !== successorId,
    );
    const replacements = predecessorIds.map((predecessorId) => ({
      id: createId(),
      predecessorId,
      successorId,
    }));
    const tasks = adjustedDates
      ? current.tasks.map((task) =>
          task.id === successorId ? { ...task, ...adjustedDates } : task,
        )
      : current.tasks;
    return updateProject(() =>
      api.saveProjectState({ ...current, tasks, dependencies: [...dependencies, ...replacements] }),
    );
  };
  const replaceTaskPredecessors = async (
    successorId: string,
    predecessorIds: string[],
  ): Promise<PredecessorChangeResult> => {
    const current = projectRef.current;
    const successor = current?.tasks.find((task) => task.id === successorId);
    if (!current || !successor) return 'failed';
    if (predecessorsCreateCycle(current.dependencies, successorId, predecessorIds)) return 'cycle';
    const conflictingPredecessors = predecessorIds.filter((id) => {
      const predecessor = current.tasks.find((task) => task.id === id);
      return predecessor && predecessor.endDate >= successor.startDate;
    });
    if (conflictingPredecessors.length) {
      const latestPredecessorEnd = predecessorIds
        .map((id) => current.tasks.find((task) => task.id === id)?.endDate ?? '')
        .reduce((latest, endDate) => (endDate > latest ? endDate : latest), '');
      const proposedStartDate = new Date(Date.parse(`${latestPredecessorEnd}T00:00:00Z`) + dayMs)
        .toISOString()
        .slice(0, 10);
      const proposedEndDate = new Date(
        Date.parse(`${proposedStartDate}T00:00:00Z`) + (durationDays(successor) - 1) * dayMs,
      )
        .toISOString()
        .slice(0, 10);
      return new Promise((resolve) => {
        predecessorConflictResolveRef.current = resolve;
        conflictReturnFocusRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setConflict({
          kind: 'predecessors',
          task: successor,
          predecessorIds,
          conflictingPredecessorIds: conflictingPredecessors,
          proposedStartDate,
          proposedEndDate,
        });
      });
    }
    return (await persistTaskPredecessors(successorId, predecessorIds)) ? 'saved' : 'failed';
  };
  const exportProject = async () => {
    if (!project) return;
    try {
      const response = await fetch(`/api/projects/${project.id}/export`);
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${project.name.replace(/[^\p{L}\p{N}_-]+/gu, '-')}.pdr2.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(userFacingError(e, 'error'));
    }
  };
  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setImportFile(validateProjectFile(JSON.parse(await file.text())));
      setImportTarget(project?.id ?? '');
      setImportOpen(true);
      setError('');
    } catch {
      setError(t.invalidFile);
    }
    event.target.value = '';
  };
  const performImport = async (mode: 'copy' | 'replace') => {
    if (!importFile) return;
    if (writeLock.current || navigating.current) {
      setError(t.appWaitForTheOperationTo);
      return;
    }
    writeLock.current = true;
    ++navigationVersion.current;
    try {
      const imported = await api.importProject(importFile, mode, importTarget || undefined, locale);
      setImportOpen(false);
      setImportFile(null);
      setHistory({ past: [], future: [] });
      await refreshProjects(imported.id);
    } catch (e) {
      setError(userFacingError(e, 'saveError'));
    } finally {
      writeLock.current = false;
    }
  };
  const openDeleteProject = (trigger: HTMLButtonElement) => {
    deleteProjectTriggerRef.current = trigger;
    setDeleteProjectName(project?.name ?? '');
    setDeleteProjectStep(1);
    setDeleteProjectDraft('');
    setDeleteProjectError('');
    setError('');
    setDeleteProjectOpen(true);
  };
  const closeDeleteProject = () => {
    if (deletingProject) return;
    setDeleteProjectOpen(false);
    setDeleteProjectStep(1);
    setDeleteProjectDraft('');
  };
  const deleteProject = async () => {
    if (
      !project ||
      deleteProjectDraft !== deletionConfirmationWord ||
      writeLock.current ||
      navigating.current ||
      deletingProject
    )
      return;
    writeLock.current = true;
    setDeletingProject(true);
    ++navigationVersion.current;
    try {
      const deletedProjectId = project.id;
      try {
        await api.deleteProject(deletedProjectId);
      } catch (e) {
        setDeleteProjectError(userFacingError(e, 'error'));
        return;
      }
      setDeleteProjectOpen(false);
      setDeleteProjectDraft('');
      setDeleteProjectError('');
      setDeleteProjectStep(1);
      projectRef.current = null;
      setProject(null);
      setProjects((items) => items.filter((item) => item.id !== deletedProjectId));
      setHistory({ past: [], future: [] });
      try {
        await refreshProjects();
      } catch (e) {
        setError(userFacingError(e, 'syncError'));
      }
      requestAnimationFrame(() =>
        (
          document.querySelector<HTMLElement>('.project-nav') ??
          document.querySelector<HTMLElement>('.plus-button')
        )?.focus(),
      );
    } finally {
      setDeletingProject(false);
      writeLock.current = false;
    }
  };
  const projectLabel = useMemo(() => project?.name ?? t.projects, [project?.name, t.projects]);
  const selectedTask = project?.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const longestName = project ? Math.max(0, ...project.tasks.map((task) => task.name.length)) : 0;
  const nameChars = Math.max(12, Math.min(48, longestName));
  const nameWidthLimits = { min: 120, max: 720 };
  // The widest the column can be on this screen; the value shown, announced and stored is always this clamped width.
  const maxNameWidth = Math.min(
    nameWidthLimits.max,
    Math.max(nameWidthLimits.min, viewportWidth - 480),
  );
  const effectiveNameWidth = nameWidth === null ? null : Math.min(nameWidth, maxNameWidth);
  const clampNameWidth = (width: number) =>
    Math.round(Math.min(maxNameWidth, Math.max(nameWidthLimits.min, width)));
  // Drag the divider like a spreadsheet column: the pointer position sets the width until release.
  const startNameResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth =
      document.querySelector<HTMLElement>('.task-row .task-title-cell')?.getBoundingClientRect()
        .width ?? 220;
    const move = (moveEvent: PointerEvent) =>
      setNameWidth(clampNameWidth(startWidth + moveEvent.clientX - startX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const nameResizeKey = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const current =
        effectiveNameWidth ??
        document.querySelector<HTMLElement>('.task-row .task-title-cell')?.getBoundingClientRect()
          .width ??
        220;
      setNameWidth(clampNameWidth(current + (event.key === 'ArrowRight' ? 16 : -16)));
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setNameWidth(null);
    }
  };
  // Task numbers follow the project order, not the group order, so grouping never renumbers tasks or predecessors.
  const numberedTasks = useMemo(
    () => (project ? [...project.tasks].sort((x, y) => x.position - y.position) : []),
    [project],
  );
  const orderedTasks = useMemo(
    () =>
      project
        ? [...project.tasks].sort((a, b) => {
            const groups = project.groups ?? [];
            const ai = a.groupId ? groups.findIndex((g) => g.id === a.groupId) : groups.length;
            const bi = b.groupId ? groups.findIndex((g) => g.id === b.groupId) : groups.length;
            return ai - bi || a.position - b.position;
          })
        : [],
    [project],
  );
  const visibleRows = useMemo(() => {
    if (!project) return [];
    const rows: Array<
      | { kind: 'group'; group: TaskGroup; index: number }
      | { kind: 'ungrouped' }
      | { kind: 'task'; task: Task }
    > = [];
    for (const [index, group] of (project.groups ?? []).entries()) {
      rows.push({ kind: 'group', group, index });
      if (!collapsedGroups.includes(group.id))
        for (const task of orderedTasks.filter((item) => item.groupId === group.id))
          rows.push({ kind: 'task', task });
    }
    const ungroupedTasks = orderedTasks.filter((item) => !item.groupId);
    // A plain header separates ungrouped tasks from the last group; it cannot be folded because it is not a group.
    if (ungroupedTasks.length && (project.groups ?? []).length) rows.push({ kind: 'ungrouped' });
    for (const task of ungroupedTasks) rows.push({ kind: 'task', task });
    return rows;
  }, [project, orderedTasks, collapsedGroups]);
  const visibleProject = useMemo(
    () =>
      project
        ? {
            ...project,
            tasks: orderedTasks.filter(
              (task) => !task.groupId || !collapsedGroups.includes(task.groupId),
            ),
            dependencies: project.dependencies.filter((d) => {
              const visible = orderedTasks.filter(
                (task) => !task.groupId || !collapsedGroups.includes(task.groupId),
              );
              return (
                visible.some((task) => task.id === d.predecessorId) &&
                visible.some((task) => task.id === d.successorId)
              );
            }),
          }
        : null,
    [project, collapsedGroups, orderedTasks],
  );

  if (error && !project && !projects.length)
    return (
      <main className="startup-error">
        <Brand />
        <p>{t.syncError}</p>
        <code>{displayError(error)}</code>
        <button
          onClick={() => {
            setError('');
            void refreshProjects().catch((e: unknown) => setError(userFacingError(e, 'syncError')));
          }}
        >
          {t.retry}
        </button>
      </main>
    );

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <button
          ref={projectDrawerTriggerRef}
          className="projects-button"
          aria-label={t.projects}
          data-tip={t.projects}
          onClick={openProjectDrawer}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="topbar-context">
          <span className="context-dot" />
          <span>{t.appOffline}</span>
          <span className="context-divider">·</span>
          <span>{t.noInternet}</span>
        </div>
        <div className="topbar-actions">
          <span className={`save-status ${saveState}`} aria-live="polite">
            <i />
            {saveState === 'saved' ? t.save : saveState === 'saving' ? t.saving : t.saveError}
          </span>
          <button
            className="avatar"
            aria-label={t.settings}
            data-tip={t.settings}
            onClick={() =>
              (document.getElementById('settings-dialog') as HTMLDialogElement | null)?.showModal()
            }
          >
            <Icon name="user" />
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <span className="eyebrow">SPACE / LOCAL</span>
            <button
              className="plus-button"
              aria-label={t.newProject}
              onClick={(event) => openNewProject(event.currentTarget)}
            >
              ＋
            </button>
          </div>
          <div className="section-label">
            {t.projects}
            <span data-tip={t.appProjectsSavedOnThisComputer}>
              {projects.length.toString().padStart(2, '0')}
            </span>
          </div>
          <nav className="project-list" aria-label={t.projects}>
            {projects.map((item, index) => (
              <button
                key={item.id}
                className={`project-nav ${item.id === project?.id ? 'active' : ''}`}
                onClick={() => selectProject(item.id)}
              >
                <span className={`project-mark mark-${index % 4}`} />{' '}
                <span className="project-nav-name">{item.name}</span>
                <span className="project-chevron">›</span>
              </button>
            ))}
            {!projects.length && <p className="sidebar-empty">{t.noProjects}</p>}
          </nav>
          <div className="sidebar-footer">
            <span className="connection-dot" />
            <span>PostgreSQL local</span>
          </div>
        </aside>

        <main className="main-content">
          {project ? (
            <>
              <div className="project-header">
                <div>
                  <div className="breadcrumb">
                    {t.projects}
                    <span>/</span>
                    <b>{projectLabel}</b>
                  </div>
                  <div className="title-row">
                    <h1>{project.name}</h1>
                    <span className="project-status">
                      <i />
                      {t.appPlanning}
                    </span>
                  </div>
                  <p className="subtitle">
                    {t.appProjectSchedule} <span>·</span> {project.tasks.length}{' '}
                    {t.tasks.toLowerCase()}
                  </p>
                </div>
                <div className="project-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={saveState === 'saving'}
                    onClick={(event) => openRenameProject(event.currentTarget)}
                  >
                    {renameProjectLabel}
                  </button>
                  <button
                    className="secondary-button"
                    data-tip={t.appImportAJsonFileAs}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Icon name="upload" />
                    {t.import}
                  </button>
                  <button
                    className="secondary-button"
                    data-tip={t.appDownloadTheProjectAsA}
                    onClick={() => void exportProject()}
                  >
                    <Icon name="download" />
                    {t.export}
                  </button>
                  <button
                    ref={deleteProjectTriggerRef}
                    className="more-button"
                    data-tip={t.deleteProject}
                    aria-label={t.deleteProject}
                    onClick={(event) => openDeleteProject(event.currentTarget)}
                  >
                    <Icon name="trash" />
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={chooseFile}
                  />
                </div>
              </div>

              <section
                className="editor-card"
                aria-label={t.tasks}
                style={
                  {
                    '--name-col':
                      effectiveNameWidth === null
                        ? `min(calc(${nameChars} * 7px + 44px), 36vw)`
                        : `${effectiveNameWidth}px`,
                    '--row-h': density === 'compact' && !coarsePointer ? '34px' : '46px',
                  } as React.CSSProperties
                }
              >
                <div className="card-toolbar">
                  <div className="view-tabs" role="tablist" aria-label={t.appProjectView}>
                    {(['planning', 'tracking', 'summary'] as ViewMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="tab"
                        aria-selected={view === mode}
                        className={`view-tab${view === mode ? ' active' : ''}`}
                        onClick={() => setView(mode)}
                      >
                        {mode === 'planning'
                          ? t.viewPlanning
                          : mode === 'tracking'
                            ? t.viewTracking
                            : t.viewSummary}
                      </button>
                    ))}
                    <span className="toolbar-divider" />
                    <label className="toolbar-select">
                      <span>{t.zoomLabel}</span>
                      <select
                        value={zoom}
                        onChange={(event) => setZoom(event.target.value as ZoomMode)}
                      >
                        <option value="20">20 px</option>
                        <option value="34">34 px</option>
                        <option value="50">50 px</option>
                        <option value="fit">{t.zoomFit}</option>
                      </select>
                    </label>
                    <label className="toolbar-select">
                      <span>{t.densityLabel}</span>
                      <select
                        value={density}
                        onChange={(event) => setDensity(event.target.value as DensityMode)}
                      >
                        <option value="comfortable">{t.densityComfortable}</option>
                        <option value="compact">{t.densityCompact}</option>
                      </select>
                    </label>
                  </div>
                  <div className="toolbar-right">
                    <button
                      className="secondary-button toolbar-icon-button"
                      disabled={!history.past.length}
                      onClick={() => void restoreHistory('undo')}
                      aria-label={t.appUndo}
                      data-tip={t.appUndoTheLastChange}
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9 14 4 9l5-5" />
                        <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                      </svg>
                    </button>
                    <button
                      className="secondary-button toolbar-icon-button"
                      disabled={!history.future.length}
                      onClick={() => void restoreHistory('redo')}
                      aria-label={t.appRedo}
                      data-tip={t.appRedoTheUndoneChange}
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m15 14 5-5-5-5" />
                        <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
                      </svg>
                    </button>
                    <button
                      className="secondary-button"
                      data-tip={t.appAddAGroupToOrganize}
                      onClick={() => openGroupDialog('create')}
                    >
                      {t.addGroupAction}
                    </button>
                    <button
                      className="primary-button"
                      data-tip={t.appAddATaskToThe}
                      onClick={(event) => openTaskDialog(undefined, event.currentTarget)}
                    >
                      {t.appTask}
                    </button>
                    <span className="calendar-status">{t.appCalendarDays}</span>
                  </div>
                </div>

                {view !== 'summary' && (
                  <>
                    <div className="grid-header">
                      <div className="task-grid-head">
                        <span className="task-column-title">
                          {t.tasks}
                          <span>{project.tasks.length}</span>
                        </span>
                        <span className="timeline-divider" />
                      </div>
                      <div className="timeline-heading">{t.timeline}</div>
                    </div>
                    <div className="work-grid">
                      <div className="task-table">
                        <div className="task-grid-head task-table-spacer task-column-labels">
                          <span />
                          <span>{t.start}</span>
                          <span>{t.end}</span>
                          <span>{t.duration}</span>
                          <span
                            className="predecessors-heading"
                            data-tip={t.appPredecessorsTaskNumberOfEach}
                          >
                            Pred.
                          </span>
                          <span className="timeline-divider" />
                          <span
                            className="name-col-handle"
                            role="separator"
                            tabIndex={0}
                            aria-orientation="vertical"
                            aria-valuemin={nameWidthLimits.min}
                            aria-valuemax={maxNameWidth}
                            aria-valuenow={effectiveNameWidth ?? undefined}
                            aria-valuetext={
                              effectiveNameWidth === null
                                ? t.appAutomatic
                                : `${effectiveNameWidth} px`
                            }
                            aria-label={t.appTaskColumnWidthDragUse}
                            title={t.appDragToChangeTheTask}
                            onPointerDown={startNameResize}
                            onKeyDown={nameResizeKey}
                            onDoubleClick={() => setNameWidth(null)}
                          />
                        </div>
                        {visibleRows.map((row) =>
                          row.kind === 'ungrouped' ? (
                            <div className="group-toolbar group-toolbar-ungrouped" key="ungrouped">
                              <span>{t.appNoGroup}</span>
                            </div>
                          ) : row.kind === 'group' ? (
                            (() => {
                              const { group, index: groupIndex } = row;
                              return (
                                <div
                                  className={`group-toolbar${group.color ? ` group-color-${group.color}` : ''}`}
                                  key={group.id}
                                >
                                  <button
                                    aria-expanded={!collapsedGroups.includes(group.id)}
                                    onClick={() =>
                                      setCollapsedGroups((items) =>
                                        items.includes(group.id)
                                          ? items.filter((id) => id !== group.id)
                                          : [...items, group.id],
                                      )
                                    }
                                  >
                                    {collapsedGroups.includes(group.id) ? '▸' : '▾'} {group.name}
                                  </button>
                                  {!!group.note?.trim() && (
                                    <NotePreviewTrigger
                                      kind="group"
                                      itemId={group.id}
                                      name={group.name}
                                      note={group.note}
                                      locale={locale}
                                      onOpen={(trigger) =>
                                        editNote({ kind: 'group', item: group }, trigger)
                                      }
                                    />
                                  )}
                                  <details
                                    className="group-menu row-actions"
                                    onKeyDown={rowMenuKeyDown}
                                    onToggle={(event) => {
                                      if (event.currentTarget.open) {
                                        document
                                          .querySelectorAll<HTMLDetailsElement>(
                                            'details.row-actions[open]',
                                          )
                                          .forEach((menu) => {
                                            if (menu !== event.currentTarget) menu.open = false;
                                          });
                                        positionRowActions(event.currentTarget);
                                      }
                                    }}
                                  >
                                    <summary
                                      aria-label={`${t.appGroupOptions}: ${group.name}`}
                                      title={t.appGroupOptions}
                                    >
                                      <svg
                                        aria-hidden="true"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                      >
                                        <circle cx="5" cy="12" r="1.6" />
                                        <circle cx="12" cy="12" r="1.6" />
                                        <circle cx="19" cy="12" r="1.6" />
                                      </svg>
                                    </summary>
                                    <div className="group-menu-content row-actions-content">
                                      <p className="row-actions-title">{group.name}</p>
                                      <GroupColorPicker
                                        group={group}
                                        locale={locale}
                                        onSelect={(color) =>
                                          void changeState({
                                            ...project,
                                            groups: project.groups!.map((item) =>
                                              item.id === group.id ? { ...item, color } : item,
                                            ),
                                          })
                                        }
                                      />
                                      <button
                                        onClick={(event) => {
                                          const trigger = closeRowMenu(event.currentTarget);
                                          setCollapsedGroups((items) =>
                                            items.filter((id) => id !== group.id),
                                          );
                                          openTaskDialog(group.id, trigger);
                                        }}
                                      >
                                        {t.appAddTaskToThisGroup}
                                      </button>
                                      <button
                                        onClick={(event) => {
                                          const trigger = closeRowMenu(event.currentTarget);
                                          editNote({ kind: 'group', item: group }, trigger);
                                        }}
                                      >
                                        {group.note?.trim() ? t.appViewOrEditNote : t.appAddNote}
                                      </button>
                                      <button
                                        disabled={groupIndex === 0}
                                        onClick={(event) => {
                                          closeRowMenu(event.currentTarget);
                                          const groups = [...project.groups!];
                                          [groups[groupIndex - 1], groups[groupIndex]] = [
                                            groups[groupIndex],
                                            groups[groupIndex - 1],
                                          ];
                                          void changeState({
                                            ...project,
                                            groups: groups.map((g, position) => ({
                                              ...g,
                                              position,
                                            })),
                                          });
                                        }}
                                      >
                                        {t.appMoveGroupUp}
                                      </button>
                                      <button
                                        disabled={groupIndex === project.groups!.length - 1}
                                        onClick={(event) => {
                                          closeRowMenu(event.currentTarget);
                                          const groups = [...project.groups!];
                                          [groups[groupIndex + 1], groups[groupIndex]] = [
                                            groups[groupIndex],
                                            groups[groupIndex + 1],
                                          ];
                                          void changeState({
                                            ...project,
                                            groups: groups.map((g, position) => ({
                                              ...g,
                                              position,
                                            })),
                                          });
                                        }}
                                      >
                                        {t.appMoveGroupDown}
                                      </button>
                                      <button
                                        onClick={(event) =>
                                          openGroupDialog(
                                            'rename',
                                            group.id,
                                            closeRowMenu(event.currentTarget),
                                          )
                                        }
                                      >
                                        {t.appRename}
                                      </button>
                                      <button
                                        onClick={(event) => {
                                          const trigger = closeRowMenu(event.currentTarget);
                                          openGroupDialog('delete', group.id, trigger);
                                        }}
                                      >
                                        {t.appDeleteGroup}
                                      </button>
                                    </div>
                                  </details>
                                </div>
                              );
                            })()
                          ) : (
                            (() => {
                              const task = row.task;
                              const taskIndex = numberedTasks.findIndex(
                                (item) => item.id === task.id,
                              );
                              const notice = view === 'tracking' ? noticeForTask(task) : undefined;
                              const alert = calendarAlert(task, today);
                              const alertLabel =
                                alert === 'overdue'
                                  ? t.alertOverdue
                                  : alert === 'late_start'
                                    ? t.alertLateStart
                                    : t.alertDueSoon;
                              const showAlertText =
                                alert && view === 'tracking' && viewportWidth > 1120;
                              return (
                                <div
                                  className={`task-row ${selectedTaskId === task.id ? 'selected' : ''}`}
                                  key={task.id}
                                  onClick={(event) => {
                                    if (
                                      !(event.target instanceof Element) ||
                                      !event.target.closest('.row-actions')
                                    )
                                      setSelectedTaskId(task.id);
                                  }}
                                >
                                  <div className="task-title-cell">
                                    <span className={`row-index index-${taskIndex % 4}`}>
                                      {String(task.number).padStart(2, '0')}
                                    </span>
                                    <input
                                      aria-label={`${t.taskName} ${task.number}`}
                                      aria-describedby="task-name-keyboard-help"
                                      title={task.name}
                                      value={taskNameDrafts[task.id] ?? task.name}
                                      onChange={(event) =>
                                        setTaskNameDrafts((drafts) => ({
                                          ...drafts,
                                          [task.id]: event.target.value,
                                        }))
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                          event.preventDefault();
                                          event.currentTarget.blur();
                                        } else if (event.key === 'Escape') {
                                          event.preventDefault();
                                          setTaskNameDrafts((drafts) => {
                                            const next = { ...drafts };
                                            delete next[task.id];
                                            return next;
                                          });
                                        }
                                      }}
                                      onBlur={(event) => {
                                        const name = (
                                          taskNameDrafts[task.id] ?? event.currentTarget.value
                                        ).trim();
                                        if (!name || name === task.name) {
                                          setTaskNameDrafts((drafts) => {
                                            const next = { ...drafts };
                                            delete next[task.id];
                                            return next;
                                          });
                                          return;
                                        }
                                        void updateProject(() =>
                                          api.updateTask(project.id, task.id, {
                                            name,
                                            startDate: task.startDate,
                                            endDate: task.endDate,
                                          }),
                                        ).then((saved) => {
                                          if (saved)
                                            setTaskNameDrafts((drafts) => {
                                              if (drafts[task.id]?.trim() !== name) return drafts;
                                              const next = { ...drafts };
                                              delete next[task.id];
                                              return next;
                                            });
                                        });
                                      }}
                                    />
                                    {alert && !showAlertText && (
                                      <span
                                        className={`alert-dot alert-${alert}`}
                                        role="img"
                                        title={alertLabel}
                                        aria-label={alertLabel}
                                      />
                                    )}
                                    {view === 'tracking' &&
                                      (viewportWidth <= 1120 ? (
                                        <span
                                          className="tracking-status-icon"
                                          role="img"
                                          aria-label={`${t.statusLabel}: ${statusLabels[task.status]}`}
                                          title={statusLabels[task.status]}
                                        >
                                          <span aria-hidden="true">{statusIcons[task.status]}</span>
                                        </span>
                                      ) : (
                                        <span className="tracking-controls">
                                          <select
                                            aria-label={`${t.statusLabel} ${task.name}`}
                                            value={task.status}
                                            disabled={saveState === 'saving'}
                                            onChange={(event) =>
                                              void savePlanning(task, {
                                                status: event.target.value as TaskStatus,
                                              })
                                            }
                                          >
                                            {TASK_STATUSES.map((status) => (
                                              <option key={status} value={status}>
                                                {statusLabels[status]}
                                              </option>
                                            ))}
                                          </select>
                                          <ProgressInput
                                            label={`${t.progressLabel} ${task.name}`}
                                            progress={task.progress}
                                            saving={saveState === 'saving'}
                                            onSave={(progress) =>
                                              void savePlanning(task, { progress })
                                            }
                                          />
                                        </span>
                                      ))}
                                    {(notice || showAlertText) && (
                                      <div className="task-row-messages">
                                        {showAlertText && (
                                          <span className={`tracking-alert alert-${alert}`}>
                                            {alertLabel}
                                          </span>
                                        )}
                                        {notice && (
                                          <span
                                            className="planning-notice planning-notice-row"
                                            title={notice}
                                            role="status"
                                          >
                                            {notice}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {!!task.note?.trim() && (
                                      <NotePreviewTrigger
                                        kind="task"
                                        itemId={task.id}
                                        name={task.name}
                                        note={task.note}
                                        locale={locale}
                                        onOpen={(trigger) =>
                                          editNote({ kind: 'task', item: task }, trigger)
                                        }
                                      />
                                    )}
                                    <details
                                      className="task-actions row-actions"
                                      onKeyDown={rowMenuKeyDown}
                                      onToggle={(event) => {
                                        if (event.currentTarget.open) {
                                          document
                                            .querySelectorAll<HTMLDetailsElement>(
                                              'details.row-actions[open]',
                                            )
                                            .forEach((menu) => {
                                              if (menu !== event.currentTarget) menu.open = false;
                                            });
                                          positionRowActions(event.currentTarget);
                                        }
                                      }}
                                    >
                                      <summary
                                        aria-label={`${t.appTaskActions}: ${task.name}`}
                                        title={t.appTaskActions}
                                      >
                                        <svg
                                          aria-hidden="true"
                                          viewBox="0 0 24 24"
                                          fill="currentColor"
                                        >
                                          <circle cx="5" cy="12" r="1.6" />
                                          <circle cx="12" cy="12" r="1.6" />
                                          <circle cx="19" cy="12" r="1.6" />
                                        </svg>
                                      </summary>
                                      <div className="row-actions-content">
                                        <p className="row-actions-title">{task.name}</p>
                                        <button
                                          onClick={(event) => {
                                            const trigger = closeRowMenu(event.currentTarget);
                                            editNote({ kind: 'task', item: task }, trigger);
                                          }}
                                        >
                                          {task.note?.trim() ? t.appViewOrEditNote : t.appAddNote}
                                        </button>
                                        <DependencyEditor
                                          task={task}
                                          tasks={numberedTasks}
                                          groups={project.groups ?? []}
                                          dependencies={project.dependencies}
                                          locale={locale}
                                          saving={saveState === 'saving'}
                                          onAdd={addTaskDependency}
                                          onRemove={removeTaskDependency}
                                        />
                                        <label>
                                          {t.appGroup}
                                          <select
                                            aria-label={`${t.appGroupFor} ${task.name}`}
                                            value={task.groupId ?? ''}
                                            onChange={(event) =>
                                              void changeState({
                                                ...project,
                                                tasks: project.tasks.map((item) =>
                                                  item.id === task.id
                                                    ? {
                                                        ...item,
                                                        groupId: event.target.value || null,
                                                      }
                                                    : item,
                                                ),
                                              })
                                            }
                                          >
                                            <option value="">{t.appUngrouped}</option>
                                            {(project.groups ?? []).map((g) => (
                                              <option key={g.id} value={g.id}>
                                                {g.name}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <button
                                          disabled={
                                            !canMoveTaskWithinScope(project.tasks, task.id, -1)
                                          }
                                          onClick={(event) => {
                                            closeRowMenu(event.currentTarget);
                                            const next = moveTaskWithinScope(
                                              project.tasks,
                                              task.id,
                                              -1,
                                            );
                                            if (next) void changeState({ ...project, tasks: next });
                                          }}
                                        >
                                          {t.appMoveTaskUp}
                                        </button>
                                        <button
                                          disabled={
                                            !canMoveTaskWithinScope(project.tasks, task.id, 1)
                                          }
                                          onClick={(event) => {
                                            closeRowMenu(event.currentTarget);
                                            const next = moveTaskWithinScope(
                                              project.tasks,
                                              task.id,
                                              1,
                                            );
                                            if (next) void changeState({ ...project, tasks: next });
                                          }}
                                        >
                                          {t.appMoveTaskDown}
                                        </button>
                                        <button
                                          className="row-actions-delete"
                                          onClick={(event) => {
                                            actionReturnFocusRef.current = closeRowMenu(
                                              event.currentTarget,
                                            );
                                            setDeleteTaskStep(1);
                                            setDeleteTaskDraft('');
                                            setDeleteTaskId(task.id);
                                          }}
                                        >
                                          {t.appDeleteTask}
                                        </button>
                                      </div>
                                    </details>
                                  </div>
                                  <DateControl
                                    className="date-cell"
                                    ariaLabel={`${t.start} ${task.name}`}
                                    locale={locale}
                                    value={task.startDate}
                                    max={task.isMilestone ? undefined : task.endDate}
                                    onChange={(next) => {
                                      if (next)
                                        void saveTask(
                                          task,
                                          next,
                                          task.isMilestone ? next : task.endDate,
                                        );
                                    }}
                                  />
                                  <DateControl
                                    className="date-cell"
                                    ariaLabel={`${t.end} ${task.name}`}
                                    locale={locale}
                                    value={task.endDate}
                                    min={task.startDate}
                                    disabled={task.isMilestone}
                                    onChange={(next) => {
                                      if (next && next >= task.startDate)
                                        void saveTask(task, task.startDate, next);
                                    }}
                                  />
                                  <span className="duration-cell">
                                    {task.isMilestone ? 0 : durationDays(task)}{' '}
                                    <small>{t.days}</small>
                                  </span>
                                  <PredecessorsCell
                                    task={task}
                                    tasks={numberedTasks}
                                    groups={project.groups ?? []}
                                    dependencies={project.dependencies}
                                    locale={locale}
                                    saving={saveState === 'saving'}
                                    onChange={replaceTaskPredecessors}
                                  />
                                  <span className="timeline-divider" />
                                </div>
                              );
                            })()
                          ),
                        )}
                        {project.tasks.length === 0 && (
                          <div className="empty-grid">
                            <span className="empty-icon">⌁</span>
                            <b>{t.noTasks}</b>
                            <small>{t.appUseTaskToAddThe}</small>
                          </div>
                        )}
                      </div>
                      <Timeline
                        zoom={zoom === 'fit' ? 'fit' : Number(zoom)}
                        rowHeight={density === 'compact' && !coarsePointer ? 34 : 46}
                        showProgress={view === 'tracking'}
                        rows={visibleRows.map((row) =>
                          row.kind === 'ungrouped'
                            ? { kind: 'group' as const, id: 'ungrouped' }
                            : row.kind === 'group'
                              ? { kind: 'group' as const, id: row.group.id }
                              : { kind: 'task' as const, task: row.task },
                        )}
                        project={visibleProject ?? project}
                        rangeTasks={project.tasks}
                        locale={locale}
                        onMove={(task, start, end) => void saveTask(task, start, end)}
                        onSelect={setSelectedTaskId}
                        onKeyboardNotice={setKeyboardNotice}
                      />
                    </div>
                  </>
                )}
                {view === 'summary' && (
                  <SummaryView project={project} today={today} locale={locale} />
                )}
                <div className="editor-footer">
                  <span>
                    <i className="legend-task" />
                    {t.appTask2} <i className="legend-dependency" />
                    {t.dependency}
                  </span>
                  <span className="dependency-help">{t.dependencyHelp}</span>
                  <div className="keyboard-hint">
                    <span className="keyboard-guidance" role="status" aria-live="polite">
                      {keyboardNotice || t.appPressToSeeKeyboardShortcuts}
                    </span>
                    <button
                      type="button"
                      className="shortcuts-button"
                      data-tip={t.appShowShortcutList}
                      onClick={openShortcuts}
                    >
                      {t.appKeyboardShortcuts}
                    </button>
                  </div>
                  <span id="timeline-keyboard-help" className="sr-only">
                    {t.keyboardHelp}
                  </span>
                  <span id="task-name-keyboard-help" className="sr-only">
                    {t.keyboardTaskName}
                  </span>
                </div>
              </section>
              {selectedTask && (
                <TaskDetailPanel
                  key={selectedTask.id}
                  task={selectedTask}
                  number={selectedTask.number}
                  tasks={numberedTasks}
                  groups={project.groups ?? []}
                  dependencies={project.dependencies}
                  locale={locale}
                  saving={saveState === 'saving'}
                  planningNotice={noticeForTask(selectedTask)}
                  onRename={(name) =>
                    void updateProject(() =>
                      api.updateTask(project.id, selectedTask.id, {
                        name,
                        startDate: selectedTask.startDate,
                        endDate: selectedTask.endDate,
                      }),
                    )
                  }
                  onDates={(startDate, endDate) => void saveTask(selectedTask, startDate, endDate)}
                  onPlanning={(patch) => void savePlanning(selectedTask, patch)}
                  onGroup={(groupId) =>
                    void changeState({
                      ...project,
                      tasks: project.tasks.map((item) =>
                        item.id === selectedTask.id ? { ...item, groupId } : item,
                      ),
                    })
                  }
                  onPredecessors={replaceTaskPredecessors}
                  onNote={(trigger) => editNote({ kind: 'task', item: selectedTask }, trigger)}
                  onDelete={(trigger) => {
                    actionReturnFocusRef.current = trigger;
                    setDeleteTaskStep(1);
                    setDeleteTaskDraft('');
                    setDeleteTaskId(selectedTask.id);
                  }}
                  onClose={() => setSelectedTaskId('')}
                />
              )}
            </>
          ) : (
            <section className="welcome-card">
              <span className="welcome-mark">P</span>
              <h1>{t.empty}</h1>
              <p>{t.appAClearWorkspaceToTurn}</p>
              <button
                className="primary-button"
                onClick={(event) => openNewProject(event.currentTarget)}
              >
                ＋ {t.newProject}
              </button>
            </section>
          )}
          <footer className="page-footer">
            <span>© {new Date().getFullYear()} PDR 2.0</span>
            <span>{t.noInternet}</span>
            <span>{t.appCalendarDaysAutosave}</span>
          </footer>
        </main>
      </div>
      {error && projectNameMode !== 'rename' && (
        <div role="alert" className="toast-error">
          <span>!</span>
          {displayError(error)}
          <button aria-label={t.close} onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}

      <dialog
        ref={deleteProjectDialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-project-heading"
        aria-describedby="delete-project-description"
        className="modal action-dialog delete-project-dialog"
        onKeyDown={containModalTab}
        onCancel={(event) => {
          event.preventDefault();
          closeDeleteProject();
        }}
      >
        <div className="modal-heading">
          <h2 id="delete-project-heading">{t.appDeleteProject}</h2>
          <button
            type="button"
            className="modal-close"
            aria-label={t.close}
            disabled={deletingProject}
            onClick={closeDeleteProject}
          >
            ×
          </button>
        </div>
        {deleteProjectStep === 1 ? (
          <>
            <p id="delete-project-description" className="modal-copy">
              {t.deleteProjectWarningBefore}
              <b>{deleteProjectName}</b>
              {t.deleteProjectWarningAfter}
            </p>
            <p className="delete-project-step-hint">
              {t.appToContinueYouWillNeed.replace('{0}', String(deletionConfirmationWord))}
            </p>
          </>
        ) : (
          <>
            <p id="delete-project-description" className="modal-copy">
              {t.deleteProjectConfirmBefore}
              <b>{deleteProjectName}</b>
              {t.deleteProjectConfirmAfter}
            </p>
            <label className="modal-field" htmlFor="delete-project-confirmation">
              {t.appTypeToConfirm.replace('{0}', String(deletionConfirmationWord))}
              <input
                ref={deleteProjectInputRef}
                id="delete-project-confirmation"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={deleteProjectDraft}
                onChange={(event) => setDeleteProjectDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && deleteProjectDraft === deletionConfirmationWord) {
                    event.preventDefault();
                    void deleteProject();
                  }
                }}
              />
            </label>
          </>
        )}
        {deleteProjectError && (
          <p className="delete-project-error" role="alert">
            {displayError(deleteProjectError)}
          </p>
        )}
        <div className="modal-actions">
          <button
            ref={deleteProjectCancelRef}
            type="button"
            className="secondary-button"
            disabled={deletingProject}
            onClick={closeDeleteProject}
          >
            {t.cancel}
          </button>
          {deleteProjectStep === 1 ? (
            <button
              type="button"
              className="primary-button"
              disabled={deletingProject || writeLock.current || navigating.current}
              onClick={() => setDeleteProjectStep(2)}
            >
              {t.appContinue}
            </button>
          ) : (
            <button
              type="button"
              className="danger-button"
              disabled={
                deletingProject ||
                writeLock.current ||
                navigating.current ||
                deleteProjectDraft !== deletionConfirmationWord
              }
              onClick={() => void deleteProject()}
            >
              {deletingProject ? t.appDeleting : t.appDeleteProject}
            </button>
          )}
        </div>
      </dialog>

      {(groupDialog || deleteTaskId) && (
        <dialog
          ref={actionDialogRef}
          className="modal action-dialog"
          aria-labelledby="action-dialog-title"
          onKeyDown={containModalTab}
          onCancel={(event) => {
            event.preventDefault();
            closeActionDialog();
          }}
        >
          <div className="modal-heading">
            <h2 id="action-dialog-title">
              {deleteTaskId
                ? t.appDeleteTask
                : groupDialog?.mode === 'delete'
                  ? t.appDeleteGroup
                  : groupDialog?.mode === 'rename'
                    ? t.appRenameGroup
                    : t.appNewGroup}
            </h2>
            <button
              type="button"
              className="modal-close"
              aria-label={t.close}
              onClick={closeActionDialog}
            >
              ×
            </button>
          </div>
          {deleteTaskId ? (
            <>
              {deleteTaskStep === 1 ? (
                <p className="modal-copy">
                  {t.deleteTaskWarningBefore}
                  <b>{project?.tasks.find((task) => task.id === deleteTaskId)?.name}</b>
                  {t.deleteTaskWarningAfter.replace('{word}', deletionConfirmationWord)}
                </p>
              ) : (
                <>
                  <p className="modal-copy">
                    {t.deleteTaskConfirmBefore}
                    <b>{project?.tasks.find((task) => task.id === deleteTaskId)?.name}</b>
                    {t.deleteTaskConfirmAfter}
                  </p>
                  <label className="modal-field" htmlFor="delete-task-confirmation">
                    {t.appTypeToConfirm.replace('{0}', String(deletionConfirmationWord))}
                    <input
                      id="delete-task-confirmation"
                      autoFocus
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      value={deleteTaskDraft}
                      onChange={(event) => setDeleteTaskDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && deleteTaskDraft === deletionConfirmationWord) {
                          event.preventDefault();
                          void confirmDeleteTask();
                        }
                      }}
                    />
                  </label>
                </>
              )}
            </>
          ) : groupDialog?.mode === 'delete' ? (
            <>
              <p className="modal-copy">{t.appTasksWillRemainUngroupedYou}</p>
              {groupDialog.step === 2 && (
                <label className="modal-field">
                  {t.appTypeToConfirm.replace('{0}', String(deletionConfirmationWord))}
                  <input
                    autoFocus
                    value={groupDraft}
                    onChange={(event) => setGroupDraft(event.target.value)}
                  />
                </label>
              )}
            </>
          ) : (
            <label className="modal-field">
              {t.appGroupName}
              <input
                autoFocus
                maxLength={160}
                value={groupDraft}
                onChange={(event) => setGroupDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void saveGroup();
                  }
                }}
              />
            </label>
          )}
          <div className="modal-actions">
            <button className="secondary-button" onClick={closeActionDialog}>
              {t.cancel}
            </button>
            <button
              className={
                deleteTaskId || groupDialog?.mode === 'delete' ? 'danger-button' : 'primary-button'
              }
              disabled={
                saveState === 'saving' ||
                (!!deleteTaskId &&
                  deleteTaskStep === 2 &&
                  deleteTaskDraft !== deletionConfirmationWord) ||
                (!!groupDialog && groupDialog.mode !== 'delete' && !groupDraft.trim()) ||
                (!!groupDialog &&
                  groupDialog.mode === 'delete' &&
                  groupDialog.step === 2 &&
                  groupDraft !== deletionConfirmationWord)
              }
              onClick={() => {
                if (deleteTaskId) void confirmDeleteTask();
                else void saveGroup();
              }}
            >
              {deleteTaskId
                ? deleteTaskStep === 1
                  ? t.appContinue
                  : t.appDeleteTask
                : groupDialog?.mode === 'delete'
                  ? groupDialog.step === 1
                    ? t.appContinue
                    : t.appDeleteGroup
                  : t.appSave}
            </button>
          </div>
        </dialog>
      )}
      {taskDialogOpen && (
        <dialog
          ref={taskDialogRef}
          className="modal task-create-dialog"
          aria-labelledby="task-create-heading"
          onKeyDown={containModalTab}
          onCancel={(event) => {
            event.preventDefault();
            closeTaskDialog();
          }}
        >
          <form onSubmit={(event) => void createTask(event)}>
            <div className="modal-heading">
              <h2 id="task-create-heading">{t.appNewTask}</h2>
              <button
                type="button"
                className="modal-close"
                aria-label={t.close}
                onClick={closeTaskDialog}
              >
                ×
              </button>
            </div>
            <label className="modal-field" htmlFor="task-create-name">
              {t.taskName}
              <input
                ref={taskCreateNameRef}
                id="task-create-name"
                placeholder={t.addTask}
                maxLength={240}
                value={taskName}
                onChange={(event) => setTaskName(event.target.value)}
                autoFocus
              />
            </label>
            <div className="task-create-dates">
              <div className="modal-field">
                <span>{t.start}</span>
                <DateControl
                  ariaLabel={`${t.start} ${t.appNewTask2}`}
                  locale={locale}
                  value={taskStart}
                  onChange={(next) => {
                    setTaskStart(next);
                    if (next > taskEnd) setTaskEnd(next);
                  }}
                />
              </div>
              <div className="modal-field">
                <span>{t.end}</span>
                <DateControl
                  ariaLabel={`${t.end} ${t.appNewTask2}`}
                  locale={locale}
                  value={taskIsMilestone ? taskStart : taskEnd}
                  min={taskStart}
                  disabled={taskIsMilestone}
                  onChange={setTaskEnd}
                />
              </div>
            </div>
            <label className="task-create-milestone">
              <input
                type="checkbox"
                checked={taskIsMilestone}
                onChange={(event) => setTaskIsMilestone(event.target.checked)}
              />
              {t.milestoneLabel}
            </label>
            <label className="modal-field">
              {t.appGroup}
              <select
                aria-label={t.appGroupForNewTask}
                value={taskTargetGroupId}
                onChange={(event) => setTaskTargetGroupId(event.target.value)}
              >
                <option value="">{t.appUngrouped}</option>
                {(project?.groups ?? []).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            {saveState === 'error' && (
              <p role="alert" className="note-error">
                {displayError(error)}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeTaskDialog}>
                {t.cancel}
              </button>
              <button
                className="primary-button"
                disabled={
                  !taskName.trim() ||
                  (!taskIsMilestone && taskEnd < taskStart) ||
                  saveState === 'saving'
                }
              >
                {t.addTask}
              </button>
            </div>
          </form>
        </dialog>
      )}
      {noteTarget && (
        <dialog
          ref={noteDialogRef}
          aria-labelledby="note-heading"
          className="modal note-modal"
          onKeyDown={containModalTab}
          onCancel={(event) => {
            event.preventDefault();
            void saveNote();
          }}
        >
          <div className="modal-heading">
            <h2 id="note-heading">{t.appNote.replace('{0}', () => noteTarget.item.name)}</h2>
            <button
              type="button"
              className="modal-close"
              aria-label={t.appSaveAndClose}
              disabled={saveState === 'saving'}
              onClick={() => void saveNote()}
            >
              ×
            </button>
          </div>
          <label className="modal-field" htmlFor="item-note">
            {t.appNote2}
            <textarea
              id="item-note"
              rows={6}
              maxLength={10000}
              value={noteDraft}
              onChange={(event) => {
                setNoteDraft(event.target.value);
                setNoteSaveFeedback('idle');
              }}
              autoFocus
            />
          </label>
          <p className="note-save-status" role="status" aria-live="polite">
            {saveState === 'saving'
              ? t.appSavingNote
              : noteSaveFeedback === 'saved'
                ? t.appNoteSaved
                : t.appTheNoteIsSavedAutomatically}
          </p>
          {saveState === 'error' && (
            <p role="alert" className="note-error">
              {displayError(error)} {t.appYouCanRetrySavingYour}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={saveState === 'saving'}
              onClick={() => void saveNote()}
            >
              {t.appClose}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={saveState === 'saving'}
              onClick={() => void saveNote(false)}
            >
              {t.appSave}
            </button>
          </div>
        </dialog>
      )}
      <dialog
        id="settings-dialog"
        className="modal settings-dialog"
        aria-labelledby="settings-heading"
      >
        <div className="modal-heading">
          <h2 id="settings-heading">{t.settings}</h2>
          <button
            className="modal-close"
            aria-label={t.close}
            onClick={() =>
              (document.getElementById('settings-dialog') as HTMLDialogElement | null)?.close()
            }
          >
            ×
          </button>
        </div>
        <section className="settings-section">
          <h3>{t.appLanguage}</h3>
          <label className="settings-select">
            <span>{t.language}</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              <option value="es">{t.spanish}</option>
              <option value="en">{t.english}</option>
            </select>
          </label>
        </section>
        <section className="settings-section">
          <h3>{t.appAppearance}</h3>
          <div className="segmented" role="radiogroup" aria-label={t.appAppearance}>
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={theme === option.value}
                className={theme === option.value ? 'is-selected' : ''}
                onClick={() => setTheme(option.value)}
              >
                {t[option.label]}
              </button>
            ))}
          </div>
        </section>
        <p className="modal-note">{t.appOffline}</p>
      </dialog>
      <dialog
        id="shortcuts-dialog"
        className="modal shortcuts-dialog"
        aria-labelledby="shortcuts-heading"
      >
        <div className="modal-heading">
          <h2 id="shortcuts-heading">{t.appKeyboardShortcuts}</h2>
          <button
            className="modal-close"
            aria-label={t.close}
            onClick={() =>
              (document.getElementById('shortcuts-dialog') as HTMLDialogElement | null)?.close()
            }
          >
            ×
          </button>
        </div>
        <dl className="shortcut-list">
          {keyboardShortcuts(locale).map((row) => (
            <div key={row.keys}>
              <dt>
                <kbd>{row.keys}</kbd>
              </dt>
              <dd>{row.action}</dd>
            </div>
          ))}
        </dl>
      </dialog>
      <dialog
        ref={projectDrawerRef}
        className="project-drawer"
        aria-labelledby="project-drawer-heading"
        onKeyDown={containModalTab}
        onCancel={(event) => {
          event.preventDefault();
          setProjectDrawerOpen(false);
        }}
      >
        <div className="project-drawer-heading">
          <h2 id="project-drawer-heading">{t.projects}</h2>
          <button
            ref={projectDrawerCloseRef}
            type="button"
            className="modal-close"
            aria-label={t.close}
            onClick={() => setProjectDrawerOpen(false)}
          >
            ×
          </button>
        </div>
        <button
          type="button"
          className="drawer-new-project"
          onClick={(event) => openNewProject(event.currentTarget)}
        >
          ＋ {t.newProject}
        </button>
        <nav className="project-list" aria-label={t.projects}>
          {projects.map((item, index) => (
            <button
              key={item.id}
              className={`project-nav ${item.id === project?.id ? 'active' : ''}`}
              aria-current={item.id === project?.id ? 'page' : undefined}
              onClick={() => selectProject(item.id)}
            >
              <span className={`project-mark mark-${index % 4}`} />{' '}
              <span className="project-nav-name">{item.name}</span>
              <span className="project-chevron">›</span>
            </button>
          ))}
          {!projects.length && <p className="sidebar-empty">{t.noProjects}</p>}
        </nav>
        <div className="sidebar-footer">
          <span className="connection-dot" />
          <span>PostgreSQL local</span>
        </div>
      </dialog>
      <dialog
        ref={newProjectDialogRef}
        className="modal project-dialog"
        aria-labelledby="project-name-heading"
        onKeyDown={containModalTab}
        onCancel={(event) => {
          event.preventDefault();
          if (saveState !== 'saving') setProjectNameMode(null);
        }}
      >
        <form onSubmit={(event) => void submitProjectName(event)}>
          <div className="modal-heading">
            <h2 id="project-name-heading">
              {projectNameMode === 'rename' ? renameProjectLabel : t.newProject}
            </h2>
            <button
              type="button"
              className="modal-close"
              aria-label={t.close}
              disabled={saveState === 'saving'}
              onClick={() => setProjectNameMode(null)}
            >
              ×
            </button>
          </div>
          <label className="modal-field">
            {t.projectName}
            <input
              ref={newProjectInputRef}
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              maxLength={160}
              readOnly={saveState === 'saving'}
            />
          </label>
          {projectNameMode === 'rename' && error && (
            <p role="alert" className="note-error">
              {displayError(error)}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={saveState === 'saving'}
              onClick={() => setProjectNameMode(null)}
            >
              {t.cancel}
            </button>
            <button
              className="primary-button"
              disabled={
                saveState === 'saving' ||
                !projectName.trim() ||
                (projectNameMode === 'rename' && projectName.trim() === project?.name)
              }
            >
              {projectNameMode === 'rename' ? (
                t.appSave
              ) : (
                <>
                  {t.create} <span>→</span>
                </>
              )}
            </button>
          </div>
        </form>
      </dialog>
      <dialog
        ref={conflictDialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="conflict-heading"
        aria-describedby="conflict-description"
        className="modal conflict-modal"
        onKeyDown={containModalTab}
        onCancel={(event) => {
          event.preventDefault();
          rejectConflict();
        }}
      >
        {conflict && (
          <>
            <div className="conflict-mark" aria-hidden="true">
              !
            </div>
            <h2 id="conflict-heading">{t.conflictTitle}</h2>
            <p id="conflict-description">
              {conflict.kind === 'predecessors' ? t.predecessorConflictText : t.conflictText}
            </p>
            {project && (
              <ul className="conflict-relations">
                {conflict.kind === 'predecessors'
                  ? conflict.conflictingPredecessorIds.flatMap((id) => {
                      const predecessor = project.tasks.find((task) => task.id === id);
                      return predecessor
                        ? [
                            <li key={id}>
                              <b>{predecessor.name}</b> ({predecessor.endDate}) →{' '}
                              <b>{conflict.task.name}</b> ({conflict.proposedStartDate})
                            </li>,
                          ]
                        : [];
                    })
                  : project.dependencies.flatMap((dependency) => {
                      if (
                        dependency.predecessorId !== conflict.task.id &&
                        dependency.successorId !== conflict.task.id
                      )
                        return [];
                      const isPredecessor = dependency.predecessorId === conflict.task.id;
                      const relatedId = isPredecessor
                        ? dependency.successorId
                        : dependency.predecessorId;
                      const relatedTask = project.tasks.find((task) => task.id === relatedId);
                      return relatedTask
                        ? [
                            <li key={dependency.id}>
                              {isPredecessor ? t.conflictSuccessor : t.conflictPredecessor}:{' '}
                              <b>{relatedTask.name}</b>
                            </li>,
                          ]
                        : [];
                    })}
              </ul>
            )}
            {conflict.kind === 'dates' ? (
              <div className="conflict-dates">
                <span>{conflict.task.name}</span>
                <b>
                  {conflict.startDate} → {conflict.endDate}
                </b>
              </div>
            ) : (
              <>
                <div className="conflict-dates">
                  <span>{t.conflictCurrentDates}</span>
                  <b>
                    {conflict.task.startDate} → {conflict.task.endDate}
                  </b>
                </div>
                <div className="conflict-dates">
                  <span>{t.conflictAdjustedDates}</span>
                  <b>
                    {conflict.proposedStartDate} → {conflict.proposedEndDate}
                  </b>
                </div>
              </>
            )}
            <div className="modal-actions">
              <button ref={conflictRejectRef} className="secondary-button" onClick={rejectConflict}>
                {t.reject}
              </button>
              <button className="primary-button" onClick={() => void acceptConflict()}>
                {t.accept} <span>→</span>
              </button>
            </div>
          </>
        )}
      </dialog>
      {importOpen && importFile && (
        <div className="scrim" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-heading"
            className="modal"
          >
            <div className="modal-heading">
              <h2 id="import-heading">{t.importTitle}</h2>
              <button
                className="modal-close"
                aria-label={t.close}
                onClick={() => setImportOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="modal-copy">
              {t.importMode}
              <br />
              <b>{importFile.project.name}</b>
            </p>
            <label className="modal-field">
              {t.project}
              <select
                value={importTarget}
                onChange={(event) => setImportTarget(event.target.value)}
                disabled={!projects.length}
              >
                {projects.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions import-actions">
              <button className="secondary-button" onClick={() => void performImport('copy')}>
                {t.asCopy}
              </button>
              <button
                className="primary-button"
                disabled={!importTarget}
                onClick={() => {
                  if (window.confirm(t.confirmReplace)) void performImport('replace');
                }}
              >
                {t.confirmReplace}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="brand" aria-label="PDR 2.0">
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 36 36" fill="none">
          <rect x="4.5" y="4.5" width="14" height="5" rx="1.5" />
          <rect x="13.5" y="14.5" width="17" height="5" rx="1.5" />
          <rect x="7.5" y="24.5" width="16" height="5" rx="1.5" />
          <path d="M18.5 7v6.5h-4.2" />
          <path d="m16.2 11.8-2 1.7 2 1.7" />
        </svg>
      </span>
      <span>
        <b>
          PDR <em>2.0</em>
        </b>
      </span>
    </div>
  );
}
function containModalTab(event: React.KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const dialog = event.currentTarget;
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (element) =>
      !element.hidden &&
      element.getAttribute('aria-hidden') !== 'true' &&
      element.getClientRects().length > 0,
  );
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}
function Icon({ name }: { name: 'upload' | 'download' | 'trash' | 'user' }) {
  const paths = {
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 14v5h14v-5" />
      </>
    ),
    download: (
      <>
        <path d="M12 4v12" />
        <path d="m17 11-5 5-5-5" />
        <path d="M5 17v2h14v-2" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M10 11v6M14 11v6" />
        <path d="m6 7 1 13h10l1-13M9 7V4h6v3" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.25" />
        <path d="M5.5 20v-1.2a6.5 6.5 0 0 1 13 0V20" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
