import { AppError } from "../../domain/errors";
import type { PublicUser } from "../../domain/types";
import { PasswordHasher } from "../../infrastructure/security/password-hasher";
import { TokenService } from "../../infrastructure/security/token-service";
import { UserRepository } from "../../infrastructure/repositories/user-repository";

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokenService: TokenService,
  ) {}

  async login(username: string, password: string): Promise<{ user: PublicUser; token: string }> {
    const user = this.users.findByUsername(username);

    if (!user) {
      throw new AppError("Invalid credentials", 401);
    }

    const isValid = await this.hasher.compare(password, user.password);
    if (!isValid) {
      throw new AppError("Invalid credentials", 401);
    }

    const token = this.tokenService.sign({
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        email: user.email || null,
        avatar_url: user.avatar_url || null,
      },
      token,
    };
  }
}
