import { FastifyInstance, FastifyRequest, FastifyReply, RouteGenericInterface } from "fastify";
import { UserService, CreateUserInput, UpdateUserInput, UpdateProfileInput } from "../services/user.service";
import { uploadController } from "../controllers/upload.controller";

interface IdParams {
  id: string;
}

interface AuthenticatedProfileRequest {
  Body: UpdateProfileInput;
}

interface QueryParams {
  limit?: number;
  offset?: number;
}

interface RegisterRequest {
  Body: CreateUserInput;
}

interface LoginRequest {
  Body: { identifier: string; password: string };
}

interface RequestPasswordReset {
  Body: { email: string };
}

interface ResetPasswordRequest {
  Body: { email: string; resetCode: string; newPassword: string };
}

interface UpdatePasswordRequest {
  Body: { oldPassword: string; newPassword: string };
}

interface GoogleCallbackRequest {
  Querystring: { code: string; state: string };
}

interface CompleteGoogleLoginRequest {
  Body: { tempToken: string; username: string };
}

interface CheckAuthTypeRequest {
  Body: { email: string };
}

interface VerifyResetCodeRequest {
  Body: { email: string; resetCode: string };
}

interface ProfileRequest extends RouteGenericInterface {
  Headers: { authorization?: string };
  user?: { id: string; username: string; googleAuth: boolean };
}

interface UpdateProfileRequest {
  Params: IdParams;
  Body: UpdateProfileInput;
}

export default class UserController {
  private userService: UserService;

  constructor(fastify: FastifyInstance) {
    this.userService = new UserService(fastify);
  }

