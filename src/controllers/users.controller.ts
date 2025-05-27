import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Multipart } from '@fastify/multipart';
import UsersService from "../services/users.service";
import { ProfileRequest, GetUserByUsernameRequest, UpdatePasswordRequest, UpdateProfileRequest } from "../routes/users.router";

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
      reply.status(401).send({ message: error.message });
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
      const updates: { username?: string; email?: string; walletAddress?: string } = {};

      // Parse FormData fields
      for await (const part of request.parts()) {
        if (part.type === 'field') {
          switch (part.fieldname) {
            case 'username':
              updates.username = part.value as string;
              break;
            case 'email':
              updates.email = part.value as string;
              break;
            case 'walletAddress':
              updates.walletAddress = part.value as string;
              break;
            // Ignore avatar for now
          }
        }
      }

      await this.usersService.updateProfile(id, updates);
      reply.status(200).send({ message: "Profile updated successfully" });
    } catch (error: any) {
      reply.status(400).send({ message: error.message });
    }
  }
}