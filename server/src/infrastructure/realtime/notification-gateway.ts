import type { Server as SocketServer } from "socket.io";

export class NotificationGateway {
  private io?: SocketServer;

  bind(io: SocketServer): void {
    this.io = io;
  }

  notifyAll(type: string, message: string, data: unknown): void {
    if (!this.io) return;

    this.io.emit("task_notification", {
      type,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  notifyUser(userId: number, type: string, message: string, data: unknown): void {
    if (!this.io) return;

    this.io.to(`user_${userId}`).emit("task_notification", {
      type,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  notifyUsers(userIds: number[], type: string, message: string, data: unknown): void {
    for (const userId of userIds) {
      this.notifyUser(userId, type, message, data);
    }
  }
}
