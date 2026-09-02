import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  roles?: string[];
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly userSockets = new Map<string, Set<string>>();

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }

      const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
      if (!secret) {
        client.disconnect(true);
        return;
      }
      const decoded = jwt.verify(token, secret) as unknown;
      const payload = decoded as { sub: string; role: string };

      // Verify user still exists and is active
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, status: true, role: true },
      });

      if (!user || user.status !== 'ACTIVE') {
        client.disconnect(true);
        return;
      }

      client.userId = user.id;
      client.roles = [user.role];

      // Join user's personal room
      client.join(`user:${user.id}`);

      // Track socket
      const sockets = this.userSockets.get(user.id) ?? new Set<string>();
      sockets.add(client.id);
      this.userSockets.set(user.id, sockets);

      // Join admin room if admin
      if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
        client.join('admins');
      }

      this.logger.log(`WebSocket connected: user=${user.id} socket=${client.id}`);
    } catch (error) {
      this.logger.warn(`WebSocket connection rejected: ${error instanceof Error ? error.message : 'unknown'}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const sockets = this.userSockets.get(client.userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(client.userId);
        }
      }
      this.logger.log(`WebSocket disconnected: user=${client.userId} socket=${client.id}`);
    }
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @MessageBody() data: { channel: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const { channel } = data ?? {};
    if (!channel) return { event: 'error', data: { message: 'Channel is required' } };

    // Only allow subscribing to own personal channel or public channels
    const allowed = ['wallets', 'orders', 'trades', 'notifications', 'market', 'admin'];
    if (!allowed.includes(channel)) {
      return { event: 'error', data: { message: 'Invalid channel' } };
    }

    if (channel === 'admin') {
      const isAdmin = client.roles?.includes('ADMIN') || client.roles?.includes('SUPER_ADMIN');
      if (!isAdmin) {
        return { event: 'error', data: { message: 'Forbidden' } };
      }
      client.join('admins');
    } else {
      client.join(`${channel}:${client.userId}`);
      // Market is shared public stream
      if (channel === 'market') {
        client.join('market');
      }
    }

    return { event: 'subscribed', data: { channel } };
  }

  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @MessageBody() data: { channel: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.userId) return;

    const channel = data?.channel;
    if (!channel) return { event: 'error', data: { message: 'Channel is required' } };

    client.leave(`${channel}:${client.userId}`);
    if (channel === 'market') client.leave('market');
    if (channel === 'admin') client.leave('admins');

    return { event: 'unsubscribed', data: { channel } };
  }

  // ============================================================
  // Broadcast helpers (used by other services)
  // ============================================================

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitToChannel(channel: string, userId: string, event: string, payload: unknown) {
    this.server.to(`${channel}:${userId}`).emit(event, payload);
  }

  emitToAdmins(event: string, payload: unknown) {
    this.server.to('admins').emit(event, payload);
  }

  emitToMarket(event: string, payload: unknown) {
    this.server.to('market').emit(event, payload);
  }

  emitToAll(event: string, payload: unknown) {
    this.server.emit(event, payload);
  }

  /**
   * Check if a user is currently connected.
   */
  isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    return !!sockets && sockets.size > 0;
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) return auth.token;

    const header = client.handshake.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      return header.slice(7);
    }

    const query = client.handshake.query as { token?: string };
    if (query?.token) return query.token;

    return null;
  }
}