import { formatTL, parseTL } from '@crumble/shared';
import { useEffect, useState } from 'react';

function toText(kurus: number): string {
  return formatTL(kurus).replace(' ₺', '').replace(/\./g, '');
}

/**
 * TL input that commits integer kuruş on Enter or blur. Accepts "65", "65,5",
 * "65.50"; invalid text is flagged and not committed. Escape reverts.
 */
export function PriceInput({
  value,
  onCommit,
  autoFocus,
  ariaLabel,
}: {
  value: number;
  onCommit: (kurus: number) => void;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(toText(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setText(toText(value)), [value]);

  const commit = () => {
    try {
      const kurus = parseTL(text);
      if (kurus < 0) throw new Error();
      setInvalid(false);
      if (kurus !== value) onCommit(kurus);
      setText(toText(kurus));
    } catch {
      setInvalid(true);
    }
  };

  return (
    <input
      className={`input price${invalid ? ' invalid' : ''}`}
      value={text}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setText(toText(value));
          setInvalid(false);
        }
      }}
    />
  );
}
