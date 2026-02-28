import assert from "node:assert/strict";
import test from "node:test";
import { TokenService } from "../../server/src/infrastructure/security/token-service";

test("TokenService.sign stores only compact session claims", () => {
  const service = new TokenService("test_jwt_secret_for_ci_and_local_runs_32_chars_min");
  const token = service.sign({
    id: 7,
    username: "user7",
    role: "employee",
    full_name: "User Seven",
    email: "user7@taskflow.test",
    avatar_url: `data:image/png;base64,${"x".repeat(80_000)}`,
  });

  assert.ok(token.length < 1000, "JWT became unexpectedly large");

  const decoded = service.verify(token);
  assert.equal(decoded.id, 7);
  assert.equal(decoded.username, "user7");
  assert.equal(decoded.role, "employee");
  assert.equal(decoded.full_name, "User Seven");
  assert.equal(decoded.email, undefined);
  assert.equal(decoded.avatar_url, undefined);
});
