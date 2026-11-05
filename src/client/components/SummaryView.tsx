import type { CalendarAlert, Locale, Project, Task } from '../../shared/model.js';
import { calendarAlert, groupSummary } from '../../shared/model.js';
import { messages } from '../i18n.js';

type Props = { project: Project; today: string; locale: Locale };
type Semaphore = 'onTrack' | 'atRisk' | 'offTrack' | 'empty';

/** Semáforo de grupo (F3-02, sección 5.1): fuera de plazo si hay una tarea atrasada; en riesgo si hay alertas de inicio o próximas. */
export function semaphore(tasks: Task[], today: string): Semaphore {
  if (!tasks.length) return 'empty';
  const alerts = tasks.map((task) => calendarAlert(task, today));
  if (alerts.includes('overdue')) return 'offTrack';
  if (alerts.includes('late_start') || alerts.includes('due_soon')) return 'atRisk';
  return 'onTrack';
}

/** Alert counters: each task counts once, under its most severe alert. */
export function alertCounts(tasks: Task[], today: string): Record<CalendarAlert, number> {
  const counts: Record<CalendarAlert, number> = { overdue: 0, late_start: 0, due_soon: 0 };
  for (const task of tasks) {
    const alert = calendarAlert(task, today);
    if (alert) counts[alert] += 1;
  }
  return counts;
}

/** Read-only management view: groups with their progress and semáforo, milestones, and alert counters. */
export function SummaryView({ project, today, locale }: Props) {
  const t = messages(locale);
  const groups = project.groups ?? [];
  const ungrouped = project.tasks.filter((task) => !task.groupId);
  const milestones = project.tasks.filter((task) => task.isMilestone);
  const counts = alertCounts(project.tasks, today);
  const label: Record<Semaphore, string> = { onTrack: t.semaphoreOnTrack, atRisk: t.semaphoreAtRisk, offTrack: t.semaphoreOffTrack, empty: t.summaryEmpty };
  const alertLabel: Record<CalendarAlert, string> = { overdue: t.alertOverdue, late_start: t.alertLateStart, due_soon: t.alertDueSoon };

  return <section className="summary-view" aria-label={t.viewSummary}>
    <p className="summary-readonly">{t.summaryReadOnly}</p>
    <ul className="summary-counters" aria-label={t.viewSummary}>
      {(Object.keys(counts) as CalendarAlert[]).map((alert) => <li key={alert} className={`alert-chip alert-${alert}`}><span>{alertLabel[alert]}</span><b>{counts[alert]}</b></li>)}
    </ul>
    <h2 className="summary-heading">{t.summaryGroups}</h2>
    <ul className="summary-groups">
      {groups.map((group) => {
        const tasks = project.tasks.filter((task) => task.groupId === group.id);
        const summary = groupSummary(tasks);
        const status = semaphore(tasks, today);
        return <li key={group.id} className={`summary-group semaphore-${status}`}>
          <span className="summary-group-name">{group.name}</span>
          <span className="summary-group-meta">{summary ? `${summary.startDate} → ${summary.endDate}` : t.summaryEmpty}</span>
          {summary && <span className="summary-progress" role="img" aria-label={`${summary.progress} %`}><span style={{ width: `${summary.progress}%` }} /></span>}
          <span className="summary-semaphore">{label[status]}</span>
        </li>;
      })}
      {ungrouped.length > 0 && <li className="summary-group summary-ungrouped"><span className="summary-group-name">{t.summaryUngrouped}</span><span className="summary-group-meta">{ungrouped.length}</span></li>}
    </ul>
    <h2 className="summary-heading">{t.summaryMilestones}</h2>
    <ul className="summary-milestones">
      {milestones.length === 0 && <li className="summary-empty">{t.summaryEmpty}</li>}
      {milestones.map((task) => {
        const alert = calendarAlert(task, today);
        return <li key={task.id} className="summary-milestone">
          <span className="milestone-symbol" aria-hidden="true">◆</span>
          <span className="summary-milestone-name">{task.name}</span>
          <span className="summary-group-meta">{task.startDate}</span>
          <span>{task.status === 'completed' ? t.milestoneDone : t.statusPending}</span>
          {alert && <span className={`alert-chip alert-${alert}`}>{alertLabel[alert]}</span>}
        </li>;
      })}
    </ul>
  </section>;
}
