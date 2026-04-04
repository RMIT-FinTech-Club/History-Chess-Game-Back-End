import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Wrapper for async Fastify route handlers to ensure all errors are caught.
 * Note: Fastify natively handles async errors, but this pattern is used
 * for explicit error boundary management as per guidelines.
 */
export const asyncErrorWrapper = (
  fn: (req: FastifyRequest, res: FastifyReply) => Promise<any>
) => {
  return async (req: FastifyRequest, res: FastifyReply) => {
    try {
      return await fn(req, res);
    } catch (error) {
      // Pass the error to Fastify's error handler
      throw error;
    }
  };
};
