import type { Bootstrap } from '@cs/shared';
import { formatDateLong } from '@cs/shared/format';
import { Car, CheckCircle2, ClipboardList, Home, ShoppingBag, User } from 'lucide-react';
import { lazy, Suspense, useCallback, useState } from 'react';
import { useLang, useT } from '../../i18n';
import { useBack } from '../../lib/back';
import { useOrder } from '../../lib/client-data';
import { useOnline } from '../../lib/online';
import { Button } from '../../ui/Button';
import { BottomBar, EmptyState, Skeleton } from '../../ui/client-parts';
import { BookingFlow } from './booking/BookingFlow';
import { CarForm } from './garage/CarForm';
import { GarageScreen } from './garage/GarageScreen';
import { HomeScreen } from './home/HomeScreen';
import { OrderDetail } from './orders/OrderDetail';
import { OrdersScreen } from './orders/OrdersScreen';
import { ProfileScreen } from './profile/ProfileScreen';
import '../../styles/client.css';

// The shop is its own chunk (docs/PLAN.md, stage 9): loaded only when the client opens it.
const ShopTab = lazy(() => import('./shop/ShopTab'));
const ShopOrderDetail = lazy(() => import('./shop/ShopOrderDetail'));

type Tab = 'home' | 'garage' | 'shop' | 'orders' | 'profile';

/** What is on top of the tabs: a booking, a car form, an order, or the "sent" confirmation. */
type Flow =
  | { kind: 'booking' }
  | { kind: 'car'; carId?: string }
  | { kind: 'order'; orderId: string }
  | { kind: 'shopOrder'; shopOrderId: string }
  | { kind: 'sent'; orderId: string };

/**
 * A link from a bot message opens its order: `?order=<id>`, or `?shopOrder=<id>` for the shop
 * (docs/PLAN.md, section 4.7).
 */
const linkedOrder = (): Flow | null => {
  const search = new URLSearchParams(location.search);
  const shopOrderId = search.get('shopOrder');
  if (shopOrderId) return { kind: 'shopOrder', shopOrderId };
  const id = search.get('order');
  return id ? { kind: 'order', orderId: id } : null;
};

/** The client's app: home, garage, shop, orders and profile (docs/PLAN.md, stages 3 and 9). */
export default function ClientShell({ bootstrap }: { bootstrap: Bootstrap }) {
  const t = useT().client;
  const [tab, setTab] = useState<Tab>('home');
  const [flow, setFlow] = useState<Flow | null>(linkedOrder);
  const online = useOnline();

  const close = useCallback(() => setFlow(null), []);
  const toHome = useCallback(() => setTab('home'), []);
  const toOrders = useCallback(() => setTab('orders'), []);
  // The booking and the shop handle their own steps; every other screen on top of the tabs goes
  // back to them, and another tab goes back to "Bosh". Telegram closes the app on "back" only when
  // its button is hidden, which is on "Bosh" alone (Android's system "back" included).
  useBack(
    flow
      ? flow.kind !== 'booking'
        ? close
        : null
      : tab !== 'home' && tab !== 'shop'
        ? toHome
        : null,
  );

  if (flow?.kind === 'booking') {
    return (
      <BookingFlow
        onExit={close}
        onAddCar={() => setFlow({ kind: 'car' })}
        onSent={(orderId) => setFlow({ kind: 'sent', orderId })}
      />
    );
  }
  if (flow?.kind === 'car') {
    return <CarForm carId={flow.carId} onBack={close} onDone={close} />;
  }
  if (flow?.kind === 'order') {
    return (
      <OrderDetail
        orderId={flow.orderId}
        onBack={close}
        onBook={() => setFlow({ kind: 'booking' })}
      />
    );
  }
  if (flow?.kind === 'shopOrder') {
    return (
      <Suspense fallback={<Skeleton />}>
        <ShopOrderDetail shopOrderId={flow.shopOrderId} onBack={close} />
      </Suspense>
    );
  }
  if (flow?.kind === 'sent') {
    return (
      <SentScreen
        orderId={flow.orderId}
        onOrders={() => {
          setTab('orders');
          close();
        }}
        onHome={() => {
          setTab('home');
          close();
        }}
      />
    );
  }

  const tabs = [
    { key: 'home', label: t.tabs.home, icon: <Home size={22} aria-hidden="true" /> },
    { key: 'garage', label: t.tabs.garage, icon: <Car size={22} aria-hidden="true" /> },
    { key: 'shop', label: t.tabs.shop, icon: <ShoppingBag size={22} aria-hidden="true" /> },
    { key: 'orders', label: t.tabs.orders, icon: <ClipboardList size={22} aria-hidden="true" /> },
    { key: 'profile', label: t.tabs.profile, icon: <User size={22} aria-hidden="true" /> },
  ] as const;

  const tabBar = (
    <nav className="tab-bar">
      {tabs.map((item) => (
        <button
          key={item.key}
          type="button"
          className={item.key === tab ? 'tab-bar__item is-active' : 'tab-bar__item'}
          aria-current={item.key === tab ? 'page' : undefined}
          onClick={() => setTab(item.key)}
        >
          {item.icon}
          <span className="caption">{item.label}</span>
        </button>
      ))}
    </nav>
  );

  const offline = !online && (
    <p className="offline-banner" role="status">
      {t.common.offline}
    </p>
  );

  // The shop draws its own screens and puts the tab bar under the catalog itself.
  if (tab === 'shop') {
    return (
      <>
        {offline}
        <Suspense fallback={<Skeleton />}>
          <ShopTab tabBar={tabBar} onExit={toHome} onOrders={toOrders} />
        </Suspense>
      </>
    );
  }

  return (
    <div className="client">
      {offline}
      {tab === 'home' && (
        <HomeScreen
          bootstrap={bootstrap}
          onBook={() => setFlow({ kind: 'booking' })}
          onAddCar={() => setFlow({ kind: 'car' })}
          onOpenOrder={(orderId) => setFlow({ kind: 'order', orderId })}
          onShop={() => setTab('shop')}
        />
      )}
      {tab === 'garage' && (
        <GarageScreen
          onAdd={() => setFlow({ kind: 'car' })}
          onEdit={(carId) => setFlow({ kind: 'car', carId })}
        />
      )}
      {tab === 'orders' && (
        <OrdersScreen
          onOpen={(orderId) => setFlow({ kind: 'order', orderId })}
          onOpenShop={(shopOrderId) => setFlow({ kind: 'shopOrder', shopOrderId })}
        />
      )}
      {tab === 'profile' && <ProfileScreen bootstrap={bootstrap} />}

      <BottomBar>{tabBar}</BottomBar>
    </div>
  );
}

/** T8: the request was sent (client PDF, page 9). */
function SentScreen({
  orderId,
  onOrders,
  onHome,
}: {
  orderId: string;
  onOrders: () => void;
  onHome: () => void;
}) {
  const t = useT().client;
  const lang = useLang();
  const order = useOrder(orderId);
  return (
    <section className="screen">
      <EmptyState
        icon={<CheckCircle2 size={28} />}
        title={t.booking.sentTitle}
        text={
          order.data
            ? `${t.booking.sentText(order.data.number)} ${formatDateLong(order.data.startsAt.date, lang)}, ${order.data.startsAt.time}. ${t.booking.sentHold}`
            : t.booking.sentHold
        }
        action={
          <>
            <Button onClick={onOrders}>{t.booking.myOrders}</Button>
            <Button variant="secondary" onClick={onHome}>
              {t.booking.toHome}
            </Button>
          </>
        }
      />
    </section>
  );
}
