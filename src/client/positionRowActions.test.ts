import { describe, expect, it, vi } from 'vitest';
import { positionRowActions } from './positionRowActions.js';

function openMenu(triggerRect: DOMRect, panelWidth: number, panelHeight: number) {
  const menu = document.createElement('details');
  menu.open = true;
  menu.innerHTML = '<summary></summary><div class="row-actions-content"></div>';
  const trigger = menu.querySelector('summary')!;
  const panel = menu.querySelector<HTMLElement>('.row-actions-content')!;
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(triggerRect);
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ width: panelWidth } as DOMRect);
  Object.defineProperty(panel, 'scrollHeight', { configurable: true, value: panelHeight });
  document.body.append(menu);
  return { menu, panel };
}

describe('positionRowActions', () => {
  it('moves a panel inward when its trigger is near the left viewport edge', () => {
    vi.stubGlobal('innerWidth', 820);
    vi.stubGlobal('innerHeight', 1180);
    const { menu, panel } = openMenu({ left: 80, right: 124, top: 400, bottom: 444 } as DOMRect, 260, 260);

    positionRowActions(menu);

    expect(panel.style.position).toBe('fixed');
    expect(panel.style.left).toBe('80px');
    expect(panel.style.right).toBe('auto');
    expect(panel.style.top).toBe('444px');
    menu.remove();
  });

  it('clamps the panel horizontally and opens above a low trigger when needed', () => {
    vi.stubGlobal('innerWidth', 820);
    vi.stubGlobal('innerHeight', 600);
    const { menu, panel } = openMenu({ left: 770, right: 814, top: 520, bottom: 564 } as DOMRect, 260, 300);

    positionRowActions(menu);

    expect(panel.style.left).toBe('552px');
    expect(panel.style.top).toBe('220px');
    expect(panel.style.maxHeight).toBe('512px');
    menu.remove();
  });
});
