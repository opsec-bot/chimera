import { Response } from 'express';
import { Logger } from '../utils/logger';

interface SSEClient {
  userId: number;
  response: Response;
  clientId: string;
  connectedAt: number;
}

interface LiveUpdateData {
  type: 'new_submission' | 'payment_update' | 'notification';
  data: any;
  timestamp: number;
  userId?: number; // If specified, only send to this user
}

/**
 * Service to manage Server-Sent Events (SSE) connections and broadcast live updates
 */
export class LiveUpdateService {
  private static clients: Map<string, SSEClient> = new Map();

  /**
   * Add a new SSE client connection
   */
  public static addClient(userId: number, response: Response, clientId: string): void {
    const client: SSEClient = {
      userId,
      response,
      clientId,
      connectedAt: Date.now(),
    };

    this.clients.set(clientId, client);
    Logger.debug('SSE client connected', { userId, clientId, totalClients: this.clients.size });

    // Set up cleanup on connection close
    response.on('close', () => {
      this.removeClient(clientId);
    });

    response.on('error', (error) => {
      Logger.error('SSE client error', { userId, clientId, error: error.message });
      this.removeClient(clientId);
    });
  }

  /**
   * Remove an SSE client connection
   */
  public static removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      Logger.debug('SSE client disconnected', {
        userId: client.userId,
        clientId,
        totalClients: this.clients.size,
        connectedFor: Date.now() - client.connectedAt,
      });
    }
  }

  /**
   * Broadcast an update to all connected clients or specific user
   */
  public static broadcastUpdate(updateData: LiveUpdateData): void {
    const { type, data, timestamp, userId } = updateData;

    const eventData = JSON.stringify({
      type,
      data,
      timestamp: timestamp || Date.now(),
    });

    let sentCount = 0;
    const disconnectedClients: string[] = [];

    this.clients.forEach((client, clientId) => {
      // If userId is specified, only send to that user
      if (userId && client.userId !== userId) {
        return;
      }

      try {
        client.response.write(`event: update\n`);
        client.response.write(`data: ${eventData}\n\n`);
        sentCount++;
      } catch (error) {
        Logger.warn('Failed to send SSE update to client', {
          clientId,
          userId: client.userId,
          error: error instanceof Error ? error.message : String(error),
        });
        disconnectedClients.push(clientId);
      }
    });

    // Clean up disconnected clients
    disconnectedClients.forEach((clientId) => this.removeClient(clientId));

    if (sentCount > 0) {
      Logger.debug('Broadcasted SSE update', {
        type,
        sentTo: sentCount,
        targetUser: userId || 'all',
        totalClients: this.clients.size,
      });
    }
  }

  /**
   * Broadcast new submission data (triggers sound notification on client)
   */
  public static broadcastNewSubmission(userId: number, submissionData: any): void {
    this.broadcastUpdate({
      type: 'new_submission',
      data: {
        message: 'New data received',
        submission: submissionData,
        playSound: true,
      },
      timestamp: Date.now(),
      userId,
    });
  }

  /**
   * Broadcast payment update (triggers sound notification on client)
   */
  public static broadcastPaymentUpdate(userId: number, paymentData: any): void {
    this.broadcastUpdate({
      type: 'payment_update',
      data: {
        message: 'Payment status updated',
        payment: paymentData,
        playSound: paymentData.status === 'paid',
      },
      timestamp: Date.now(),
      userId,
    });
  }

  /**
   * Broadcast general notification
   */
  public static broadcastNotification(userId: number, notification: any): void {
    this.broadcastUpdate({
      type: 'notification',
      data: {
        message: notification.message || 'New notification',
        notification,
        playSound: false,
      },
      timestamp: Date.now(),
      userId,
    });
  }

  /**
   * Get current client statistics
   */
  public static getStats(): { totalClients: number; clientsByUser: Record<number, number> } {
    const clientsByUser: Record<number, number> = {};

    this.clients.forEach((client) => {
      clientsByUser[client.userId] = (clientsByUser[client.userId] || 0) + 1;
    });

    return {
      totalClients: this.clients.size,
      clientsByUser,
    };
  }

  /**
   * Send ping to all clients to keep connections alive
   */
  public static sendPingToAll(): void {
    const pingData = JSON.stringify({ timestamp: Date.now() });
    const disconnectedClients: string[] = [];

    this.clients.forEach((client, clientId) => {
      try {
        client.response.write(`event: ping\n`);
        client.response.write(`data: ${pingData}\n\n`);
      } catch (error) {
        disconnectedClients.push(clientId);
      }
    });

    // Clean up disconnected clients
    disconnectedClients.forEach((clientId) => this.removeClient(clientId));
  }

  /**
   * Clean up stale connections (older than 1 hour)
   */
  public static cleanupStaleConnections(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const staleClients: string[] = [];

    this.clients.forEach((client, clientId) => {
      if (client.connectedAt < oneHourAgo) {
        staleClients.push(clientId);
      }
    });

    staleClients.forEach((clientId) => {
      const client = this.clients.get(clientId);
      if (client) {
        try {
          client.response.end();
        } catch (error) {
          // Ignore errors when closing stale connections
        }
        this.removeClient(clientId);
      }
    });

    if (staleClients.length > 0) {
      Logger.debug('Cleaned up stale SSE connections', { count: staleClients.length });
    }
  }
}

// Set up periodic cleanup and ping
setInterval(
  () => {
    LiveUpdateService.cleanupStaleConnections();
    LiveUpdateService.sendPingToAll();
  },
  5 * 60 * 1000,
); // Every 5 minutes
