import { AppError } from "../../domain/errors";
import type { AuthenticatedRequestUser, PaginatedResult, PaginationInput, PublicUser, Role } from "../../domain/types";
import { UserRepository } from "../../infrastructure/repositories/user-repository";
import { PasswordHasher } from "../../infrastructure/security/password-hasher";

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async seedAdminIfMissing(): Promise<void> {
    const adminUsername = process.env.SEED_ADMIN_USERNAME || "admin";
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!adminPassword || adminPassword.length < 12) {
      throw new AppError("SEED_ADMIN_PASSWORD must be set and at least 12 characters when SEED_DEFAULT_ADMIN=true", 500);
    }

    const admin = this.users.findByUsername(adminUsername);
    if (admin) {
      return;
    }

    const hashedPassword = await this.hasher.hash(adminPassword);
    this.users.create({
      username: adminUsername,
      hashedPassword,
      role: "sysAdmin",
      full_name: "System Administrator",
      email: null,
      avatar_url: null,
    });

    console.log(`Admin user created: ${adminUsername}`);
  }

  listUsers(): PublicUser[] {
    return this.users.listAll();
  }

  listUsersForRequester(requester: AuthenticatedRequestUser, pagination?: PaginationInput): PublicUser[] | PaginatedResult<PublicUser> {
    if (!pagination) {
      return this.users.listForRequester(requester);
    }

    const items = this.users.listForRequester(requester, pagination);
    const total = this.users.countForRequester(requester);
    return {
      items,
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
    };
  }

  getMyProfile(userId: number): PublicUser {
    const user = this.users.getPublicById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }
    return user;
  }

  async createUser(input: {
    username: string;
    password: string;
    role: Role;
    full_name: string;
    email?: string;
    avatar_url?: string | null;
    daily_task_cap?: number;
  }): Promise<PublicUser> {
    this.assertPasswordStrength(input.password);
    const hashedPassword = await this.hasher.hash(input.password);
    return this.users.create({
      username: input.username,
      hashedPassword,
      role: input.role,
      full_name: input.full_name,
      email: input.email || null,
      avatar_url: input.avatar_url || null,
      daily_task_cap: input.daily_task_cap || 5,
    });
  }

  async updateUser(input: {
    id: number;
    username: string;
    role: Role;
    full_name: string;
    email?: string;
    avatar_url?: string | null;
    daily_task_cap?: number;
    password?: string;
  }): Promise<void> {
    const hashedPassword = input.password ? await this.hasher.hash(input.password) : undefined;
    this.users.update({
      id: input.id,
      username: input.username,
      role: input.role,
      full_name: input.full_name,
      email: input.email || null,
      avatar_url: input.avatar_url || null,
      daily_task_cap: input.daily_task_cap || 5,
      hashedPassword,
    });
  }

  updateMyProfile(input: { userId: number; full_name: string; email?: string; avatar_url?: string | null }): PublicUser {
    const user = this.users.findById(input.userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    this.users.updateProfile({
      id: input.userId,
      full_name: input.full_name,
      email: input.email || null,
      avatar_url: input.avatar_url || null,
    });

    return this.getMyProfile(input.userId);
  }

  deleteUser(id: number): void {
    this.users.deleteNonSysAdmin(id);
  }

  async changeMyPassword(input: { userId: number; currentPassword: string; newPassword: string }): Promise<void> {
    const user = this.users.findById(input.userId);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const matches = await this.hasher.compare(input.currentPassword, user.password);
    if (!matches) {
      throw new AppError("Incorrect current password", 400);
    }

    this.assertPasswordStrength(input.newPassword);
    const hashedPassword = await this.hasher.hash(input.newPassword);
    this.users.updatePassword({ id: input.userId, hashedPassword });
  }

  async resetUserPassword(input: { actorRole: Role; userId: number; newPassword: string }): Promise<void> {
    if (input.actorRole !== "sysAdmin") {
      throw new AppError("Forbidden", 403);
    }

    const user = this.users.findById(input.userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    this.assertPasswordStrength(input.newPassword);
    const hashedPassword = await this.hasher.hash(input.newPassword);
    this.users.updatePassword({ id: input.userId, hashedPassword });
  }

  private assertPasswordStrength(password: string): void {
    if (!password || password.length < 8) {
      throw new AppError("Password must be at least 8 characters long", 400);
    }
  }
}
