import { useState } from 'react';

/** Small dialog asking for one line of text. */
export function PromptDialog({
  title,
  label,
  initial = '',
  confirmLabel = 'Tamam',
  allowEmpty = false,
  onConfirm,
  onClose,
}: {
  title: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
  allowEmpty?: boolean;
  onConfirm(value: string): void;
  onClose(): void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(value);
        }}
      >
        <h3>{title}</h3>
        <input
          className="input"
          style={{ width: '100%' }}
          autoFocus
          aria-label={label}
          placeholder={label}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn primary" disabled={!allowEmpty && !value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
