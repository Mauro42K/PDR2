import type { Locale, TaskGroup } from '../../shared/model.js';
import { GROUP_COLORS } from '../../shared/model.js';

type Props = { group: TaskGroup; locale: Locale; onSelect: (color: TaskGroup['color']) => void };

const labels = {
  es: { heading: 'Color del grupo', none: 'Sin color', blue: 'Azul suave', teal: 'Turquesa suave', green: 'Verde suave', amber: 'Ámbar suave', violet: 'Violeta suave', rose: 'Rosa suave' },
  en: { heading: 'Group color', none: 'No color', blue: 'Soft blue', teal: 'Soft teal', green: 'Soft green', amber: 'Soft amber', violet: 'Soft violet', rose: 'Soft rose' }
} as const;

export function GroupColorPicker({ group, locale, onSelect }: Props) {
  const copy = labels[locale];
  return <div className="group-color-picker">
    <span>{copy.heading}</span>
    <div role="group" aria-label={`${copy.heading}: ${group.name}`}>
      <button type="button" className="group-color-swatch group-color-neutral" aria-label={copy.none} aria-pressed={!group.color} title={copy.none} onClick={() => onSelect(null)} />
      {GROUP_COLORS.map((color) => <button key={color} type="button" className={`group-color-swatch group-color-${color}`} aria-label={copy[color]} aria-pressed={group.color === color} title={copy[color]} onClick={() => onSelect(color)} />)}
    </div>
  </div>;
}
