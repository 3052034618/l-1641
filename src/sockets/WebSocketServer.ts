import { Server, Socket } from 'socket.io';
import { createServer } from 'http';
import { env } from '../config/env';
import { verifyToken, JwtPayload } from '../utils/jwt';
import { UserRole } from '../enums';
import logger from '../config/logger';

export interface ConnectedClient {
  socketId: string;
  userId: string;
  role: UserRole;
  departmentId?: string;
  socket: Socket;
}

export class WebSocketServer {
  private io: Server;
  private clients: Map<string, ConnectedClient> = new Map();
  private static instance: WebSocketServer;

  private constructor() {}

  static getInstance(): WebSocketServer {
    if (!WebSocketServer.instance) {
      WebSocketServer.instance = new WebSocketServer();
    }
    return WebSocketServer.instance;
  }

  initialize(httpServer?: ReturnType<typeof createServer>) {
    if (httpServer) {
      this.io = new Server(httpServer, {
        cors: {
          origin: '*',
          methods: ['GET', 'POST'],
          credentials: true,
        },
      });
    } else {
      this.io = new Server(env.SOCKET_PORT, {
        cors: {
          origin: '*',
          methods: ['GET', 'POST'],
        },
      });
    }

    this.setupMiddleware();
    this.setupEventHandlers();
    logger.info(`WebSocket server started on port ${env.SOCKET_PORT}`);
  }

  private setupMiddleware() {
    this.io.use((socket: Socket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      try {
        const payload = verifyToken(token as string);
        (socket as any).user = payload;
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: Socket) => {
      const user = (socket as any).user as JwtPayload;

      const client: ConnectedClient = {
        socketId: socket.id,
        userId: user.userId,
        role: user.role,
        departmentId: user.departmentId,
        socket,
      };

      this.clients.set(user.userId, client);
      logger.info(`Client connected: ${user.userId} (${user.role})`);

      socket.emit('connected', {
        message: 'Connected successfully',
        userId: user.userId,
        role: user.role,
      });

      socket.on('disconnect', () => {
        this.clients.delete(user.userId);
        logger.info(`Client disconnected: ${user.userId}`);
      });

      socket.on('error', (error) => {
        logger.error(`WebSocket error for client ${user.userId}:`, error);
      });
    });
  }

  sendToUser(userId: string, event: string, data: any) {
    const client = this.clients.get(userId);
    if (client) {
      client.socket.emit(event, {
        ...data,
        timestamp: new Date().toISOString(),
      });
      logger.debug(`Sent ${event} to user ${userId}`);
      return true;
    }
    logger.debug(`User ${userId} not connected, event ${event} not sent`);
    return false;
  }

  sendToRole(role: UserRole, event: string, data: any) {
    const sentTo: string[] = [];
    this.clients.forEach((client) => {
      if (client.role === role) {
        client.socket.emit(event, {
          ...data,
          timestamp: new Date().toISOString(),
        });
        sentTo.push(client.userId);
      }
    });
    logger.debug(`Sent ${event} to role ${role}: ${sentTo.length} clients`);
    return sentTo;
  }

  sendToRoles(roles: UserRole[], event: string, data: any) {
    const sentTo: string[] = [];
    roles.forEach((role) => {
      const recipients = this.sendToRole(role, event, data);
      sentTo.push(...recipients);
    });
    return sentTo;
  }

  sendToAll(event: string, data: any) {
    this.io.emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
    logger.debug(`Sent ${event} to all clients: ${this.clients.size} total`);
    return this.clients.size;
  }

  sendToDepartment(departmentId: string, event: string, data: any) {
    const sentTo: string[] = [];
    this.clients.forEach((client) => {
      if (client.departmentId === departmentId) {
        client.socket.emit(event, {
          ...data,
          timestamp: new Date().toISOString(),
        });
        sentTo.push(client.userId);
      }
    });
    logger.debug(`Sent ${event} to department ${departmentId}: ${sentTo.length} clients`);
    return sentTo;
  }

  broadcastStatusChange(entityType: string, entityId: string, oldStatus: string, newStatus: string, additionalData?: any) {
    const rolesToNotify: UserRole[] = [
      UserRole.CSSD_MANAGER,
      UserRole.DISINFECTION_WORKER,
      UserRole.NURSE,
    ];

    const data = {
      entityType,
      entityId,
      oldStatus,
      newStatus,
      ...additionalData,
    };

    return this.sendToRoles(rolesToNotify, 'status_change', data);
  }

  getConnectedUsersCount(): number {
    return this.clients.size;
  }

  getConnectedUsers(): Array<{ userId: string; role: UserRole; departmentId?: string }> {
    return Array.from(this.clients.values()).map((client) => ({
      userId: client.userId,
      role: client.role,
      departmentId: client.departmentId,
    }));
  }

  getIO(): Server {
    return this.io;
  }
}

export const webSocketServer = WebSocketServer.getInstance();
