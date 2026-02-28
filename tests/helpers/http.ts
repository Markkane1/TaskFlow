import type { Express } from "express";
import request from "supertest";

export type TestAgent = ReturnType<typeof request.agent>;

export const createAgent = (app: Express): TestAgent => request.agent(app);

export const loginAs = async (
  agent: TestAgent,
  username: string,
  password: string,
): Promise<{ id: number; username: string; role: string; full_name: string }> => {
  const response = await agent.post("/api/auth/login").send({ username, password }).expect(200);
  return response.body as { id: number; username: string; role: string; full_name: string };
};

export const getCsrfToken = async (agent: TestAgent): Promise<string> => {
  const response = await agent.get("/api/auth/csrf").expect(200);
  const token = response.body?.csrfToken;
  if (!token || typeof token !== "string") {
    throw new Error("Missing csrfToken in response body");
  }
  return token;
};

export const withCsrf = (csrfToken: string): Record<string, string> => ({
  "x-csrf-token": csrfToken,
});
