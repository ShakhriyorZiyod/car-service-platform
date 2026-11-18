import type { AdminRoutes } from '../../../http/contexts';
import type { AuditService } from '../app/audit';

export const auditAdminRoutes = (audit: AuditService): Pick<AdminRoutes, 'admin.auditLog'> => ({
  'admin.auditLog': ({ query }, { actor }) => audit.list(actor, query),
});
