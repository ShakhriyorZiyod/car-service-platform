import type { FastifyInstance } from 'fastify';
import type { Logger } from '../logger';

export interface HttpServer {
  close(): Promise<void>;
}

export async function startHttpServer(
  app: FastifyInstance,
  options: { host: string; port: number },
  logger: Logger,
): Promise<HttpServer> {
  await app.listen({ host: options.host, port: options.port });
  logger.info({ host: options.host, port: options.port }, 'http server listening');
  return { close: () => app.close() };
}
