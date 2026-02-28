import type { PublicUser } from "../../domain/types";

interface TaskEmailPayload {
  taskId: number;
  taskTitle: string;
  event: string;
  recipients: PublicUser[];
  actorName: string;
  remarks?: string;
}

/**
 * Email notification hook.
 * Keep disabled by default and wire transport later with minimal changes.
 */
export class EmailNotifier {
  private readonly provider = (process.env.EMAIL_PROVIDER || "mock").toLowerCase();
  private readonly resendApiKey = process.env.RESEND_API_KEY || "";
  private readonly resendFromEmail = process.env.RESEND_FROM_EMAIL || "";
  private readonly resendReplyToEmail = process.env.RESEND_REPLY_TO_EMAIL || "";
  private readonly resendAudienceTag = process.env.RESEND_AUDIENCE_TAG || "taskflow";

  constructor(private readonly enabled: boolean) {}

  async sendTaskEventEmail(payload: TaskEmailPayload): Promise<void> {
    if (!this.enabled) {
      return;
    }

    // Placeholder transport hook: later swap this block with nodemailer/provider SDK.
    const recipientEmails = payload.recipients.map((recipient) => recipient.email).filter(Boolean);
    if (!recipientEmails.length) {
      return;
    }

    if (this.provider !== "resend") {
      console.log(
        "[email] task event (mock transport)",
        JSON.stringify({
          to: recipientEmails,
          taskId: payload.taskId,
          taskTitle: payload.taskTitle,
          event: payload.event,
          actorName: payload.actorName,
          remarks: payload.remarks || null,
        }),
      );
      return;
    }

    if (!this.resendApiKey || !this.resendFromEmail) {
      console.warn("[email] resend transport selected but RESEND_API_KEY/RESEND_FROM_EMAIL missing");
      return;
    }

    const subject = `[TaskFlow] ${payload.event.replaceAll("_", " ")} - ${payload.taskTitle}`;
    const text = [
      `Task: ${payload.taskTitle} (#${payload.taskId})`,
      `Event: ${payload.event}`,
      `Actor: ${payload.actorName}`,
      payload.remarks ? `Remarks: ${payload.remarks}` : "",
      `Audience: ${this.resendAudienceTag}`,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.resendFromEmail,
        to: recipientEmails,
        reply_to: this.resendReplyToEmail || undefined,
        subject,
        text,
        tags: [{ name: "audience", value: this.resendAudienceTag }],
      }),
    });

    if (!response.ok) {
      const reason = await response.text();
      throw new Error(`Resend API failed (${response.status}): ${reason}`);
    }
  }
}
