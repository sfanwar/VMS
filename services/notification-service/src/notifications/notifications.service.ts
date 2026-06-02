import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { Email, InAppNotification } from '../entities/email.entity';
import { renderTemplate, TemplateContext } from './templates';

export interface EnqueueEmailInput {
  requestId?: string;
  sentBy: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  templateCode?: string;
  templateContext?: TemplateContext;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter!: nodemailer.Transporter;

  constructor(
    @InjectRepository(Email) private readonly emails: Repository<Email>,
    @InjectRepository(InAppNotification) private readonly inApp: Repository<InAppNotification>,
  ) {}

  async onModuleInit() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'mailhog',
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false,
      ignoreTLS: true, // MailHog dev only
    });
    try {
      await this.transporter.verify();
      this.logger.log(`SMTP connected: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
    } catch (err) {
      this.logger.warn(`SMTP verify failed (will retry on send): ${(err as Error).message}`);
    }

    // Start the background worker (simple polling — replace with BullMQ in production)
    setInterval(() => this.processQueue().catch(() => {}), 5000);
  }

  /** Persist email + queue for sending. Returns the row id. */
  async enqueueEmail(input: EnqueueEmailInput): Promise<Email> {
    // Render template if no body supplied
    let subject = input.subject;
    let bodyText = input.bodyText;
    let bodyHtml = input.bodyHtml;

    if (input.templateCode && (!subject || !bodyText)) {
      const rendered = renderTemplate(input.templateCode, input.templateContext ?? {});
      subject = subject ?? rendered.subject;
      bodyText = bodyText ?? rendered.bodyText;
      bodyHtml = bodyHtml ?? rendered.bodyHtml;
    }

    if (!subject || !bodyText) {
      throw new Error('Subject and body required (either directly or via template)');
    }

    return this.emails.save(this.emails.create({
      requestId: input.requestId ?? undefined,
      sentBy: input.sentBy,
      toAddresses: input.to,
      ccAddresses: input.cc ?? undefined,
      bccAddresses: input.bcc ?? undefined,
      subject,
      bodyText,
      bodyHtml: bodyHtml ?? undefined,
      templateCode: input.templateCode ?? undefined,
      status: 'PENDING',
    }));
  }

  async createInAppNotification(userId: string, title: string, body: string, requestId?: string): Promise<InAppNotification> {
    return this.inApp.save(this.inApp.create({ userId, title, body, requestId: requestId ?? undefined }));
  }

  async listForUser(userId: string, onlyUnread = false): Promise<InAppNotification[]> {
    return this.inApp.find({
      where: { userId, ...(onlyUnread ? { isRead: false } : {}) },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async markRead(id: string, userId: string): Promise<void> {
    const n = await this.inApp.findOne({ where: { id, userId } });
    if (n) {
      n.isRead = true;
      n.readAt = new Date();
      await this.inApp.save(n);
    }
  }

  async listEmailsForRequest(requestId: string): Promise<Email[]> {
    return this.emails.find({ where: { requestId }, order: { queuedAt: 'DESC' } });
  }

  // ───────────── Worker loop ─────────────

  private async processQueue(): Promise<void> {
    const pending = await this.emails.find({
      where: { status: 'PENDING' },
      take: 10,
      order: { queuedAt: 'ASC' },
    });

    for (const email of pending) {
      if (email.attempts >= 3) {
        email.status = 'FAILED';
        await this.emails.save(email);
        continue;
      }
      try {
        await this.transporter.sendMail({
          from: process.env.SMTP_FROM ?? 'noreply@visa-management.local',
          to: email.toAddresses,
          cc: email.ccAddresses ?? undefined,
          bcc: email.bccAddresses ?? undefined,
          subject: email.subject,
          text: email.bodyText ?? '',
          html: email.bodyHtml ?? undefined,
        });
        email.status = 'SENT';
        email.sentAt = new Date();
        await this.emails.save(email);
      } catch (err) {
        email.attempts += 1;
        email.errorMessage = (err as Error).message;
        if (email.attempts >= 3) email.status = 'FAILED';
        await this.emails.save(email);
        this.logger.warn(`Email send failed (attempt ${email.attempts}): ${email.errorMessage}`);
      }
    }
  }
}
