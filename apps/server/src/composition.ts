/**
 * Wires the modules together (docs/PLAN.md, section 4.5). Each module gets exactly the services
 * it depends on; there is no container and no global state.
 */
import type { Db } from './db/client';
import type { Logger } from './logger';
import type { ScheduledTask } from './platform/ports';
import { createAuditService, type AuditService } from './modules/audit';
import {
  createBookingService,
  createScheduleService,
  type BookingService,
  type ScheduleService,
} from './modules/booking';
import { createCatalogService, type CatalogService } from './modules/catalog';
import { createClients, type ClientsService } from './modules/clients';
import { createGarage, type GarageService } from './modules/garage';
import {
  createIdentityService,
  createStaffDirectory,
  type IdentityService,
  type LoginCodeSender,
} from './modules/identity';
import {
  createOrders,
  type AdminOrdersService,
  type ExtrasService,
  type OrdersService,
} from './modules/orders';
import { createWorkshopService, type WorkshopService } from './modules/workshop';
import { createDashboard, type DashboardService } from './modules/dashboard';
import {
  createManualFiscalProvider,
  createPayments,
  type FiscalProvider,
  type PaymentsService,
} from './modules/payments';
import { createMedia, type MediaService } from './modules/media';
import { createReception, type ReceptionService } from './modules/reception';
import { createShop, type ShopService } from './modules/shop';
import { createStock, type StockService } from './modules/stock';
import { createTasks, type TasksService } from './modules/tasks';
import type { Clock } from './platform/clock';
import type { FileStore } from './platform/ports';
import { createOutbox } from './platform/outbox';

export interface ServicesDeps {
  db: Db;
  clock: Clock;
  logger: Logger;
  botToken: string;
  /** How old Mini App init data may be (TZ 15.2: a day). */
  initDataMaxAgeSeconds: number;
  adminUrl: string | null;
  loginCodes: LoginCodeSender;
  /** Where the photos' files lie, and the secret that signs their links. */
  files: FileStore;
  mediaSecret: string;
  /** Issues fiscal receipts; the manual one (the admin types the number) when left out. */
  fiscal?: FiscalProvider;
}

export interface Services {
  audit: AuditService;
  workshop: WorkshopService;
  catalog: CatalogService;
  identity: IdentityService;
  garage: GarageService;
  booking: BookingService;
  orders: OrdersService;
  adminOrders: AdminOrdersService;
  extras: ExtrasService;
  clients: ClientsService;
  schedule: ScheduleService;
  media: MediaService;
  reception: ReceptionService;
  /** The masters' tasks (not to be mixed up with `tasks`, the timer jobs below). */
  taskService: TasksService;
  payments: PaymentsService;
  dashboard: DashboardService;
  /** The warehouse (stage 8). */
  stock: StockService;
  /** The shop (stage 9). */
  shop: ShopService;
  /** What the system does by itself on a timer (jobs/scheduler.ts). */
  tasks: ScheduledTask[];
}

export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

export function createServices(deps: ServicesDeps): Services {
  const platform = { db: deps.db, clock: deps.clock, logger: deps.logger };
  const audit = createAuditService(platform);
  const workshop = createWorkshopService({ ...platform, audit });
  const catalog = createCatalogService({ ...platform, audit });
  const outbox = createOutbox({ clock: deps.clock });
  const media = createMedia({ ...platform, files: deps.files, secret: deps.mediaSecret });
  const identity = createIdentityService({
    ...platform,
    audit,
    workshop,
    outbox,
    loginCodes: deps.loginCodes,
    botToken: deps.botToken,
    initDataMaxAgeSeconds: deps.initDataMaxAgeSeconds,
    adminUrl: deps.adminUrl,
  });
  const garage = createGarage({ ...platform, audit });
  const booking = createBookingService({ ...platform, workshop });
  const staff = createStaffDirectory();
  const orders = createOrders({
    ...platform,
    workshop,
    catalog: catalog.offers,
    garage,
    booking,
    outbox,
    staff,
    audit,
  });
  const taskService = createTasks({
    ...platform,
    audit,
    outbox,
    media,
    orders: orders.admin,
    staff,
  });
  const payments = createPayments({
    ...platform,
    audit,
    workshop,
    orders: orders.admin,
    tasks: taskService,
    fiscal: deps.fiscal ?? createManualFiscalProvider(),
  });
  const stock = createStock({ ...platform, audit, media, outbox, staff, workshop });
  const shop = createShop({
    ...platform,
    audit,
    outbox,
    staff,
    workshop,
    stock: stock.shop,
    payments,
  });
  return {
    audit,
    workshop,
    catalog,
    identity,
    garage,
    booking,
    orders: orders.service,
    adminOrders: orders.admin,
    extras: orders.extras,
    clients: createClients({
      ...platform,
      audit,
      identity: identity.clients,
      garage,
      orders: orders.admin,
    }),
    schedule: createScheduleService({ ...platform, workshop, audit }),
    media,
    taskService,
    payments,
    dashboard: createDashboard({
      clock: deps.clock,
      orders: orders.admin,
      tasks: taskService,
      payments,
      stock: stock.levels,
      shop,
    }),
    reception: createReception({
      ...platform,
      audit,
      outbox,
      media,
      orders: orders.admin,
    }),
    stock,
    shop,
    tasks: [...orders.tasks, ...stock.levels.tasks, ...shop.tasks],
  };
}
