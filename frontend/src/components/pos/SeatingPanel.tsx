import { useState } from 'react';
import { Armchair, CheckCircle2, Combine, Users } from 'lucide-react';
import {
  type SeatTable,
  type SeatZone,
  SEAT_STATUS_LABEL,
  clearTable,
  countsByStatus,
  markDirty,
  seatTable,
} from '../../lib/seating';

const ZONES: SeatZone[] = ['Main', 'Window', 'Patio', 'Bar'];

type Props = {
  tables: SeatTable[];
  onChange: (tables: SeatTable[]) => void;
  onOpenOrder: (table: SeatTable, partySize: number) => void;
  onMergeTables?: (keep: SeatTable, absorb: SeatTable) => void;
  canManage: boolean;
  staffName: string;
  flash: (msg: string) => void;
  /** Admin floor settings */
  floorBackground?: string;
  tableColors?: Record<string, string>;
};

function ChairDots({ seats, shape }: { seats: number; shape: SeatTable['shape'] }) {
  if (shape === 'bar') return null;
  const n = Math.min(seats, 8);
  const dots = Array.from({ length: n }, (_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = shape === 'rect' ? (i % 2 === 0 ? 48 : 38) : 46;
    const x = 50 + Math.cos(angle) * (shape === 'rect' ? 42 : r * 0.72);
    const y = 50 + Math.sin(angle) * (shape === 'rect' ? 34 : r * 0.72);
    return { x, y, i };
  });
  if (shape === 'rect') {
    const top = Math.ceil(n / 2);
    const bottom = n - top;
    const rectDots: { x: number; y: number; i: number }[] = [];
    for (let i = 0; i < top; i++) {
      rectDots.push({ x: 20 + (top === 1 ? 30 : (60 * i) / (top - 1 || 1)), y: 8, i });
    }
    for (let i = 0; i < bottom; i++) {
      rectDots.push({ x: 20 + (bottom === 1 ? 30 : (60 * i) / (bottom - 1 || 1)), y: 92, i: top + i });
    }
    return (
      <>
        {rectDots.map((d) => (
          <span key={d.i} className="ury-chair" style={{ left: `${d.x}%`, top: `${d.y}%` }} />
        ))}
      </>
    );
  }
  return (
    <>
      {dots.map((d) => (
        <span key={d.i} className="ury-chair" style={{ left: `${d.x}%`, top: `${d.y}%` }} />
      ))}
    </>
  );
}

function isLiveSeat(t: SeatTable) {
  return t.status === 'seated' || t.status === 'ordered' || t.status === 'bill';
}

