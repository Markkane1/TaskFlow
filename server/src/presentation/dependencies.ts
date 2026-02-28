import { AnalyticsService } from "../application/services/analytics-service";
import { AuditLogService } from "../application/services/audit-log-service";
import { AuthService } from "../application/services/auth-service";
import { NoticeService } from "../application/services/notice-service";
import { TaskService } from "../application/services/task-service";
import { UserService } from "../application/services/user-service";
import { TokenService } from "../infrastructure/security/token-service";

export interface ApiDependencies {
  authService: AuthService;
  userService: UserService;
  taskService: TaskService;
  noticeService: NoticeService;
  analyticsService: AnalyticsService;
  auditLogService: AuditLogService;
  tokenService: TokenService;
  isProduction: boolean;
}
