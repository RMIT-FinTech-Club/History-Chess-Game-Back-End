import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import UsersService from "../services/users.service";
import { ProfileRequest, GetUserByUsernameRequest, UpdatePasswordRequest, UpdateProfileRequest } from "../routes/users.router";
import { postgresPrisma } from "../configs/prismaClient";

interface RegisterRequest {
  Body: { username: string; email: string; password: string };
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

export default class UsersController {
  private usersService: UsersService;

  constructor(fastify: FastifyInstance) {
    this.usersService = new UsersService(fastify);
  }

  async register(
    request: FastifyRequest<RegisterRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { username, email, password } = request.body;
      const { token, data } = await this.usersService.register(
        username,
        password,
        email
      );
      reply.status(201).send({ token, user: data });
    } catch (error: any) {
      reply.status(400).send({ message: error.message });
    }
  }

  async login(
    request: FastifyRequest<LoginRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { identifier, password } = request.body;
      const { token, data } = await this.usersService.login(identifier, password);
      reply.status(200).send({ token, user: data });
    } catch (error: any) {
      reply.status(400).send({ message: error.message });
    }
  }

  async requestPasswordReset(
    request: FastifyRequest<RequestPasswordReset>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { email } = request.body;
      await this.usersService.requestPasswordReset(email);
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
      const { token } = await this.usersService.resetPassword(
        email,
        resetCode,
        newPassword
      );
      const user = await this.usersService.getUserByEmail(email);
      reply.status(200).send({ token, user });
    } catch (error: any) {
      reply.status(400).send({ message: error.message });
    }
  }

  async getProfile(
    request: FastifyRequest<ProfileRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { username } = request.user!;
      const user = await this.usersService.getUser(username);
      reply.status(200).send({ user });
    } catch (error: any) {
      reply.status(404).send({ message: error.message });
    }
  }

  async getUserByUsername(
    request: FastifyRequest<GetUserByUsernameRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { username } = request.params;
      const user = await this.usersService.getUser(username);
      reply.status(200).send({ user });
    } catch (error: any) {
      reply.status(404).send({ message: error.message });
    }
  }

  async updatePassword(
    request: FastifyRequest<UpdatePasswordRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { oldPassword, newPassword } = request.body;
      const { id } = request.user!;
      await this.usersService.updatePassword(id, oldPassword, newPassword);
      reply.status(200).send({ message: "Password updated successfully" });
    } catch (error: any) {
      reply.status(400).send({ message: error.message });
    }
  }

  async updateProfile(
    request: FastifyRequest<UpdateProfileRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { id } = request.user!;
      const updates: { username?: string; avatarUrl?: string } = {};

      // Process multipart form data
      const fields = await new Promise<{ username?: string; avatarUrl?: any }>((resolve, reject) => {
        const data: { username?: string; avatarUrl?: any } = {};
        request.multipart(
          (field, file, filename, encoding, mimetype) => {
            if (field === 'username') {
              let value = '';
              file.on('data', (chunk) => (value += chunk.toString()));
              file.on('end', () => {
                data.username = value;
              });
            } else if (field === 'avatarUrl' && filename) {
              // Simulate AWS S3 upload
              data.avatarUrl = { filename, mimetype };
            }
          },
          (err) => {
            if (err) reject(err);
            else resolve(data);
          }
        );
      });

      if (fields.username) {
        updates.username = fields.username;
      }
      if (fields.avatarUrl) {
        updates.avatarUrl = `https://s3.amazonaws.com/your-bucket/${fields.avatarUrl.filename}`;
      }

      await this.usersService.updateProfile(id, updates);
      const updatedUser = await postgresPrisma.users.findUnique({ where: { id } });
      reply.status(200).send({ 
        message: "Profile updated successfully",
        user: {
          id: updatedUser!.id,
          username: updatedUser!.username,
          email: updatedUser!.email,
          avatarUrl: updatedUser!.avatarUrl,
          language: updatedUser!.language,
          createdAt: updatedUser!.createdAt,
          updatedAt: updatedUser!.updatedAt,
        }
      });
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
      const result = await this.usersService.googleCallback(code, state);
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
      const { token, data } = await this.usersService.completeGoogleLogin(tempToken, username);
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
      const result = await this.usersService.checkAuthType(email);
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
      await this.usersService.verifyResetCode(email, resetCode);
      reply.status(200).send({ message: "Verification code is valid" });
    } catch (error: any) {
      reply.status(400).send({ message: error.message });
    }
  }
}