export function SeatingPanel({
  floorBackground,
  tableColors,
  tables,
  onChange,
  onOpenOrder,
  onMergeTables,
  canManage,
  staffName,
  flash,
}: Props) {
  const [zone, setZone] = useState<SeatZone | 'All'>('All');
  const [selected, setSelected] = useState<string | null>(null);
  const [party, setParty] = useState(2);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const counts = countsByStatus(tables);
  const visible = tables.filter((t) => zone === 'All' || t.zone === zone);
  const active = tables.find((t) => t.id === selected) ?? null;
  const mergeCandidates = tables.filter((t) => isLiveSeat(t) && t.id !== active?.id);

  return (
    <section className="ury-panel ury-seating-page">
      <div className="ury-panel-head">
        <div>
          <div className="ury-eyebrow"><Armchair size={13} /> SEATING · FLOOR PLAN</div>
          <h1>Table map</h1>
          <p>Seat guests, open orders, or merge two live tables onto one ticket.</p>
        </div>
        <div className="ury-seat-kpis">
          <span><b>{counts.free}</b> free</span>
          <span><b>{counts.seated + counts.ordered}</b> live</span>
          <span><b>{counts.bill}</b> bill</span>
          <span><b>{counts.dirty}</b> dirty</span>
        </div>
      </div>

      <div className="ury-zone-row">
        {(['All', ...ZONES] as const).map((z) => (
          <button key={z} type="button" className={zone === z ? 'on' : ''} onClick={() => setZone(z)}>{z}</button>
        ))}
      </div>

      <div className="ury-floor">
        <div className="ury-floor-canvas" role="img" aria-label="Restaurant floor plan" style={floorBackground ? { background: floorBackground } : undefined}>
          <div className="ury-zone-label zl-main">Main</div>
          <div className="ury-zone-label zl-window">Window</div>
          <div className="ury-zone-label zl-patio">Patio</div>
          <div className="ury-zone-label zl-bar">Bar</div>
          <div className="ury-floor-window" aria-hidden />
          <div className="ury-floor-bar-counter" aria-hidden />
          <div className="ury-floor-patio-edge" aria-hidden />

          {visible.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`ury-real-table shape-${t.shape} status-${t.status} seats-${t.seats} ${selected === t.id ? 'selected' : ''}`}
              style={{ left: `${t.x}%`, top: `${t.y}%`, ...(tableColors?.[t.id] ? { background: tableColors[t.id] } : {}) }}
              onClick={() => {
                setSelected(t.id);
                setParty(t.partySize || Math.min(2, t.seats));
                setMergeTargetId('');
              }}
            >
              <span className="ury-table-surface">
                <ChairDots seats={t.seats} shape={t.shape} />
                <span className="ury-table-core">
                  <strong>{t.name.replace(/^(Table|Patio|Bar)\s+/i, '')}</strong>
                  <em>{SEAT_STATUS_LABEL[t.status]}</em>
                  {t.partySize ? (
                    <span className="ury-table-party"><Users size={9} /> {t.partySize}</span>
                  ) : (
                    <span className="ury-table-party muted">{t.seats}s</span>
                  )}
                </span>
              </span>
            </button>
          ))}
        </div>

        <aside className="ury-seat-side">
          {!active ? (
            <p className="ury-muted">Tap a table on the map.</p>
          ) : (
            <>
              <h2>{active.name}</h2>
              <p className="ury-muted">{active.zone} · {active.seats} seats · {SEAT_STATUS_LABEL[active.status]}</p>
              {active.ticketNumber ? <p className="ury-muted">Ticket #{active.ticketNumber}</p> : null}

              <label className="ury-field">
                <span>Party size</span>
                <input
                  type="number"
                  min={1}
                  max={active.seats}
                  value={party}
                  disabled={!canManage}
                  onChange={(e) => setParty(Math.max(1, Math.min(active.seats, Number(e.target.value) || 1)))}
                />
              </label>

              <div className="ury-seat-actions">
                {canManage && active.status === 'free' && (
                  <button
                    type="button"
                    className="ury-submit"
                    onClick={() => {
                      onChange(seatTable(tables, active.id, party, staffName));
                      flash(`${active.name} seated · ${party} guests`);
                    }}
                  >
                    Seat guests
                  </button>
                )}
                {canManage && (active.status === 'free' || active.status === 'seated') && (
                  <button
                    type="button"
                    className="ury-submit"
                    onClick={() => {
                      const next = active.status === 'free'
                        ? seatTable(tables, active.id, party, staffName)
                        : tables;
                      onChange(next);
                      onOpenOrder(
                        active.status === 'free'
                          ? { ...active, status: 'seated', partySize: party, server: staffName }
                          : active,
                        party,
                      );
                    }}
                  >
                    Open order on table
                  </button>
                )}
                {canManage && (active.status === 'ordered' || active.status === 'bill' || active.status === 'seated') && (
                  <button
                    type="button"
                    className="ury-ghost"
                    onClick={() => {
                      onOpenOrder(active, active.partySize || party);
                      flash(`Opened ${active.name} on Floor`);
                    }}
                  >
                    Go to ticket
                  </button>
                )}

                {canManage && onMergeTables && isLiveSeat(active) && mergeCandidates.length > 0 && (
                  <div className="ury-form-card" style={{ padding: 12, marginTop: 4 }}>
                    <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>
                      <Combine size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                      Merge into {active.name}
                    </h3>
                    <label className="ury-field">
                      <span>Absorb this table</span>
                      <select value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)}>
                        <option value="">Select table…</option>
                        {mergeCandidates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} · {SEAT_STATUS_LABEL[t.status]}
                            {t.ticketNumber ? ` · #${t.ticketNumber}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="ury-submit"
                      disabled={!mergeTargetId}
                      onClick={() => {
                        const absorb = tables.find((t) => t.id === mergeTargetId);
                        if (!absorb) return;
                        onMergeTables(active, absorb);
                        setMergeTargetId('');
                      }}
                    >
                      <Combine size={14} /> Merge tables
                    </button>
                  </div>
                )}

                {canManage && active.status === 'bill' && (
                  <button
                    type="button"
                    className="ury-ghost"
                    onClick={() => {
                      onChange(markDirty(tables, active.id));
                      flash(`${active.name} marked dirty`);
                    }}
                  >
                    Mark dirty after pay
                  </button>
                )}
                {canManage && active.status === 'dirty' && (
                  <button
                    type="button"
                    className="ury-submit"
                    onClick={() => {
                      onChange(clearTable(tables, active.id));
                      flash(`${active.name} cleared · free`);
                    }}
                  >
                    <CheckCircle2 size={14} /> Clear table
                  </button>
                )}
              </div>

              <div className="ury-legend">
                <span className="status-free">Free</span>
                <span className="status-seated">Seated</span>
                <span className="status-ordered">Ordered</span>
                <span className="status-bill">Bill</span>
                <span className="status-dirty">Dirty</span>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
