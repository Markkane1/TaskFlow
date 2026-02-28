import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
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
  await seedUser(context.userService, {
    username: "employee1",
    password: "Employee_Strong_Password_123",
    role: "employee",
    full_name: "Employee One",
  });
});

test("sysAdmin -> manager -> employee complete a real workflow and audit trail is queryable", async () => {
  const adminAgent = createAgent(context.app);
  await loginAs(adminAgent, "admin", "Admin_Strong_Password_123");
  const adminCsrf = await getCsrfToken(adminAgent);

  const createdEmployee = await adminAgent
    .post("/api/users")
    .set(withCsrf(adminCsrf))
    .send({
      username: "employee2",
      password: "Employee_Two_Strong_123",
      role: "employee",
      full_name: "Employee Two",
      email: "employee2@taskflow.test",
      daily_task_cap: 4,
    })
    .expect(200);
  assert.equal(createdEmployee.body.username, "employee2");

  const managerAgent = createAgent(context.app);
  await loginAs(managerAgent, "manager1", "Manager_Strong_Password_123");
  const managerCsrf = await getCsrfToken(managerAgent);

  const noticeResponse = await managerAgent
    .post("/api/notices")
    .set(withCsrf(managerCsrf))
    .send({
      title: "Operations Update",
      message: "Standup shifted to 10:30 AM starting Monday.",
    })
    .expect(200);
  const noticeId = noticeResponse.body.id as number;
  assert.ok(noticeId > 0);

  const employeesList = await managerAgent.get("/api/users?page=1&limit=50").expect(200);
  const employeeOne = employeesList.body.items.find((entry: { username: string }) => entry.username === "employee1");
  assert.ok(employeeOne, "expected employee1 to be visible to manager");

  const taskResponse = await managerAgent
    .post("/api/tasks")
    .set(withCsrf(managerCsrf))
    .send({
      title: "Prepare Monthly Report",
      instructions: "Gather metrics and submit summary to manager",
      deadline: "2026-03-15T16:00:00.000Z",
      priority: "urgent",
      assigned_to: [employeeOne.id],
      subtasks: [{ title: "Collect metrics", deadline: "2026-03-14T11:00:00.000Z" }],
    })
    .expect(200);
  const taskId = taskResponse.body.id as number;
  assert.ok(taskId > 0);

  const employeeAgent = createAgent(context.app);
  await loginAs(employeeAgent, "employee1", "Employee_Strong_Password_123");
  const employeeCsrf = await getCsrfToken(employeeAgent);

  await employeeAgent.post(`/api/notices/${noticeId}/acknowledge`).set(withCsrf(employeeCsrf)).send({}).expect(200);
  await employeeAgent
    .post(`/api/notices/${noticeId}/replies`)
    .set(withCsrf(employeeCsrf))
    .send({ message: "Acknowledged. I will be there." })
    .expect(200);

  await employeeAgent
    .patch(`/api/tasks/${taskId}/status`)
    .set(withCsrf(employeeCsrf))
    .send({ status: "in_progress", remarks: "Starting report now" })
    .expect(200);

  const detail = await employeeAgent.get(`/api/tasks/${taskId}`).expect(200);
  const subtaskId = detail.body.subtasks[0].id as number;

  await employeeAgent
    .patch(`/api/subtasks/${subtaskId}`)
    .set(withCsrf(employeeCsrf))
    .send({ status: "completed", remarks: "Metrics collected" })
    .expect(200);
  await employeeAgent
    .patch(`/api/tasks/${taskId}/status`)
    .set(withCsrf(employeeCsrf))
    .send({ status: "completed", remarks: "Report submitted" })
    .expect(200);

  const managerTaskList = await managerAgent
    .get("/api/tasks?page=1&limit=10&status=completed&sort=deadline_asc&includeHistory=0")
    .expect(200);
  assert.equal(managerTaskList.body.total, 1);
  assert.equal(managerTaskList.body.items[0].id, taskId);

  await adminAgent.get("/api/analytics/summary").expect(200);
  const auditLogList = await adminAgent.get("/api/audit-logs?page=1&limit=100").expect(200);

  assert.ok(auditLogList.body.total >= 6, "expected multiple audit events from workflow");
  const actions = auditLogList.body.items.map((entry: { action: string }) => entry.action);
  assert.ok(
    actions.every((action: string) => typeof action === "string" && action.length > 0),
    "expected non-empty action names in audit logs",
  );
  assert.ok(
    actions.some((action: string) => /(auth|users|tasks|notices)/.test(action)),
    "expected domain-relevant audit actions",
  );

  const forbiddenAuditRead = await employeeAgent.get("/api/audit-logs?page=1&limit=10").expect(403);
  assert.equal(forbiddenAuditRead.body.error, "Forbidden");
});