  async createUser(
    request: FastifyRequest<RegisterRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const user = await this.userService.createUser(request.body);
      reply.status(201).send(user);
    } catch (error: any) {
      request.log.error(error);
      if (error.message.includes('username')) {
        reply.status(409).send({ message: 'This username is already taken (case-insensitive). Please choose a different username.' });
      } else if (error.message.includes('email')) {
        reply.status(409).send({ message: 'This email is already registered. Please use a different email.' });
      } else {
        reply.status(500).send({ message: 'Internal server error' });
      }
    }
  }

  async getUserById(
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ): Promise<void> {
    const { id } = request.params;
    const user = await this.userService.getUserById(id);

    if (!user) {
      reply.status(404).send({ message: 'User not found' });
    } else {
      reply.status(200).send(user);
    }
  }

  async getAllUsers(
    request: FastifyRequest<{ Querystring: QueryParams }>,
    reply: FastifyReply
  ): Promise<void> {
    const limit = request.query.limit || 10;
    const offset = request.query.offset || 0;

    const result = await this.userService.getAllUsers(limit, offset);
    reply.status(200).send(result);
  }

  async getProfile(
    request: FastifyRequest<ProfileRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const userId = (request as any).user?.id;

      if (!userId) {
        reply.status(401).send({ message: 'Authentication required' });
        return;
      }

      const user = await this.userService.getUserById(userId);

      if (!user) {
        reply.status(404).send({ message: 'User not found' });
        return;
      }

      reply.status(200).send({ user });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ message: 'Internal server error' });
    }
  }

  async updateUser(
    request: FastifyRequest<{ Params: IdParams; Body: UpdateUserInput }>,
    reply: FastifyReply
  ): Promise<void> {
    const { id } = request.params;

    try {
      const updatedUser = await this.userService.updateUser(id, request.body);

      if (!updatedUser) {
        reply.status(404).send({ message: 'User not found' });
        return;
      }

      reply.status(200).send(updatedUser);
    } catch (error: any) {
      request.log.error(error);
      if (error.message.includes('username')) {
        reply.status(409).send({ message: 'This username is already taken (case-insensitive). Please choose a different username.' });
      } else if (error.message.includes('email')) {
        reply.status(409).send({ message: 'This email is already registered. Please use a different email.' });
      } else {
        reply.status(500).send({ message: 'Internal server error' });
      }
    }
  }

  async updateProfile(
    request: FastifyRequest<UpdateProfileRequest>,
    reply: FastifyReply
  ): Promise<void> {
    const { id } = request.params;
    const { username, avatarUrl } = request.body;

    try {
      const updatedUser = await this.userService.updateProfile(id, { username, avatarUrl });

      if (!updatedUser) {
        reply.status(404).send({ message: 'User not found' });
        return;
      }

      reply.status(200).send(updatedUser);
    } catch (error: any) {
      request.log.error(error);
      if (error.message.includes('Username already taken')) {
        reply.status(409).send({ message: 'This username already exists, please choose another username.' });
      } else {
        reply.status(500).send({ message: 'Internal server error' });
      }
    }
  }

  async deleteUser(
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ): Promise<void> {
    const { id } = request.params;
    const deleted = await this.userService.deleteUser(id);

    if (!deleted) {
      reply.status(404).send({ message: 'User not found' });
    } else {
      reply.status(200).send({ message: 'User deleted successfully' });
    }
  }

  async login(
    request: FastifyRequest<LoginRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { identifier, password } = request.body;
      const { token, data } = await this.userService.login(identifier, password);
      reply.status(200).send({ token, user: data });
    } catch (error: any) {
      reply.status(401).send({ message: error.message });
    }
  }

  async requestPasswordReset(
    request: FastifyRequest<RequestPasswordReset>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { email } = request.body;
      await this.userService.requestPasswordReset(email);
      reply.status(200).send({ message: "Verification code sent successfully" });
    } catch (error: any) {
      reply.status(400).send({ message: error.message });
    }
  }

  async resetPassword(
    request: FastifyRequest<ResetPasswordRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { email, resetCode, newPassword } = request.body;
      const { token } = await this.userService.resetPassword(email, resetCode, newPassword);
      const user = await this.userService.getUserByEmail(email);
      if (!user) {
        reply.status(404).send({ message: 'User not found' });
        return;
      }
      reply.status(200).send({ token, user });
    } catch (error: any) {
      reply.status(400).send({ message: error.message });
    }
  }

  async updatePassword(
    request: FastifyRequest<UpdatePasswordRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { oldPassword, newPassword } = request.body;
      const { id } = (request as any).user!;
      await this.userService.updatePassword(id, oldPassword, newPassword);
      reply.status(200).send({ message: "Password updated successfully" });
    } catch (error: any) {
      reply.status(400).send({ message: error.message });
    }
  }

  async googleCallback(
    request: FastifyRequest<GoogleCallbackRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { code, state } = request.query;
      const result = await this.userService.googleCallback(code, state);
      if ('email' in result) {
        reply.type('text/html').send(`
          <script>
            window.opener.postMessage({
              type: 'google-auth-prompt-username',
              email: '${result.email}',
              tempToken: '${result.tempToken}'
            }, 'http://localhost:3000');
            window.close();
          </script>
        `);
      } else {
        reply.type('text/html').send(`
          <script>
            window.opener.postMessage({
              type: 'google-auth',
              token: '${result.token}',
              userId: '${result.data.id}',
              username: '${result.data.username}',
              email: '${result.data.email}',
              avatarUrl: '${result.data.avatarUrl || ''}'
            }, 'http://localhost:3000');
            window.close();
          </script>
        `);
      }
    } catch (error: any) {
      reply.type('text/html').send(`
        <script>
          window.opener.postMessage({
            type: 'google-auth-error',
            error: '${error.message}'
          }, 'http://localhost:3000');
          window.close();
        </script>
      `);
    }
  }

  async completeGoogleLogin(
    request: FastifyRequest<CompleteGoogleLoginRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { tempToken, username } = request.body;
      const { token, data } = await this.userService.completeGoogleLogin(tempToken, username);
      reply.status(200).send({ token, user: data });
    } catch (error: any) {
      reply.status(400).send({ message: error.message });
    }
  }

  async checkAuthType(
    request: FastifyRequest<CheckAuthTypeRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { email } = request.body;
      const result = await this.userService.checkAuthType(email);
      reply.status(200).send(result);
    } catch (error: any) {
      reply.status(400).send({ message: error.message });
    }
  }

  async verifyResetCode(
    request: FastifyRequest<VerifyResetCodeRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { email, resetCode } = request.body;
      await this.userService.verifyResetCode(email, resetCode);
      reply.status(200).send({ message: "Verification code is valid" });
    } catch (error: any) {
      reply.status(400).send({ message: error.message });
    }
  }

  async googleAuth(
    request: FastifyRequest<{ Querystring: { state: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { state } = request.query;
      const authUrl = await this.userService.googleAuth(state);
      reply.redirect(authUrl);
    } catch (error: any) {
      reply.status(500).send({ message: error.message });
    }
  }

  async updateAuthenticatedProfile(
  request: FastifyRequest,
  reply: FastifyReply
  ): Promise<void> {
    try {
      const userId = (request as any).user?.id;
      console.log('Extracted userId:', userId);

      if (!userId) {
        console.log('No userId found, returning 401');
        reply.status(401).send({ message: 'Authentication required' });
        return;
      }

      // Handle the case where request.body might be undefined or not an object
      const body = request.body as any;
      
      if (!body || typeof body !== 'object') {
        console.log('Invalid or missing request body:', body);
        reply.status(400).send({ message: 'Invalid request body' });
        return;
      }

      const { username, avatarUrl } = body;
      console.log('Extracted from body - username:', username, 'avatarUrl:', avatarUrl);

      // Check if at least one field is provided
      if (username === undefined && avatarUrl === undefined) {
        console.log('No valid fields provided in request');
        reply.status(400).send({ message: 'At least one field (username or avatarUrl) must be provided' });
        return;
      }

      // Create update object with only defined values
      const updateData: any = {};
      if (username !== undefined) updateData.username = username;
      if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
      
      console.log('Update data to send to service:', updateData);

      // Call the service to update the profile
      console.log('Calling userService.updateProfile...');
      const updatedUser = await this.userService.updateProfile(userId, updateData);
      console.log('Service response:', updatedUser);

      if (!updatedUser) {
        console.log('No updated user returned, sending 404');
        reply.status(404).send({ message: 'User not found' });
        return;
      }

      console.log('Sending success response');
      reply.status(200).send(updatedUser);
    } catch (error: any) {
      console.log('=== ERROR IN UPDATE PROFILE ===');
      console.log('Error:', error);
      console.log('Error message:', error.message);
      console.log('Error stack:', error.stack);
      request.log.error(error);
      
      if (error.message.includes('Username already taken')) {
        reply.status(409).send({ message: 'This username already exists, please choose another username.' });
      } else {
        reply.status(500).send({ message: 'Internal server error', error: error.message });
      }
    }
    }
}
