import { useEffect, useState } from 'react';
import { ChefHat, Clock3, Printer, Truck, Utensils } from 'lucide-react';
import {
  type ProcessAction,
  type Ticket,
  KITCHEN_SLA_MINUTES,
  isKitchenQueueStatus,
  kitchenPace,
} from '../../lib/order-process';
import type { KitchenSection } from '../../lib/extras';

type Props = {
  tickets: Ticket[];
  slaMinutes?: number;
  canProgress: boolean;
  canServe: boolean;
  canPrint: boolean;
  onAction: (ticketId: string, action: ProcessAction) => void;
  onOpenTicket: (ticket: Ticket) => void;
  onPrintTicket: (ticket: Ticket) => void;
  /** Admin-configured kitchen sections (each with a printer label) */
  sections?: KitchenSection[];
};

const COLS: { key: string; title: string; match: (s: Ticket['status']) => boolean }[] = [
  { key: 'new', title: 'New · sent', match: (s) => s === 'Sent to kitchen' },
  { key: 'prep', title: 'Preparing', match: (s) => s === 'Preparing' },
  { key: 'ready', title: 'Ready', match: (s) => s === 'Ready' },
];

export function KitchenPanel({
  tickets,
  slaMinutes = KITCHEN_SLA_MINUTES,
  canProgress,
  canServe,
  canPrint,
  onAction,
  onOpenTicket,
  onPrintTicket,
  sections = [],
}: Props) {
  const [sectionId, setSectionId] = useState<string>('all');
  const [now, setNow] = useState(Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    // Clear busy lock once the ticket leaves that column / status updates.
    if (busyId && !tickets.some((t) => t.id === busyId && t.status === 'Sent to kitchen')) {
      setBusyId(null);
    }
  }, [tickets, busyId]);

  function runAction(ticketId: string, action: ProcessAction) {
    if (busyId === ticketId) return;
    setBusyId(ticketId);
    onAction(ticketId, action);
    window.setTimeout(() => setBusyId((id) => (id === ticketId ? null : id)), 800);
  }

  const activeSection = sections.find((sec) => sec.id === sectionId);
  const inSection = (t: Ticket) =>
    !activeSection ||
    t.items.some((line) => sectionFor(line.menuItem.category) === activeSection.id);
  const sectionFor = (category: string) =>
    (sections.find((sec) => sec.categories.includes(category)) ?? sections[0])?.id;

  const queue = tickets
    .filter((t) => isKitchenQueueStatus(t.status) && t.items.length > 0 && inSection(t))
    .sort((a, b) => (a.sentAtMs ?? 0) - (b.sentAtMs ?? 0));

  const lateCount = queue.filter((t) => kitchenPace(t, now, slaMinutes).pace === 'late').length;

  return (
    <section className="ury-panel ury-kitchen">
      <div className="ury-panel-head">
        <div>
          <div className="ury-eyebrow"><ChefHat size={13} /> KITCHEN DISPLAY</div>
          <h1>Expo board</h1>
          <p>
            <b>Kitchen role (PIN 4444)</b> runs this board. Captain sends the order → kitchen Prep / Ready / Print.
            Captain then Serves on Floor. Target {slaMinutes} min SLA.
          </p>
        </div>
        <div className="ury-seat-kpis">
          <span><b>{queue.length}</b> live</span>
          <span><b>{lateCount}</b> late</span>
          <span><b>{slaMinutes}m</b> SLA</span>
        </div>
      </div>
      {sections.length > 0 && (
        <div className="ury-k-sections" role="tablist" aria-label="Kitchen sections">
          <button type="button" className={sectionId === 'all' ? 'on' : ''} onClick={() => setSectionId('all')}>All sections</button>
          {sections.map((sec) => (
            <button
              key={sec.id}
              type="button"
              role="tab"
              aria-selected={sectionId === sec.id}
              className={sectionId === sec.id ? 'on' : ''}
              onClick={() => setSectionId(sec.id)}
              title={`Printer: ${sec.printer}`}
            >
              {sec.name} <span className="ury-muted">· {sec.printer}</span>
            </button>
          ))}
        </div>
      )}

      {!queue.length ? (
        <div className="ury-kitchen-empty">
          <ChefHat size={28} />
          <p>No tickets in kitchen yet.</p>
          <small>From Floor: add dishes → Send to kitchen. Then open this Kitchen tab.</small>
        </div>
      ) : (
        <div className="ury-kitchen-board">
          {COLS.map((col) => {
            const cards = queue.filter((t) => col.match(t.status));
            return (
              <div key={col.key} className="ury-kitchen-col">
                <header>
                  <strong>{col.title}</strong>
                  <em>{cards.length}</em>
                </header>
                <div className="ury-kitchen-cards">
                  {cards.map((t) => {
                    const pace = kitchenPace(t, now, slaMinutes);
                    const TypeIcon = t.type === 'Delivery' ? Truck : t.type === 'Takeaway' ? Clock3 : Utensils;
                    return (
                      <article key={t.id} className={`ury-k-card pace-${pace.pace}`}>
                        <div className="ury-k-top">
                          <div>
                            <strong>#{t.number}</strong>
                            <span className="ury-k-where">
                              <TypeIcon size={12} /> {t.table}
                              {t.type !== 'Dine in' ? ` · ${t.type}` : ''}
                            </span>
                          </div>
                          <div className={`ury-k-timer pace-${pace.pace}`}>
                            <Clock3 size={12} />
                            <b>{pace.elapsedLabel}</b>
                            <small>{pace.label}</small>
                          </div>
                        </div>
                        {t.type === 'Delivery' && (t.customerName || t.customerPhone || t.deliveryAddress || t.deliveryPayMode) ? (
                          <div className="ury-k-note" style={{ display: 'grid', gap: 2 }}>
                            {t.customerName ? <span><b>{t.customerName}</b></span> : null}
                            {t.customerPhone ? <span>{t.customerPhone}</span> : null}
                            {t.deliveryAddress ? <span>{t.deliveryAddress}</span> : null}
                            {t.deliveryPayMode ? <span>Pay: {t.deliveryPayMode}</span> : null}
                            {t.deliveryNote ? <span>{t.deliveryNote}</span> : null}
                          </div>
                        ) : t.deliveryNote ? (
                          <p className="ury-k-note">{t.deliveryNote}</p>
                        ) : null}
                        <ul>
                          {t.items.map((line) => (
                            <li key={line.menuItem.id}>
                              <b>{line.quantity}×</b> {line.menuItem.name}
                              {line.notes ? <em> — {line.notes}</em> : null}
                            </li>
                          ))}
                        </ul>
                        <div className="ury-k-actions">
                          <button type="button" className="ury-ghost" onClick={() => onOpenTicket(t)}>
                            Open ticket
                          </button>
                          {canPrint && (
                            <button type="button" className="ury-ghost" onClick={() => onPrintTicket(t)} title="Print kitchen chit">
                              <Printer size={13} />
                            </button>
                          )}
                          {canProgress && t.status === 'Sent to kitchen' && (
                            <>
                              <button
                                type="button"
                                className="ury-submit"
                                disabled={busyId === t.id}
                                onClick={() => runAction(t.id, 'accept_order')}
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                className="ury-ghost"
                                disabled={busyId === t.id}
                                onClick={() => runAction(t.id, 'reject_order')}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {canProgress && t.status === 'Preparing' && (
                            <button
                              type="button"
                              className="ury-submit"
                              disabled={busyId === t.id}
                              onClick={() => runAction(t.id, 'mark_ready')}
                            >
                              Mark ready
                            </button>
                          )}
                          {canServe && t.status === 'Ready' && t.type === 'Dine in' && (
                            <button type="button" className="ury-submit" onClick={() => onAction(t.id, 'mark_served')}>
                              Serve to table
                            </button>
                          )}
                          {t.status === 'Ready' && t.type !== 'Dine in' && (
                            <span className="ury-k-ready-hint">
                              {t.type === 'Delivery'
                                ? 'Ready for courier · Delivery / Cashier can pay'
                                : 'Ready for pickup · Cashier can pay'}
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                  {!cards.length && <p className="ury-muted ury-k-empty-col">Empty</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
