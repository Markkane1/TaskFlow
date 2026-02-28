import { AppError } from "../../domain/errors";
import type { AuthenticatedRequestUser, AuditLogQuery, PaginatedResult, PaginationInput } from "../../domain/types";
import { AuditLogRepository } from "../../infrastructure/repositories/audit-log-repository";

export class AuditLogService {
  constructor(private readonly logs: AuditLogRepository) {}

  logEvent(input: {
    actorUserId?: number | null;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    statusCode?: number | null;
    ip?: string | null;
    userAgent?: string | null;
    details?: string | null;
  }): void {
    this.logs.create(input);
  }

  listLogs(
    requester: AuthenticatedRequestUser,
    query: AuditLogQuery,
    pagination: PaginationInput,
  ): PaginatedResult<any> {
    if (requester.role !== "sysAdmin") {
      throw new AppError("Forbidden", 403);
    }

    const items = this.logs.list(query, pagination);
    const total = this.logs.count(query);
    return {
      items,
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
    };
  }
}
