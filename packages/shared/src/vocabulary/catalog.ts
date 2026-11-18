/**
 * Words of the workshop's reference data: body classes, zone groups, who may pick a cancel reason
 * (docs/PLAN.md, sections 7.5 and 10). The database enums repeat these values.
 */

/** The price depends on the car's body class (TZ 14.1): S, M, L, XL. */
export const BODY_CLASSES = ['S', 'M', 'L', 'XL'] as const;
export type BodyClass = (typeof BODY_CLASSES)[number];

/** How zones are grouped on screen. */
export const SERVICE_GROUPS = ['body', 'glass', 'interior', 'other'] as const;
export type ServiceGroup = (typeof SERVICE_GROUPS)[number];

/**
 * Who may choose a cancel reason: `client` ones the client and the staff, `staff` ones only the
 * staff, `system` ones only the system itself.
 */
export const CANCEL_REASON_AUDIENCES = ['client', 'staff', 'system'] as const;
export type CancelReasonAudience = (typeof CANCEL_REASON_AUDIENCES)[number];

/** Days of the week as the database stores them: 1 = Monday … 7 = Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
