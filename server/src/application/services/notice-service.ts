import { AppError } from "../../domain/errors";
import type {
  AuthenticatedRequestUser,
  NoticeInput,
  NoticeReplyInput,
  PaginatedResult,
  PaginationInput,
} from "../../domain/types";
import { NotificationGateway } from "../../infrastructure/realtime/notification-gateway";
import { NoticeRepository } from "../../infrastructure/repositories/notice-repository";

export class NoticeService {
  constructor(
    private readonly notices: NoticeRepository,
    private readonly notifications: NotificationGateway,
  ) {}

  listNotices(
    user: AuthenticatedRequestUser,
    pagination: PaginationInput,
    includeArchived: boolean,
  ): PaginatedResult<any> {
    const items = this.notices.listForUser(user.id, pagination, includeArchived);
    const total = this.notices.count(includeArchived);
    return {
      items,
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
    };
  }

  createNotice(user: AuthenticatedRequestUser, input: NoticeInput): { id: number } {
    this.assertRole(user, ["sysAdmin", "manager"]);

    const noticeId = this.notices.create(input, user.id);
    const created = this.notices.findById(noticeId);
    if (created) {
      this.notifications.notifyAll("notice_created", `New notice: ${created.title}`, created);
    }

    return { id: noticeId };
  }

  updateNotice(user: AuthenticatedRequestUser, noticeId: number, input: NoticeInput): void {
    const notice = this.notices.findById(noticeId);
    if (!notice) {
      throw new AppError("Notice not found", 404);
    }

    if (user.role !== "sysAdmin" && notice.created_by !== user.id) {
      throw new AppError("Forbidden", 403);
    }

    this.notices.update(noticeId, input);
    const updated = this.notices.findById(noticeId);
    if (updated) {
      this.notifications.notifyAll("notice_updated", `Notice updated: ${updated.title}`, updated);
    }
  }

  archiveNotice(user: AuthenticatedRequestUser, noticeId: number, archived: boolean): void {
    const notice = this.notices.findById(noticeId);
    if (!notice) {
      throw new AppError("Notice not found", 404);
    }

    if (user.role !== "sysAdmin" && notice.created_by !== user.id) {
      throw new AppError("Forbidden", 403);
    }

    this.notices.setArchived(noticeId, archived);
  }

  addReply(user: AuthenticatedRequestUser, noticeId: number, input: NoticeReplyInput): { id: number } {
    const notice = this.notices.findById(noticeId);
    if (!notice) {
      throw new AppError("Notice not found", 404);
    }
    if (notice.is_archived) {
      throw new AppError("Cannot reply to archived notice", 400);
    }

    const replyId = this.notices.addReply(noticeId, user.id, input);
    const updated = this.notices.findById(noticeId);
    if (updated) {
      this.notifications.notifyAll("notice_replied", `New reply on notice: ${updated.title}`, updated);
    }
    return { id: replyId };
  }

  acknowledge(user: AuthenticatedRequestUser, noticeId: number): void {
    const notice = this.notices.findById(noticeId);
    if (!notice) {
      throw new AppError("Notice not found", 404);
    }

    this.notices.acknowledge(noticeId, user.id);
    if (notice.created_by !== user.id) {
      this.notifications.notifyUser(
        notice.created_by,
        "notice_acknowledged",
        `${user.full_name} acknowledged notice: ${notice.title}`,
        { noticeId, userId: user.id },
      );
    }
  }

  private assertRole(user: AuthenticatedRequestUser, allowed: string[]): void {
    if (!allowed.includes(user.role)) {
      throw new AppError("Forbidden", 403);
    }
  }
}
