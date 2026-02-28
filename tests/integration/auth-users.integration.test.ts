import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import request from "supertest";
import { createAgent, getCsrfToken, loginAs, withCsrf } from "../helpers/http";
import { createTestContext, resetDatabase, seedUser } from "../helpers/test-fixture";

let context = createTestContext();

beforeEach(async () => {
  resetDatabase();
  context = createTestContext();
  await seedUser(context.userService, {
    username: "admin",
    password: "Admin_Strong_Password_123",
    role: "sysAdmin",
    full_name: "System Admin",
  });
  await seedUser(context.userService, {
    username: "manager1",
    password: "Manager_Strong_Password_123",
    role: "manager",
    full_name: "Manager One",
  });
});

test("GET /api/auth/me requires authentication", async () => {
  const response = await request(context.app).get("/api/auth/me").expect(401);
  assert.equal(response.body.error, "Unauthorized");
});

test("login requires CAPTCHA answer", async () => {
  await request(context.app)
    .post("/api/auth/login")
    .send({
      username: "admin",
      password: "Admin_Strong_Password_123",
    })
    .expect(400);
});

test("sysAdmin can create users; manager is forbidden", async () => {
  const adminAgent = createAgent(context.app);
  await loginAs(adminAgent, "admin", "Admin_Strong_Password_123");
  const adminCsrf = await getCsrfToken(adminAgent);

  const createEmployee = await adminAgent
    .post("/api/users")
    .set(withCsrf(adminCsrf))
    .send({
      username: "employeeA",
      password: "Employee_Strong_Password_123",
      role: "employee",
      full_name: "Employee A",
      email: "employeeA@taskflow.test",
      daily_task_cap: 6,
    })
    .expect(200);

  assert.equal(createEmployee.body.username, "employeeA");
  assert.equal(createEmployee.body.role, "employee");

  const managerAgent = createAgent(context.app);
  await loginAs(managerAgent, "manager1", "Manager_Strong_Password_123");
  const managerCsrf = await getCsrfToken(managerAgent);

  const forbidden = await managerAgent
    .post("/api/users")
    .set(withCsrf(managerCsrf))
    .send({
      username: "blocked",
      password: "Blocked_Strong_Password_123",
      role: "employee",
      full_name: "Blocked User",
    })
    .expect(403);

  assert.equal(forbidden.body.error, "Forbidden");
});

test("state-changing routes enforce CSRF token", async () => {
  const adminAgent = createAgent(context.app);
  await loginAs(adminAgent, "admin", "Admin_Strong_Password_123");

  const missingCsrf = await adminAgent
    .post("/api/users")
    .send({
      username: "noCsrf",
      password: "No_Csrf_Strong_123",
      role: "employee",
      full_name: "No CSRF User",
    })
    .expect(403);

  assert.equal(missingCsrf.body.error, "Invalid CSRF token");
});
