import jwt from "jsonwebtoken";
import type { AuthPayload } from "../../domain/types";

export class TokenService {
  constructor(private readonly jwtSecret: string) {}

  sign(payload: AuthPayload): string {
    return jwt.sign(payload, this.jwtSecret, {
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
