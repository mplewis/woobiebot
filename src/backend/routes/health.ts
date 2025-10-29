import type { FastifyInstance } from "fastify";

/**
 * Register health check route.
 */
export function registerHealthRoutes(app: FastifyInstance): void {
  /**
   * GET /health
   * Health check endpoint.
   */
  app.get("/health", async (_request, reply) => {
    return reply.send({ status: "ok", timestamp: Date.now() });
  });
}
