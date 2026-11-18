/**
 * The booking module (docs/PLAN.md, sections 4.2, 7.7 and 10): free times for a job and holding
 * a box for an order. The rules of the times are pure (`domain/slots.ts`); a box is never held
 * twice because the database says so.
 */
export {
  createBookingService,
  type BookingService,
  type BookingServiceDeps,
  type JobSpec,
  type Reservation,
  type ReserveInput,
} from './app/booking';
export {
  createScheduleService,
  type NewBlock,
  type ScheduleService,
  type ScheduleServiceDeps,
} from './app/schedule';
export type { DayAvailability, Slot } from './domain/slots';
