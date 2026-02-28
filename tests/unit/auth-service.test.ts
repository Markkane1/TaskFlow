import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../server/src/domain/errors";
import type { UserRecord } from "../../server/src/domain/types";
import { AuthService } from "../../server/src/application/services/auth-service";
import { TokenService } from "../../server/src/infrastructure/security/token-service";
import { PasswordHasher } from "../../server/src/infrastructure/security/password-hasher";
import { UserRepository } from "../../server/src/infrastructure/repositories/user-repository";

class FakeUserRepository {
  constructor(private readonly user?: UserRecord) {}

  findByUsername(username: string): UserRecord | undefined {
    if (!this.user) return undefined;
    return this.user.username === username ? this.user : undefined;
  }
}

class FakePasswordHasher {
  constructor(private readonly validPassword: string) {}

  async compare(plain: string): Promise<boolean> {
    return plain === this.validPassword;
  }
}

const makeUser = (): UserRecord => ({
  id: 1,
  username: "sysadmin",
  password: "hashed_placeholder",
  role: "sysAdmin",
  full_name: "System Admin",
  email: "sysadmin@taskflow.test",
  avatar_url: null,
  daily_task_cap: 5,
  created_at: new Date().toISOString(),
});

test("AuthService.login throws 401 when user does not exist", async () => {
  const service = new AuthService(
    new FakeUserRepository() as unknown as UserRepository,
    new FakePasswordHasher("does-not-matter") as unknown as PasswordHasher,
    new TokenService("test_jwt_secret_for_ci_and_local_runs_32_chars_min"),
  );

  await assert.rejects(() => service.login("missing", "bad"), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 401);
    assert.equal(error.message, "Invalid credentials");
    return true;
  });
});

test("AuthService.login returns signed token and public user payload", async () => {
  const service = new AuthService(
    new FakeUserRepository(makeUser()) as unknown as UserRepository,
    new FakePasswordHasher("CorrectHorseBatteryStaple") as unknown as PasswordHasher,
    new TokenService("test_jwt_secret_for_ci_and_local_runs_32_chars_min"),
  );

  const result = await service.login("sysadmin", "CorrectHorseBatteryStaple");

  assert.equal(result.user.username, "sysadmin");
  assert.equal(result.user.role, "sysAdmin");
  assert.equal(typeof result.token, "string");
  assert.ok(result.token.length > 20);
});
