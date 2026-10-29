import type { FloorTable, TableShape } from '@crumble/shared';
import { TABLE_SHAPES } from '@crumble/shared';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { FloorCanvas } from '../../components/FloorCanvas';
import { PromptDialog } from '../../components/PromptDialog';
import { useAction, useApiData } from '../../components/useApi';
import { SHAPE_LABEL } from '../../floor/constants';

const SWATCHES = ['#dce8e0', '#c8dccf', '#e9eef5', '#edefeb', '#e3e1dc', '#d0d6d2'];

/** Kroki editor (plan §5.3): sections, shapes, guide image. */
export function FloorEditor() {
  const [plans, reloadPlans] = useApiData(() => api.listFloorPlans());
  const [planId, setPlanId] = useState<string>();
  const [tables, reloadTables] = useApiData(() => (planId ? api.listTables(planId) : Promise.resolve([])), [planId]);
  const [background, reloadBackground] = useApiData(
    () => (planId ? api.getFloorBackground(planId) : Promise.resolve(null)),
    [planId],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'new' | 'rename' | null>(null);
  const run = useAction();

  useEffect(() => {
    if (plans && !plans.some((p) => p.id === planId)) setPlanId(plans[0]?.id);
  }, [plans, planId]);

  const plan = plans?.find((p) => p.id === planId);
  const selected = tables?.find((t) => t.id === selectedId) ?? null;

  const update = (id: string, patch: Partial<FloorTable>) =>
    run(async () => {
      await api.updateTable(id, patch);
      await reloadTables();
    });

  const addShape = (shape: TableShape) =>
    run(async () => {
      if (!planId) return;
      const table = await api.createTable(planId, shape);
      await reloadTables();
      setSelectedId(table.id);
    });

  const loadImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () =>
      void run(async () => {
        await api.setFloorBackground(planId!, String(reader.result));
        await reloadBackground();
      }, 'Rehber görsel yüklendi.');
    reader.readAsDataURL(file);
  };

  if (!plans) return null;

  return (
    <>
      <h2>Kroki düzenle</h2>
      <div className="section-tabs">
        {plans.map((p) => (
          <button key={p.id} className={`btn${p.id === planId ? ' active' : ''}`} onClick={() => setPlanId(p.id)}>
            {p.name}
          </button>
        ))}
        <button className="btn" onClick={() => setDialog('new')}>
          + Bölüm ekle
        </button>
        {plan && (
          <>
            <button className="btn small" onClick={() => setDialog('rename')}>
              Bölüm adı
            </button>
            <button
              className="btn small danger"
              onClick={() => {
                if (!window.confirm(`"${plan.name}" bölümü ve masaları silinsin mi?`)) return;
                void run(async () => {
                  await api.deleteFloorPlan(plan.id);
                  await reloadPlans();
                }, 'Bölüm silindi.');
              }}
            >
              Bölümü sil
            </button>
          </>
        )}
      </div>

      {plan ? (
        <div className="editor-layout">
          <div>
            <div className="row wrap" style={{ marginBottom: 8 }}>
              {TABLE_SHAPES.map((shape) => (
                <button key={shape} className="btn" onClick={() => void addShape(shape)}>
                  + {SHAPE_LABEL[shape]}
                </button>
              ))}
              <span className="grow" />
              <label className="btn small">
                Rehber görsel
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  aria-label="Rehber görsel"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) loadImage(file);
                    e.target.value = '';
                  }}
                />
              </label>
              {background && (
                <button
                  className="btn small"
                  onClick={() =>
                    void run(async () => {
                      await api.setFloorBackground(plan.id, null);
                      await reloadBackground();
                    })
                  }
                >
                  Görseli kaldır
                </button>
              )}
            </div>
            <FloorCanvas
              tables={tables ?? []}
              background={background}
              editable
              selectedId={selectedId}
              onSelect={(t) => setSelectedId(t?.id ?? null)}
              onCommit={(id, patch) => void update(id, patch)}
            />
            <p className="muted">Şekli sürükleyerek taşıyın, yeşil köşeden boyutlandırın. Görsel sadece yerleştirmeye yardımcıdır.</p>
          </div>
          <div className="panel">
            {selected ? (
              <ShapeForm key={selected.id} table={selected} onChange={(patch) => void update(selected.id, patch)} onDelete={() => {
                if (!window.confirm(`Masa ${selected.label} silinsin mi?`)) return;
                void run(async () => {
                  await api.deleteTable(selected.id);
                  setSelectedId(null);
                  await reloadTables();
                });
              }} />
            ) : (
              <p className="muted">Düzenlemek için bir şekle tıklayın veya yukarıdan şekil ekleyin.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="empty">Henüz bölüm yok. "+ Bölüm ekle" ile başlayın (ör. İç mekan, Dış mekan).</div>
      )}

      {dialog && (
        <PromptDialog
          title={dialog === 'new' ? 'Yeni bölüm' : 'Bölüm adı'}
          label="Bölüm adı"
          initial={dialog === 'rename' ? plan?.name : ''}
          onClose={() => setDialog(null)}
          onConfirm={(name) =>
            void run(async () => {
              if (dialog === 'new') setPlanId((await api.createFloorPlan(name)).id);
              else if (plan) await api.renameFloorPlan(plan.id, name);
              setDialog(null);
              await reloadPlans();
            })
          }
        />
      )}
    </>
  );
}

function ShapeForm({
  table,
  onChange,
  onDelete,
}: {
  table: FloorTable;
  onChange(patch: Partial<FloorTable>): void;
  onDelete(): void;
}) {
  const [label, setLabel] = useState(table.label);
  const num = (key: 'width' | 'height' | 'rotation', title: string, step = 5) => (
    <>
      <label htmlFor={`shape-${key}`}>{title}</label>
      <input
        id={`shape-${key}`}
        className="input"
        type="number"
        step={step}
        defaultValue={table[key]}
        onBlur={(e) => Number(e.target.value) !== table[key] && onChange({ [key]: Number(e.target.value) })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </>
  );
  return (
    <div className="form" style={{ gridTemplateColumns: '80px 1fr' }}>
      <label htmlFor="shape-label">Etiket</label>
      <input
        id="shape-label"
        className="input"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label.trim() && label !== table.label && onChange({ label })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <label htmlFor="shape-type">Şekil</label>
      <select id="shape-type" className="input" value={table.shape} onChange={(e) => onChange({ shape: e.target.value as TableShape })}>
        {TABLE_SHAPES.map((s) => (
          <option key={s} value={s}>
            {SHAPE_LABEL[s]}
          </option>
        ))}
      </select>
      {num('width', 'Genişlik')}
      {num('height', 'Yükseklik')}
      {num('rotation', 'Açı (°)', 15)}
      <label>Renk</label>
      <div className="row wrap">
        {SWATCHES.map((c) => (
          <button
            key={c}
            className={`btn small${table.color === c ? ' active' : ''}`}
            style={{ background: c, width: 28, height: 24 }}
            aria-label={`Renk ${c}`}
            onClick={() => onChange({ color: c })}
          />
        ))}
        <input type="color" value={table.color} onChange={(e) => onChange({ color: e.target.value })} aria-label="Özel renk" />
      </div>
      <span />
      <button className="btn danger" onClick={onDelete}>
        Masayı sil
      </button>
    </div>
  );
}
