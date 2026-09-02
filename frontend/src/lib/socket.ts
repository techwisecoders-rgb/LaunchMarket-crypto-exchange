import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

class SocketManager {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<(data: any) => void>>();

  connect(token: string | null = null): Socket {
    if (this.socket?.connected) return this.socket;
    this.socket = io(WS_URL, {
      transports: ['websocket'],
      auth: token ? { token } : undefined,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] disconnected:', reason);
    });

    this.socket.on('error', (error) => {
      console.error('[Socket] error:', error);
    });

    // Broadcast all incoming events to local listeners
    this.socket.onAny((event: string, data: any) => {
      const subs = this.listeners.get(event);
      if (subs) {
        subs.forEach((cb) => {
          try {
            cb(data);
          } catch (err) {
            console.error(`[Socket] listener error on ${event}:`, err);
          }
        });
      }
    });

    return this.socket;
  }

  subscribe(event: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Ensure socket is connected
    this.connect();

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  emit(event: string, data?: any): void {
    this.connect().emit(event, data);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const socketManager = new SocketManager();

export type RealtimeEvent =
  | 'balance:update'
  | 'order:created'
  | 'order:updated'
  | 'order:cancelled'
  | 'trade:executed'
  | 'deposit:received'
  | 'withdrawal:update'
  | 'notification:new'
  | 'market:tick'
  | 'admin:user-update'
  | 'system:alert';