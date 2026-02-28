import db from "../database/db";
import type { NoticeInput, NoticeReplyInput, NoticeThread, PaginationInput } from "../../domain/types";

interface SqlNotice {
  id: number;
  title: string;
  message: string;
  created_by: number;
  created_by_name: string;
  created_at: string;
  updated_at: string | null;
  is_archived: number;
  reply_count: number;
  acknowledgement_count: number;
  acknowledged_by_me: number;
}

export class NoticeRepository {
  listForUser(userId: number, pagination: PaginationInput, includeArchived: boolean): NoticeThread[] {
    const whereClause = includeArchived ? "" : "WHERE n.is_archived = 0";

    const notices = db
      .prepare(
        `
      SELECT
        n.id,
        n.title,
        n.message,
        n.created_by,
        creator.full_name as created_by_name,
        n.created_at,
        n.updated_at,
        n.is_archived,
        (SELECT COUNT(*) FROM notice_replies nr WHERE nr.notice_id = n.id) as reply_count,
        (SELECT COUNT(*) FROM notice_acknowledgements na WHERE na.notice_id = n.id) as acknowledgement_count,
        CASE WHEN EXISTS (
          SELECT 1 FROM notice_acknowledgements na WHERE na.notice_id = n.id AND na.user_id = ?
        ) THEN 1 ELSE 0 END as acknowledged_by_me
      FROM notices n
      JOIN users creator ON creator.id = n.created_by
      ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `,
      )
      .all(userId, pagination.limit, (pagination.page - 1) * pagination.limit) as SqlNotice[];

    const repliesByNotice = this.listRepliesByNoticeIds(notices.map((notice) => notice.id));

    return notices.map((notice) => ({
      ...notice,
      replies: repliesByNotice[notice.id] || [],
    }));
  }

  count(includeArchived: boolean): number {
    const whereClause = includeArchived ? "" : "WHERE is_archived = 0";
    const row = db.prepare(`SELECT COUNT(*) as total FROM notices ${whereClause}`).get() as { total: number };
    return row.total;
  }

  findById(noticeId: number): NoticeThread | undefined {
    const row = db
      .prepare(
        `
      SELECT
        n.id,
        n.title,
        n.message,
        n.created_by,
        creator.full_name as created_by_name,
        n.created_at,
        n.updated_at,
        n.is_archived,
        (SELECT COUNT(*) FROM notice_replies nr WHERE nr.notice_id = n.id) as reply_count,
        (SELECT COUNT(*) FROM notice_acknowledgements na WHERE na.notice_id = n.id) as acknowledgement_count,
        0 as acknowledged_by_me
      FROM notices n
      JOIN users creator ON creator.id = n.created_by
      WHERE n.id = ?
    `,
      )
      .get(noticeId) as SqlNotice | undefined;

    if (!row) {
      return undefined;
    }

    const repliesByNotice = this.listRepliesByNoticeIds([noticeId]);

    return {
      ...row,
      replies: repliesByNotice[noticeId] || [],
    };
  }

  create(input: NoticeInput, actorUserId: number): number {
    const result = db
      .prepare("INSERT INTO notices (title, message, created_by) VALUES (?, ?, ?)")
      .run(input.title, input.message, actorUserId);
    return Number(result.lastInsertRowid);
  }

  update(noticeId: number, input: NoticeInput): void {
    db.prepare("UPDATE notices SET title = ?, message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      input.title,
      input.message,
      noticeId,
    );
  }

  setArchived(noticeId: number, archived: boolean): void {
    db.prepare("UPDATE notices SET is_archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(archived ? 1 : 0, noticeId);
  }

  addReply(noticeId: number, actorUserId: number, input: NoticeReplyInput): number {
    const result = db
      .prepare("INSERT INTO notice_replies (notice_id, user_id, message) VALUES (?, ?, ?)")
      .run(noticeId, actorUserId, input.message);
    return Number(result.lastInsertRowid);
  }

  acknowledge(noticeId: number, userId: number): void {
    db.prepare(
      "INSERT INTO notice_acknowledgements (notice_id, user_id, acknowledged_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(notice_id, user_id) DO NOTHING",
    ).run(noticeId, userId);
  }

  private listRepliesByNoticeIds(noticeIds: number[]): Record<number, NoticeThread["replies"]> {
    if (!noticeIds.length) {
      return {};
    }

    const placeholders = noticeIds.map(() => "?").join(",");

    const rows = db
      .prepare(
        `
      SELECT
        nr.id,
        nr.notice_id,
        nr.user_id,
        u.full_name as user_name,
        u.role,
        nr.message,
        nr.created_at
      FROM notice_replies nr
      JOIN users u ON u.id = nr.user_id
      WHERE nr.notice_id IN (${placeholders})
      ORDER BY nr.notice_id ASC, nr.created_at ASC
    `,
      )
      .all(...noticeIds) as NoticeThread["replies"];

    const grouped: Record<number, NoticeThread["replies"]> = {};
    for (const row of rows) {
      if (!grouped[row.notice_id]) {
        grouped[row.notice_id] = [];
      }
      grouped[row.notice_id].push(row);
    }

    return grouped;
  }

}
