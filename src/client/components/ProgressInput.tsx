import { useState } from 'react';

type Props = {
  label?: string;
  progress: number;
  saving: boolean;
  onSave: (progress: number) => void;
};

export function ProgressInput({ label, progress, saving, onSave }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const value = Number(draft);
    if (!saving && draft !== '' && Number.isInteger(value) && value >= 0 && value <= 100 && value !== progress) onSave(value);
  };

  return <input type="number" min={0} max={100} step={1} aria-label={label} value={draft ?? progress} disabled={saving}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === 'Enter') { event.preventDefault(); commit(); }
      if (event.key === 'Escape') setDraft(null);
      if (draft === null && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        const value = progress + (event.key === 'ArrowUp' ? 1 : -1);
        if (value >= 0 && value <= 100) onSave(value);
      }
    }} />;
}
