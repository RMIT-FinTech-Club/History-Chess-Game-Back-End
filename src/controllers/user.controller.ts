import { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from './BaseController';
import { UserService } from '../services/user.service';
import { loginSchema, signupSchema, updateProfileSchema } from '../validators/user.schema';
import { config } from '../configs/unifiedConfig';

export class UserController extends BaseController {
  constructor(private readonly userService: UserService) {
    super();
  }

  async login(req: FastifyRequest, res: FastifyReply) {
    try {
      const input = loginSchema.parse(req.body);
      const result = await this.userService.login(input.identifier, input.password, input.token);
      this.handleSuccess(res, result);
    } catch (error) {
      this.handleError(error, res, 'login');
    }
  }

  async signup(req: FastifyRequest, res: FastifyReply) {
    try {
      const input = signupSchema.parse(req.body);
      const result = await this.userService.createUser(input as any);
      this.handleSuccess(res, result, 201);
    } catch (error) {
      this.handleError(error, res, 'signup');
    }
  }

  async updateProfile(req: FastifyRequest, res: FastifyReply) {
    try {
      const input = updateProfileSchema.parse(req.body);
      const userId = (req.user as any)?.id;
      if (!userId) throw new Error('Unauthorized');
      
      const result = await this.userService.updateProfile(userId, input);
      this.handleSuccess(res, result);
    } catch (error) {
      this.handleError(error, res, 'updateProfile');
    }
  }

  async getMe(req: FastifyRequest, res: FastifyReply) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) throw new Error('Unauthorized');
      
      const result = await this.userService.getUserById(userId);
      this.handleSuccess(res, result);
    } catch (error) {
      this.handleError(error, res, 'getMe');
    }
  }

  async googleAuth(req: FastifyRequest, res: FastifyReply) {
    try {
      const { state } = req.query as { state: string };
      const url = await this.userService.googleAuth(state);
      res.redirect(url);
    } catch (error) {
      this.handleError(error, res, 'googleAuth');
    }
  }

  async googleCallback(req: FastifyRequest, res: FastifyReply) {
    try {
      const { code, state } = req.query as { code: string, state: string };
      const result = await this.userService.googleCallback(code, state);
      
      let script = '';
      if ('tempToken' in result) {
        script = `
          window.opener.postMessage({
            type: 'google-auth-prompt-username',
            email: '${result.email}',
            tempToken: '${result.tempToken}'
          }, '*');
          window.close();
        `;
      } else {
        script = `
          window.opener.postMessage({
            type: 'google-auth',
            token: '${result.token}',
            userId: '${result.id}',
            username: '${result.username}',
            email: '${result.email}',
            avatarUrl: '${result.avatarUrl || ""}',
            role: '${result.role}'
          }, '*');
          window.close();
        `;
      }

      res.type('text/html').send(`<html><body><script>${script}</script></body></html>`);
    } catch (error: any) {
      const errorMessage = error.message || 'Google Auth Failed';
      res.type('text/html').send(`
        <html><body><script>
          window.opener.postMessage({
            type: 'google-auth-error',
            error: '${errorMessage.replace(/'/g, "\\'")}'
          }, '*');
          window.close();
        </script></body></html>
      `);
    }
  }

  async completeGoogleLogin(req: FastifyRequest, res: FastifyReply) {
    try {
      const { tempToken, username } = req.body as { tempToken: string, username: string };
      const result = await this.userService.completeGoogleLogin(tempToken, username);
      this.handleSuccess(res, result);
    } catch (error) {
      this.handleError(error, res, 'completeGoogleLogin');
    }
  }
}