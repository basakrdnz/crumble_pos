import { useEffect } from 'react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'] as const;

/**
 * Phone-style number pad (plan §5.1). Controlled: the parent keeps the text.
 * While `captureKeyboard` is on, typing digits on the keyboard also works,
 * unless focus is in a text field.
 */
export function Keypad({
  value,
  onChange,
  onEnter,
  allowComma = false,
  maxLength = 9,
  captureKeyboard = true,
  enterLabel = 'Tamam',
}: {
  value: string;
  onChange(next: string): void;
  onEnter?(): void;
  allowComma?: boolean;
  maxLength?: number;
  captureKeyboard?: boolean;
  enterLabel?: string;
}) {
  const press = (key: string) => {
    if (key === '⌫') return onChange(value.slice(0, -1));
    if (key === 'C') return onChange('');
    if (key === ',') {
      if (!allowComma || value.includes(',')) return;
      return onChange((value || '0') + ',');
    }
    if (value.length >= maxLength) return;
    const decimals = value.split(',')[1];
    if (decimals !== undefined && decimals.length >= 2) return;
    onChange(value === '0' ? key : value + key);
  };

  useEffect(() => {
    if (!captureKeyboard) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === ',' || e.key === '.') press(',');
      else if (e.key === 'Backspace') press('⌫');
      else if (e.key === 'Delete') press('C');
      else if (e.key === 'Enter' && onEnter) onEnter();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  return (
    <div className="keypad" role="group" aria-label="Tuş takımı">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="btn key"
          disabled={key === ',' && !allowComma}
          onClick={() => press(key)}
          aria-label={key === '⌫' ? 'Sil' : key}
        >
          {key}
        </button>
      ))}
      <button type="button" className="btn key" onClick={() => press('C')} aria-label="Temizle">
        C
      </button>
      {onEnter && (
        <button type="button" className="btn key primary enter" onClick={onEnter}>
          {enterLabel}
        </button>
      )}
    </div>
  );
}

/** "125,5" -> 12550 kuruş; null when empty or invalid. */
export function keypadToKurus(text: string): number | null {
  if (!text) return null;
  const match = /^(\d+)(?:,(\d{0,2}))?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export function keypadToInt(text: string): number | null {
  return /^\d+$/.test(text) ? Number(text) : null;
}
