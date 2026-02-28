import jwt from "jsonwebtoken";
import type { AuthPayload } from "../../domain/types";

export class TokenService {
  constructor(private readonly jwtSecret: string) {}

  sign(payload: AuthPayload): string {
    const sessionPayload: Pick<AuthPayload, "id" | "username" | "role" | "full_name"> = {
      id: payload.id,
      username: payload.username,
      role: payload.role,
      full_name: payload.full_name,
    };

    return jwt.sign(sessionPayload, this.jwtSecret, {
      expiresIn: "12h",
      issuer: "taskflow",
      audience: "taskflow-web",
      algorithm: "HS256",
    });
  }

  verify(token: string): AuthPayload {
    return jwt.verify(token, this.jwtSecret, {
      issuer: "taskflow",
      audience: "taskflow-web",
      algorithms: ["HS256"],
    }) as AuthPayload;
  }
}
