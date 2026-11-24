import { useMemo, useState } from 'react';
import { ClipboardList, Printer, Truck } from 'lucide-react';
import { type Ticket, calcTotals } from '../../lib/order-process';

type Filter = 'all' | 'live' | 'completed' | 'delivery_ready';

type Props = {
  orders: Ticket[];
  onOpen: (ticket: Ticket) => void;
  onPrintGuest: (ticket: Ticket) => void;
  onPrintKitchen: (ticket: Ticket) => void;
  canPrintKitchen: boolean;
  /** Delivery rider mode — focus Ready deliveries + collect COD */
  deliveryRunner?: boolean;
  canCollectPay?: boolean;
  onCollectPay?: (ticket: Ticket) => void;
};

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

function isLive(t: Ticket) {
  return t.status !== 'Paid' && t.items.length > 0;
}

function isCompleted(t: Ticket) {
  return t.status === 'Paid';
}

function isDeliveryReady(t: Ticket) {
  return t.type === 'Delivery' && t.status === 'Ready' && t.items.length > 0;
}

export function OrdersPanel({
  orders,
  onOpen,
  onPrintGuest,
  onPrintKitchen,
  canPrintKitchen,
  deliveryRunner = false,
  canCollectPay = false,
  onCollectPay,
}: Props) {
  const [filter, setFilter] = useState<Filter>(deliveryRunner ? 'delivery_ready' : 'all');
  const list = useMemo(() => {
    const sorted = [...orders].sort((a, b) => (b.openedAtMs || 0) - (a.openedAtMs || 0));
    if (filter === 'live') return sorted.filter(isLive);
    if (filter === 'completed') return sorted.filter(isCompleted);
    if (filter === 'delivery_ready') return sorted.filter(isDeliveryReady);
    if (deliveryRunner) {
      // Rider default list: ready + in-progress delivery tickets
      return sorted.filter((t) => t.type === 'Delivery' && t.items.length > 0 && t.status !== 'Open');
    }
    return sorted.filter((t) => t.items.length > 0);
  }, [orders, filter, deliveryRunner]);

  const liveCount = orders.filter(isLive).length;
  const doneCount = orders.filter(isCompleted).length;
  const readyDelivery = orders.filter(isDeliveryReady).length;

  return (
    <section className="ury-panel">
      <div className="ury-panel-head">
        <div>
          <div className="ury-eyebrow">
            {deliveryRunner ? <Truck size={13} /> : <ClipboardList size={13} />}
            {deliveryRunner ? ' DELIVERY RUNS' : ' DAY ORDERS'}
          </div>
          <h1>{deliveryRunner ? 'Ready for courier' : "Today's tickets"}</h1>
          <p>
            {deliveryRunner
              ? 'Pick up Ready delivery tickets, deliver to the customer, then collect payment at the door.'
              : 'All previous orders for the day — live kitchen/floor tickets and completed (paid) ones.'}
          </p>
        </div>
        <div className="ury-seat-kpis">
          {deliveryRunner ? (
            <>
              <span><b>{readyDelivery}</b> ready</span>
              <span><b>{orders.filter((t) => t.type === 'Delivery' && t.status === 'Paid').length}</b> delivered</span>
            </>
          ) : (
            <>
              <span><b>{liveCount}</b> live</span>
              <span><b>{doneCount}</b> completed</span>
              <span><b>{orders.filter((t) => t.items.length).length}</b> total</span>
            </>
          )}
        </div>
      </div>

      <div className="ury-zone-row">
        {(deliveryRunner
          ? ([
              ['delivery_ready', 'Ready to deliver'],
              ['live', 'All live delivery'],
              ['completed', 'Delivered / paid'],
            ] as const)
          : ([
              ['all', 'All today'],
              ['live', 'Live / open'],
              ['completed', 'Completed'],
            ] as const)
        ).map(([id, label]) => (
          <button key={id} type="button" className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="ury-muted">
          {deliveryRunner ? 'No delivery tickets ready yet — wait for Kitchen to Mark ready.' : 'No tickets in this filter yet.'}
        </p>
      ) : (
        <div className="ury-orders-list">
          {list.map((t) => {
            const totals = calcTotals(t.items);
            return (
              <article key={t.id} className={`ury-order-row status-${t.status === 'Paid' ? 'paid' : 'live'}`}>
                <div className="ury-order-main">
                  <strong>#{t.number}</strong>
                  <span>{t.openedAt}{t.paidAt ? ` → paid ${t.paidAt}` : ''}</span>
                  <span>{t.type} · {t.table}</span>
                  <em>{t.status}</em>
                  <b>{money(totals.total)}</b>
                </div>
                {(t.customerName || t.customerPhone || t.deliveryAddress || t.deliveryPayMode) && (
                  <div className="ury-order-lines" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    {t.customerName ? <span><b>{t.customerName}</b></span> : null}
                    {t.customerPhone ? <span>{t.customerPhone}</span> : null}
                    {t.deliveryAddress ? <span>{t.deliveryAddress}</span> : null}
                    {t.deliveryPayMode ? <span>Pay: {t.deliveryPayMode}</span> : null}
                  </div>
                )}
                <div className="ury-order-lines">
                  {t.items.map((l) => (
                    <span key={l.menuItem.id}>{l.quantity}× {l.menuItem.name}</span>
                  ))}
                </div>
                <div className="ury-order-actions">
                  <button type="button" className="ury-ghost" onClick={() => onOpen(t)}>Open</button>
                  <button type="button" className="ury-ghost" onClick={() => onPrintGuest(t)}>
                    <Printer size={13} /> Guest
                  </button>
                  {canPrintKitchen && t.status !== 'Open' && t.status !== 'Paid' && (
                    <button type="button" className="ury-ghost" onClick={() => onPrintKitchen(t)}>
                      <Printer size={13} /> Kitchen
                    </button>
                  )}
                  {canCollectPay && onCollectPay && isDeliveryReady(t) && (
                    <button type="button" className="ury-submit" onClick={() => onCollectPay(t)}>
                      Collect payment
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
