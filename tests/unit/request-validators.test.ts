import assert from "node:assert/strict";
import test from "node:test";
import {
  validateResetPasswordInput,
  validateTaskInput,
  validateTaskListQuery,
} from "../../server/src/presentation/validation/request-validators";

test("validateTaskInput accepts valid payload and deduplicates assignees", () => {
  const payload = {
    title: "Prepare release",
    instructions: "Coordinate deployment and checks",
    deadline: "2026-03-20T10:00:00.000Z",
    priority: "high",
    assigned_to: [5, 4, 5],
    subtasks: [{ title: "Run smoke test", deadline: "2026-03-19T11:30:00.000Z" }],
    reminder_at: "2026-03-19T09:00:00.000Z",
  };

  const validated = validateTaskInput(payload);
  assert.equal(validated.title, payload.title);
  assert.equal(validated.priority, "high");
  assert.deepEqual(validated.assigned_to, [5, 4]);
  assert.equal(validated.subtasks.length, 1);
  assert.equal(validated.subtasks[0]?.title, "Run smoke test");
});

test("validateTaskListQuery rejects invalid status and sort", () => {
  assert.throws(() => validateTaskListQuery({ status: "done" }), /Invalid status/);
  assert.throws(() => validateTaskListQuery({ sort: "oldest_first" }), /Invalid sort/);
});

test("validateResetPasswordInput enforces minimum password length", () => {
  assert.throws(() => validateResetPasswordInput({ newPassword: "12345" }), /Invalid newPassword/);

  const valid = validateResetPasswordInput({ newPassword: "A_Strong_Test_Password_123" });
  assert.equal(valid.newPassword, "A_Strong_Test_Password_123");
});
