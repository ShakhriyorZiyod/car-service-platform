/** The audit module: who changed what (docs/PLAN.md, sections 4.2 and 7.3). */
export { createAuditService, type AuditRecord, type AuditService } from './app/audit';
export { auditAdminRoutes } from './http/routes';
