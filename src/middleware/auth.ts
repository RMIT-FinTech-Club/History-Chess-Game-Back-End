import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

// Define JWT payload interface
interface UserPayload {
	id: string;
	username: string;
	googleAuth: boolean;
}

// Extend FastifyRequest with custom authUser property
declare module 'fastify' {
	interface FastifyRequest {
		authUser?: UserPayload;
	}
}

// Authentication: Verify JWT and set request.authUser
// export async function authenticate(
//   request: FastifyRequest,
//   reply: FastifyReply
// ): Promise<void> {
//   const authHeader = request.headers.authorization;
//   console.log(`Authorization header: ${authHeader}`);
//   if (!authHeader || !authHeader.startsWith('Bearer ')) {
//     request.log.warn(`Missing or invalid Authorization header: ${authHeader}`);
//     reply.status(401).send({ message: 'Missing or invalid Authorization header' });
//     return;
//   }

//   const token = authHeader.replace('Bearer ', '');
//   const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

//   try {
//     const decoded = jwt.verify(token, jwtSecret) as UserPayload;
//     request.log.info(`Token verified: userId=${decoded.id}, username=${decoded.username}`);
//     request.authUser = decoded;
//   } catch (error: unknown) {
//     const errorMessage = error instanceof Error ? error.message : 'Unknown error';
//     request.log.warn(`Token verification failed: ${errorMessage}, token=${token}`);
//     reply.status(401).send({ message: 'Invalid or expired token' });
//   }
// }

export async function authenticate(
	request: FastifyRequest,
	reply: FastifyReply
): Promise<void> {
	const authHeader = request.headers.authorization;

	// Log only the presence of the header, not its contents for security
	console.log(`Authorization header present: ${authHeader}`);

	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		request.log.warn(`Missing or invalid Authorization header format`);
		reply.status(401).send({
			message: 'Missing or invalid Authorization header',
			details: 'Header must be in format: "Bearer your-token-here"'
		});
		return;
	}

	const token = authHeader.replace('Bearer ', '');
	const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

	try {
		// Use token, not authHeader for verification
		const decoded = jwt.verify(token, jwtSecret) as UserPayload;
		request.log.info(`Token verified successfully for user: ${decoded.username}`);
		request.authUser = decoded;
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';

		// More descriptive error based on type
		let detailedError = 'Token validation failed';
		if (error instanceof jwt.TokenExpiredError) {
			detailedError = `Token expired at ${(error as jwt.TokenExpiredError).expiredAt}`;
		} else if (error instanceof jwt.JsonWebTokenError) {
			detailedError = 'Invalid token format or signature';
		}

		request.log.warn(`Token verification failed: ${errorMessage}`);

		// Send detailed error response
		reply.status(401).send({
			message: 'Invalid or expired token',
			error: detailedError,
			errorType: error instanceof Error ? error.name : 'Unknown'
		});
	}
}

// Authorization: Check if user is authorized to access resource
export async function authorize(
	request: FastifyRequest,
	reply: FastifyReply
): Promise<void> {
	const userIdParam = (request.params as { id?: string }).id;
	if (userIdParam && request.authUser && request.authUser.id !== userIdParam) {
		request.log.warn(`Unauthorized access attempt: userId=${request.authUser.id}, requestedId=${userIdParam}`);
		reply.status(403).send({ message: 'You are not authorized to access this resource' });
		return;
	}
}