import { useEffect, useState } from 'react';

type NumericDraftInputProps = {
  value: number | undefined;
  onCommit: (value: number) => void;
  onClear?: () => void;
  min?: number;
  max?: number;
  integer?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

function numericDraft(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

export function NumericDraftInput({ value, onCommit, onClear, min, max, integer = false, disabled, placeholder, className }: NumericDraftInputProps) {
  const [draft, setDraft] = useState(() => numericDraft(value));

  useEffect(() => setDraft(numericDraft(value)), [value]);

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed) {
      if (onClear) onClear();
      else setDraft(numericDraft(value));
      return;
    }

    let next = Number(trimmed);
    if (!Number.isFinite(next)) {
      setDraft(numericDraft(value));
      return;
    }
    if (integer) next = Math.round(next);
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    setDraft(String(next));
    onCommit(next);
  }

  return <input className={`numeric-draft-input${className ? ` ${className}` : ''}`} inputMode="decimal" value={draft} disabled={disabled} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      setDraft(numericDraft(value));
      event.currentTarget.blur();
    }
  }} />;
}
