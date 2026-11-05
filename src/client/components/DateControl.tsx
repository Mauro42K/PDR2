import { useLayoutEffect, useRef, useState } from 'react';
import type React from 'react';
import { createPortal } from 'react-dom';
import type { Locale } from '../../shared/model.js';

type DateControlProps = {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  ariaLabel: string;
  className?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
};

const dateFrom = (value: string) => value ? new Date(`${value}T00:00:00Z`) : new Date();
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const monthStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const moveMonth = (date: Date, amount: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
const moveDate = (value: string, amount: number) => isoDate(new Date(dateFrom(value).valueOf() + amount * 86_400_000));
const bounded = (value: string, min?: string, max?: string) => min && value < min ? min : max && value > max ? max : value;
const sameDayInMonth = (value: string, month: Date) => {
  const day = dateFrom(value).getUTCDate();
  const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  return isoDate(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), Math.min(day, last))));
};

export function DateControl({ value, onChange, locale, ariaLabel, className = '', min, max, disabled = false }: DateControlProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const [open, setOpen] = useState(false);
  const calendarOpen = open && !disabled;
  const [month, setMonth] = useState(() => monthStart(dateFrom(value)));
  const [activeDate, setActiveDate] = useState(() => bounded(value || isoDate(new Date()), min, max));
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';
  const selectedDate = dateFrom(value);
  const display = value ? new Intl.DateTimeFormat(localeTag, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(selectedDate) : '';
  const monthLabel = new Intl.DateTimeFormat(localeTag, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(month);
  const weekdayFormatter = new Intl.DateTimeFormat(localeTag, { weekday: 'short', timeZone: 'UTC' });
  const weekdays = Array.from({ length: 7 }, (_, index) => weekdayFormatter.format(new Date(Date.UTC(2023, 0, 2 + index))));
  const firstDay = monthStart(month);
  const gridStart = new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth(), 1 - ((firstDay.getUTCDay() + 6) % 7)));
  const days = Array.from({ length: 42 }, (_, index) => new Date(Date.UTC(gridStart.getUTCFullYear(), gridStart.getUTCMonth(), gridStart.getUTCDate() + index)));
  const dateFormatter = new Intl.DateTimeFormat(localeTag, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  useLayoutEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useLayoutEffect(() => {
    if (calendarOpen) dayRefs.current.get(activeDate)?.focus();
  }, [calendarOpen, activeDate, month]);

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) window.setTimeout(() => buttonRef.current?.focus(), 0);
  };

  useLayoutEffect(() => {
    if (!calendarOpen || !buttonRef.current) return;
    const place = () => {
      const bounds = buttonRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(326, window.innerWidth - 16);
      const height = popoverRef.current?.getBoundingClientRect().height ?? 290;
      const left = Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8));
      const below = bounds.bottom + 6;
      const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, bounds.top - height - 6);
      setPosition({ left, top });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [calendarOpen, month]);

  useLayoutEffect(() => {
    if (!calendarOpen) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !popoverRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [calendarOpen]);

  const showCalendar = () => {
    if (open) { close(); return; }
    const initial = bounded(value || isoDate(new Date()), min, max);
    setMonth(monthStart(dateFrom(initial)));
    setActiveDate(initial);
    setOpen(true);
  };

  const changeMonth = (amount: number) => {
    const nextMonth = moveMonth(month, amount);
    setMonth(nextMonth);
    setActiveDate(bounded(sameDayInMonth(activeDate, nextMonth), min, max));
  };

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next: string | null = null;
    if (event.key === 'ArrowLeft') next = moveDate(activeDate, -1);
    else if (event.key === 'ArrowRight') next = moveDate(activeDate, 1);
    else if (event.key === 'ArrowUp') next = moveDate(activeDate, -7);
    else if (event.key === 'ArrowDown') next = moveDate(activeDate, 7);
    else if (event.key === 'Home' || event.key === 'End') {
      const date = dateFrom(activeDate);
      const mondayOffset = (date.getUTCDay() + 6) % 7;
      next = moveDate(activeDate, event.key === 'Home' ? -mondayOffset : 6 - mondayOffset);
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const amount = (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1);
      const nextMonth = moveMonth(month, amount);
      setMonth(nextMonth);
      next = sameDayInMonth(activeDate, nextMonth);
    }
    if (!next) return;
    event.preventDefault();
    next = bounded(next, min, max);
    setActiveDate(next);
    const nextMonth = monthStart(dateFrom(next));
    if (nextMonth.valueOf() !== month.valueOf()) setMonth(nextMonth);
  };

  return <span className={`date-control ${className}`}>
    <button ref={buttonRef} type="button" className="date-control-button" aria-label={`${ariaLabel}: ${display}`} aria-haspopup="dialog" aria-expanded={calendarOpen} disabled={disabled} onClick={showCalendar}>
      <span className="date-control-value">{display}</span>
      <svg className="date-control-icon" aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="4.5" width="15" height="13" rx="2"/><path d="M6.5 2.5v4M13.5 2.5v4M2.5 8.5h15"/></svg>
    </button>
    {calendarOpen && createPortal(<div ref={popoverRef} className="date-picker-popover" role="dialog" aria-label={`${ariaLabel}: ${monthLabel}`} style={{ left: position.left, top: position.top }}>
      <div className="date-picker-heading">
        <button type="button" aria-label={locale === 'es' ? 'Mes anterior' : 'Previous month'} onClick={() => changeMonth(-1)}><span aria-hidden="true">‹</span></button>
        <strong>{monthLabel}</strong>
        <button type="button" aria-label={locale === 'es' ? 'Mes siguiente' : 'Next month'} onClick={() => changeMonth(1)}><span aria-hidden="true">›</span></button>
      </div>
      <div className="date-picker-grid" role="grid" aria-label={monthLabel} onKeyDown={onGridKeyDown}>
        <div className="date-picker-row date-picker-weekdays" role="row">{weekdays.map((weekday, index) => <span className="date-picker-weekday" role="columnheader" key={`${weekday}-${index}`}>{weekday}</span>)}</div>
        {Array.from({ length: 6 }, (_, week) => <div className="date-picker-row" role="row" key={week}>{days.slice(week * 7, week * 7 + 7).map((day) => {
          const key = isoDate(day);
          const outsideMonth = day.getUTCMonth() !== month.getUTCMonth();
          const disabled = (!!min && key < min) || (!!max && key > max);
          return <div role="gridcell" aria-selected={key === value} key={key}><button ref={(element) => { if (element) dayRefs.current.set(key, element); else dayRefs.current.delete(key); }} tabIndex={key === activeDate ? 0 : -1} type="button" className={`date-picker-day${outsideMonth ? ' outside-month' : ''}${key === value ? ' selected' : ''}`} aria-label={dateFormatter.format(day)} aria-pressed={key === value} disabled={disabled} onFocus={() => setActiveDate(key)} onClick={() => { onChange(key); close(true); }}>{day.getUTCDate()}</button></div>;
        })}</div>)}
      </div>
    </div>, buttonRef.current?.closest('dialog') ?? document.body)}
  </span>;
}
