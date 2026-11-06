import type { Locale, TaskGroup } from '../../shared/model.js';
import { GROUP_COLORS } from '../../shared/model.js';
import { componentMessages } from '../component-messages.js';

type Props = { group: TaskGroup; locale: Locale; onSelect: (color: TaskGroup['color']) => void };

export function GroupColorPicker({ group, locale, onSelect }: Props) {
  const copy = componentMessages(locale).colors;
  return (
    <div className="group-color-picker">
      <span>{copy.heading}</span>
      <div role="group" aria-label={`${copy.heading}: ${group.name}`}>
        <button
          type="button"
          className="group-color-swatch group-color-neutral"
          aria-label={copy.none}
          aria-pressed={!group.color}
          title={copy.none}
          onClick={() => onSelect(null)}
        />
        {GROUP_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`group-color-swatch group-color-${color}`}
            aria-label={copy[color]}
            aria-pressed={group.color === color}
            title={copy[color]}
            onClick={() => onSelect(color)}
          />
        ))}
      </div>
    </div>
  );
}
