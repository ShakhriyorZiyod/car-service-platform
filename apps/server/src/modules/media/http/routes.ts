import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { MediaService } from '../app/media';

const params = z.object({ id: z.uuid() });
const query = z.object({ exp: z.coerce.number().int(), sig: z.string().min(1).max(100) });

/**
 * `GET /media/:id?exp=&sig=` (docs/PLAN.md, section 4.9): the photo, for whoever holds a link that
 * the server signed and that has not run out. A wrong or old link is a plain 404, so it does not
 * tell a guess from a missing photo.
 */
export function registerMediaRoute(app: FastifyInstance, media: MediaService): void {
  app.get('/media/:id', async (request, reply) => {
    const path = params.safeParse(request.params);
    const link = query.safeParse(request.query);
    const file =
      path.success && link.success
        ? await media.open(path.data.id, link.data.exp, link.data.sig)
        : null;
    if (!file) return reply.code(404).send({ error: { code: 'not_found' } });
    return (
      reply
        .header('content-type', file.mime)
        // Shown inline and never run: whatever the bytes are, the browser may not guess a type.
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'")
        // The link ends in 15 minutes; the person's own browser may keep the picture until then.
        .header('cache-control', 'private, max-age=600')
        .send(file.bytes)
    );
  });
}
