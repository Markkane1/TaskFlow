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
  await seedUser(context.userService, {
    username: "employee1",
    password: "Employee_Strong_Password_123",
    role: "employee",
    full_name: "Employee One",
  });
});

test("task lifecycle enforces start-before-change and supports detailed fetch", async () => {
  const managerAgent = createAgent(context.app);
  await loginAs(managerAgent, "manager1", "Manager_Strong_Password_123");
  const managerCsrf = await getCsrfToken(managerAgent);

  const employees = await managerAgent.get("/api/users?page=1&limit=50").expect(200);
  const employee = employees.body.items.find((entry: { username: string }) => entry.username === "employee1");
  assert.ok(employee, "expected employee1 to be visible to manager");

  const createTask = await managerAgent
    .post("/api/tasks")
    .set(withCsrf(managerCsrf))
    .send({
      title: "Quarterly Planning",
      instructions: "Prepare planning board and execution checkpoints",
      deadline: "2026-03-31T12:00:00.000Z",
      priority: "high",
      assigned_to: [employee.id],
      subtasks: [{ title: "Draft planning notes", deadline: "2026-03-25T12:00:00.000Z" }],
    })
    .expect(200);

  const taskId = createTask.body.id as number;
  assert.ok(taskId > 0);

  const employeeAgent = createAgent(context.app);
  await loginAs(employeeAgent, "employee1", "Employee_Strong_Password_123");
  const employeeCsrf = await getCsrfToken(employeeAgent);

  const cannotCompleteDirectly = await employeeAgent
    .patch(`/api/tasks/${taskId}/status`)
    .set(withCsrf(employeeCsrf))
    .send({ status: "completed", remarks: "Trying to complete directly" })
    .expect(400);
  assert.match(cannotCompleteDirectly.body.error, /must be started/i);

  await employeeAgent
    .patch(`/api/tasks/${taskId}/status`)
    .set(withCsrf(employeeCsrf))
    .send({ status: "in_progress", remarks: "Started work" })
    .expect(200);

  const taskDetail = await managerAgent.get(`/api/tasks/${taskId}`).expect(200);
  assert.equal(taskDetail.body.id, taskId);
  assert.equal(taskDetail.body.assignments.length, 1);
  assert.ok(Array.isArray(taskDetail.body.history));
  assert.ok(taskDetail.body.history.length >= 2);
  assert.equal(taskDetail.body.history[0].status_to, "created");
  assert.equal(taskDetail.body.history[1].status_to, "assigned");

  const subtaskId = taskDetail.body.subtasks[0].id as number;
  await employeeAgent
    .patch(`/api/subtasks/${subtaskId}`)
    .set(withCsrf(employeeCsrf))
    .send({ status: "completed", remarks: "Done" })
    .expect(200);

  await employeeAgent
    .patch(`/api/tasks/${taskId}/status`)
    .set(withCsrf(employeeCsrf))
    .send({ status: "completed", remarks: "All done" })
    .expect(200);

  await managerAgent
    .put(`/api/tasks/${taskId}`)
    .set(withCsrf(managerCsrf))
    .send({
      title: "Quarterly Planning (Updated)",
      instructions: "Finalized after completion for record",
      deadline: "2026-03-31T12:00:00.000Z",
      priority: "high",
      assigned_to: [employee.id],
      subtasks: [{ id: subtaskId, title: "Draft planning notes", deadline: "2026-03-25T12:00:00.000Z" }],
      reminder_at: "2026-03-30T09:00:00.000Z",
    })
    .expect(200);

  const paginatedList = await managerAgent
    .get("/api/tasks?page=1&limit=10&includeHistory=0&sort=created_desc")
    .expect(200);

  assert.equal(paginatedList.body.page, 1);
  assert.equal(paginatedList.body.total, 1);
  assert.equal(Array.isArray(paginatedList.body.items), true);
  assert.equal(Array.isArray(paginatedList.body.items[0].history), true);
  assert.equal(paginatedList.body.items[0].history.length, 0);
});

test("task routes cannot be used without auth", async () => {
  const response = await request(context.app).get("/api/tasks?page=1&limit=10").expect(401);
  assert.equal(response.body.error, "Unauthorized");
});

test("marking a task completed auto-completes all subtasks", async () => {
  const managerAgent = createAgent(context.app);
  await loginAs(managerAgent, "manager1", "Manager_Strong_Password_123");
  const managerCsrf = await getCsrfToken(managerAgent);

  const employees = await managerAgent.get("/api/users?page=1&limit=50").expect(200);
  const employee = employees.body.items.find((entry: { username: string }) => entry.username === "employee1");
  assert.ok(employee, "expected employee1 to be visible to manager");

  const createTask = await managerAgent
    .post("/api/tasks")
    .set(withCsrf(managerCsrf))
    .send({
      title: "Prepare Sprint Demo",
      instructions: "Build and finalize demo assets",
      deadline: "2026-03-31T12:00:00.000Z",
      priority: "normal",
      assigned_to: [employee.id],
      subtasks: [
        { title: "Draft talking points", deadline: "2026-03-28T12:00:00.000Z" },
        { title: "Capture screenshots", deadline: "2026-03-29T12:00:00.000Z" },
      ],
    })
    .expect(200);

  const taskId = createTask.body.id as number;
  assert.ok(taskId > 0);

  const employeeAgent = createAgent(context.app);
  await loginAs(employeeAgent, "employee1", "Employee_Strong_Password_123");
  const employeeCsrf = await getCsrfToken(employeeAgent);

  await employeeAgent
    .patch(`/api/tasks/${taskId}/status`)
    .set(withCsrf(employeeCsrf))
    .send({ status: "in_progress", remarks: "Starting demo prep" })
    .expect(200);

  await employeeAgent
    .patch(`/api/tasks/${taskId}/status`)
    .set(withCsrf(employeeCsrf))
    .send({ status: "completed", remarks: "Demo pack is complete" })
    .expect(200);

  const detail = await employeeAgent.get(`/api/tasks/${taskId}`).expect(200);
  assert.equal(detail.body.status, "completed");
  assert.equal(detail.body.subtasks.length, 2);
  assert.ok(
    detail.body.subtasks.every((subtask: { status: string }) => subtask.status === "completed"),
    "expected all subtasks to be completed when task is completed",
  );
});
