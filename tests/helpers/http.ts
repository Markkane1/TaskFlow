import type { Express } from "express";
import request from "supertest";

export type TestAgent = ReturnType<typeof request.agent>;

export const createAgent = (app: Express): TestAgent => request.agent(app);

const solveMathCaptcha = (challenge: string): string => {
  const match = challenge.match(/What is\s+(\d+)\s*([+-])\s*(\d+)\?/i);
  if (!match) {
    throw new Error(`Unsupported CAPTCHA challenge: ${challenge}`);
  }

  const left = Number(match[1]);
  const operator = match[2];
  const right = Number(match[3]);
  const answer = operator === "+" ? left + right : left - right;
  return String(answer);
};

export const loginAs = async (
  agent: TestAgent,
  username: string,
  password: string,
): Promise<{ id: number; username: string; role: string; full_name: string }> => {
  const captcha = await agent.get("/api/auth/captcha").expect(200);
  const challenge = captcha.body?.challenge as string | undefined;
  if (!challenge) {
    throw new Error("Missing CAPTCHA challenge");
  }

  const response = await agent
    .post("/api/auth/login")
    .send({ username, password, captchaAnswer: solveMathCaptcha(challenge) })
    .expect(200);
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
