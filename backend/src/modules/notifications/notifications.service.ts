import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailerService: MailerService,
  ) {}

  /**
   * List the user's notifications.
   */
  async getUserNotifications(
    userId: string,
    params: { page?: number; limit?: number; unreadOnly?: boolean },
  ) {
    const { page = 1, limit = 20, unreadOnly = false } = params;
    const where: Prisma.NotificationWhereInput = { userId };
    if (unreadOnly) where.read = false;

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    const unreadCount = await this.prisma.notification.count({
      where: { userId, read: false },
    });

    return { data, total, unreadCount, page, limit };
  }

  /**
   * Mark notifications as read.
   */
  async markAsRead(userId: string, notificationId?: string) {
    if (notificationId) {
      const notification = await this.prisma.notification.findUnique({
        where: { id: notificationId },
      });
      if (!notification || notification.userId !== userId) {
        return { success: false, message: 'Notification not found' };
      }

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { read: true, readAt: new Date() },
      });

      return { success: true };
    }

    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });

    return { success: true };
  }

  /**
   * Create a notification for a user (In-app + optional email).
   */
  async createNotification(params: {
    userId: string;
    type: string;
    title: string;
    message: string;
    channel?: 'EMAIL' | 'IN_APP' | 'BOTH';
    metadata?: Prisma.InputJsonValue;
  }) {
    const { userId, type, title, message, channel = 'BOTH', metadata } = params;

    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        channel,
        metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    // Send email if channel includes EMAIL
    if (channel === 'EMAIL' || channel === 'BOTH') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, emailVerified: true, fullName: true },
      });

      if (user && user.emailVerified) {
        try {
          await this.mailerService.sendNotificationEmail({
            to: user.email,
            subject: title,
            title,
            message,
            userName: user.fullName ?? user.email,
          });
        } catch (error) {
          // Email failure should not break the app; log and continue
          console.error(`Failed to send notification email to ${user.email}`, error);
        }
      }
    }

    return notification;
  }

  /**
   * Delete a notification.
   */
  async deleteNotification(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.userId !== userId) {
      return { success: false, message: 'Notification not found' };
    }

    await this.prisma.notification.delete({ where: { id: notificationId } });
    return { success: true };
  }

  /**
   * Get unread count.
   * Returns a bare number so the API response's `data` field is a primitive,
   * which is what the dashboard's `{unreadCount ?? 0}` renderer expects.
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  /**
   * Notify all admin users (for admin panel real-time alerts).
   */
  async notifyAdmins(params: {
    type: string;
    title: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    const { type, title, message, metadata } = params;

    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'SUPER_ADMIN'] },
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    await this.prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type,
        title,
        message,
        channel: 'IN_APP' as const,
        metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      })),
    });

    return { notified: admins.length };
  }
}