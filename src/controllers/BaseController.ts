import { FastifyReply } from 'fastify';

/**
 * Base Controller providing unified response handling and error management.
 */
export abstract class BaseController {
  
  /**
   * Helper for successful JSON responses
   */
  protected handleSuccess<T>(res: FastifyReply, data: T, statusCode: number = 200): void {
    res.code(statusCode).send(data);
  }

  /**
   * Centralized error handler for controllers
   * Integrates with Sentry (todo: implement Sentry)
   */
  protected handleError(error: any, res: FastifyReply, context: string): void {
    // Log error for debugging
    console.error(`[${context}] Error:`, error);

    // In a real production app, we would send this to Sentry:
    // Sentry.captureException(error, { extra: { context } });

    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';

    res.code(statusCode).send({
      status: 'error',
      message,
      context: process.env.NODE_ENV === 'development' ? context : undefined,
    });
  }
}
