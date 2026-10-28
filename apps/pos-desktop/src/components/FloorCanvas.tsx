import type { FloorTable } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { useEffect, useRef, useState } from 'react';
import { CANVAS } from '../floor/constants';

export interface TableStatus {
  total: number;
  name: string | null;
}

type Patch = Partial<Pick<FloorTable, 'x' | 'y' | 'width' | 'height'>>;

const RADIUS: Record<FloorTable['shape'], string> = {
  circle: '50%',
  square: '6px',
  rectangle: '6px',
  rounded_rectangle: '28px',
};

/**
 * Draws one floor plan section. View mode: occupied tables are highlighted
 * with their open total. Edit mode: drag to move, drag the corner to resize;
 * changes are committed on release.
 */
export function FloorCanvas({
  tables,
  background,
  status,
  selectedId,
  onSelect,
  editable = false,
  onCommit,
}: {
  tables: FloorTable[];
  background?: string | null;
  status?: Map<string, TableStatus>;
  selectedId?: string | null;
  onSelect(table: FloorTable | null): void;
  editable?: boolean;
  onCommit?(id: string, patch: Patch): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [draft, setDraft] = useState<{ id: string; patch: Patch } | null>(null);
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; startX: number; startY: number; table: FloorTable } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setScale(el.clientWidth / CANVAS.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const start = (e: React.PointerEvent, table: FloorTable, mode: 'move' | 'resize') => {
    if (!editable) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: table.id, mode, startX: e.clientX, startY: e.clientY, table };
    onSelect(table);
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    const t = d.table;
    const patch: Patch =
      d.mode === 'move'
        ? {
            x: Math.min(Math.max(0, t.x + dx), CANVAS.width - t.width),
            y: Math.min(Math.max(0, t.y + dy), CANVAS.height - t.height),
          }
        : { width: Math.max(20, t.width + dx), height: Math.max(20, t.height + dy) };
    setDraft({ id: d.id, patch });
  };

  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (d && draft && draft.id === d.id) onCommit?.(d.id, draft.patch);
    setDraft(null);
  };

  return (
    <div
      ref={box}
      className={`floor${editable ? ' editable' : ''}`}
      style={{ height: CANVAS.height * scale }}
      onPointerDown={() => onSelect(null)}
      onPointerMove={move}
      onPointerUp={end}
      aria-label="Kroki"
    >
      {background && <img className="floor-bg" src={background} alt="" draggable={false} />}
      {tables.map((table) => {
        const t = draft?.id === table.id ? { ...table, ...draft.patch } : table;
        const busy = status?.get(table.id);
        return (
          <div
            key={table.id}
            role="button"
            aria-label={`Masa ${table.label}`}
            data-table={table.label}
            className={`floor-table${busy ? ' busy' : ''}${selectedId === table.id ? ' selected' : ''}`}
            style={{
              left: t.x * scale,
              top: t.y * scale,
              width: t.width * scale,
              height: t.height * scale,
              borderRadius: RADIUS[t.shape],
              transform: `rotate(${t.rotation}deg)`,
              background: busy ? undefined : t.color,
            }}
            onPointerDown={(e) => (editable ? start(e, table, 'move') : e.stopPropagation())}
            onClick={(e) => {
              e.stopPropagation();
              if (!editable) onSelect(table);
            }}
          >
            <span className="floor-label" style={{ transform: `rotate(${-t.rotation}deg)` }}>
              <strong>{table.label}</strong>
              {busy && (
                <>
                  <span className="floor-total">{formatTL(busy.total)}</span>
                  {busy.name && <span className="floor-name">{busy.name}</span>}
                </>
              )}
            </span>
            {editable && selectedId === table.id && (
              <span className="resize-handle" onPointerDown={(e) => start(e, table, 'resize')} aria-label="Boyutlandır" />
            )}
          </div>
        );
      })}
    </div>
  );
}
