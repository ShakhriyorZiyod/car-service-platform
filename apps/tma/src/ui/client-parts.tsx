import type { Order, ShopOrder } from '@cs/shared';
import { formatDateLong, formatMoney, formatPlate } from '@cs/shared/format';
import type { OrderStatus, ShopOrderStatus } from '@cs/shared/vocabulary';
import { ChevronLeft, ShoppingBag } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLang, useT } from '../i18n';
import { pick } from '../lib/client-data';
import { hasNativeBack } from '../telegram';

/** Small pieces the client's screens share (DESIGN 5). Tokens only; both themes. */

/** Title, with a back arrow of our own only where Telegram has no back button. */
export function ScreenHeader({
  title,
  onBack,
  aside,
}: {
  title: string;
  onBack?: (() => void) | undefined;
  aside?: ReactNode;
}) {
  const t = useT().client.common;
  return (
    <header className="screen-header">
      {onBack && !hasNativeBack() && (
        <button type="button" className="screen-header__back" onClick={onBack} aria-label={t.back}>
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
      )}
      <h1 className="title screen-header__title">{title}</h1>
      {aside && <div className="screen-header__aside">{aside}</div>}
    </header>
  );
}

/** Sticks to the bottom: a summary above and the main action under it. */
export function BottomBar({ summary, children }: { summary?: ReactNode; children: ReactNode }) {
  return (
    <div className="bottom-bar">
      {summary && <div className="bottom-bar__summary">{summary}</div>}
      {children}
    </div>
  );
}

const TONE: Record<OrderStatus, string> = {
  new: 'info',
  confirmed: 'teal',
  in_work: 'warning',
  ready_for_pickup: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  no_show: 'danger',
};

/** A status in words, a dot and a colour: never colour alone (TZ 15.7). */
export function StatusChip({ status }: { status: OrderStatus }) {
  const t = useT().client.status;
  return (
    <span className={`status-chip status-chip--${TONE[status]}`}>
      <span className="status-chip__dot" aria-hidden="true" />
      {t[status]}
    </span>
  );
}

/** A number plate: white in both themes, region and number apart (DESIGN 2.4). */
export function PlateChip({ plate }: { plate: string }) {
  const { region, number } = formatPlate(plate);
  return (
    <span className="plate">
      <span className="plate__region">{region}</span>
      <span className="plate__number">{number}</span>
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        {icon}
      </span>
      <h2 className="title">{title}</h2>
      {text && <p className="secondary">{text}</p>}
      {action}
    </div>
  );
}

/** What a screen shows while it waits: a few grey blocks, not a spinner (client PDF, page 20). */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_unused, index) => (
        <div key={index} className="skeleton__row" />
      ))}
    </div>
  );
}

/** The order card of T1 and T9: number, status, car, time, works and the total. */
export function OrderCard({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const t = useT().client;
  const lang = useLang();
  return (
    <button type="button" className="card order-card" onClick={onOpen}>
      <span className="order-card__top">
        <span className="num">{t.orders.number(order.number)}</span>
        <StatusChip status={order.status} />
      </span>
      <span className="order-card__works">
        {order.items.map((item) => pick(lang, { uz: item.nameUz, ru: item.nameRu })).join(', ')}
      </span>
      <span className="secondary">
        {formatDateLong(order.startsAt.date, lang)}, {order.startsAt.time} · {order.car.label}
      </span>
      <span className="order-card__bottom">
        <PlateChip plate={order.car.plate} />
        <span className="num">{formatMoney(order.total, lang)}</span>
      </span>
    </button>
  );
}

const SHOP_TONE: Record<ShopOrderStatus, string> = {
  new: 'info',
  confirmed: 'teal',
  ready_for_pickup: 'success',
  completed: 'neutral',
  cancelled: 'danger',
};

export function ShopStatusChip({ status }: { status: ShopOrderStatus }) {
  const t = useT().client.shop.status;
  return (
    <span className={`status-chip status-chip--${SHOP_TONE[status]}`}>
      <span className="status-chip__dot" aria-hidden="true" />
      {t[status]}
    </span>
  );
}

/** A shop order among the service orders of T9: its number, what is in it and the total. */
export function ShopOrderCard({ order, onOpen }: { order: ShopOrder; onOpen: () => void }) {
  const t = useT().client;
  const lang = useLang();
  return (
    <button type="button" className="card order-card" onClick={onOpen}>
      <span className="order-card__top">
        <span className="order-card__kind">
          <ShoppingBag size={16} aria-hidden="true" />
          <span className="num">{t.orders.number(order.number)}</span>
          <span className="secondary">{t.shop.kind}</span>
        </span>
        <ShopStatusChip status={order.status} />
      </span>
      <span className="order-card__works">
        {order.items
          .map((item) => `${pick(lang, { uz: item.nameUz, ru: item.nameRu })} × ${item.qty}`)
          .join(', ')}
      </span>
      <span className="order-card__bottom">
        <span className="secondary">{formatDateLong(order.createdAt.date, lang)}</span>
        <span className="num">{formatMoney(order.total, lang)}</span>
      </span>
    </button>
  );
}
