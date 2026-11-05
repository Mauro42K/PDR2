/** Keep a contextual panel within the viewport, including after it grows. */
export function positionRowActions(menu: HTMLDetailsElement) {
  const trigger = menu.querySelector<HTMLElement>(':scope > summary');
  const panel = menu.querySelector<HTMLElement>(':scope > .row-actions-content');
  if (!menu.open || !trigger || !panel) return;
  const rect = trigger.getBoundingClientRect();
  const inset = 8;
  const width = panel.getBoundingClientRect().width || Math.min(260, window.innerWidth - inset * 2);
  const maxLeft = Math.max(inset, window.innerWidth - width - inset);
  const left = Math.max(inset, Math.min(rect.left, maxLeft));
  const above = Math.max(0, rect.top - inset);
  const below = Math.max(0, window.innerHeight - rect.bottom - inset);
  const naturalHeight = panel.scrollHeight || 320;
  const openAbove = below < naturalHeight && above > below;
  const availableHeight = Math.max(80, Math.min(540, openAbove ? above : below));
  const renderedHeight = Math.min(naturalHeight, availableHeight);
  const desiredTop = openAbove ? rect.top - renderedHeight : rect.bottom;
  const maxTop = Math.max(inset, window.innerHeight - renderedHeight - inset);

  // Fixed coordinates let the panel escape narrow table cells and keep it on-screen.
  panel.style.position = 'fixed';
  panel.style.left = `${left}px`;
  panel.style.right = 'auto';
  panel.style.top = `${Math.max(inset, Math.min(desiredTop, maxTop))}px`;
  panel.style.bottom = 'auto';
  panel.style.maxHeight = `${availableHeight}px`;
}
