/**
 * Asks before a step that is hard to undo (2026-11-04: gün sonu, reopening a
 * closed day). "Vazgeç" has the focus, so Enter or Esc never confirms; only a
 * click on the confirm button does.
 */
export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  text?: string;
  confirmLabel: string;
  onConfirm(): void;
  onClose(): void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog confirm"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h3>{title}</h3>
        {text && <p className="muted">{text}</p>}
        <div className="actions">
          <button type="button" className="btn" autoFocus onClick={onClose}>
            Vazgeç
          </button>
          <button type="button" className="btn primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
