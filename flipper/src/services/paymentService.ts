import { db } from '../db/connection';
import { eq, and, like, sql, desc, count, sum, avg, gte, lte } from 'drizzle-orm';
import { payments, users } from '../db/schema';
import type { Payment } from '../db/schema';
import { generateInvoice, txidLookup } from './oxapay';
import { SUBSCRIPTION_TIERS } from '../config/subscriptionConfig';
import { NotificationService } from './notificationService';
import { LiveUpdateService } from './liveUpdateService';
import { config } from '../config/config';

export class PaymentService {
  /**
   * Create a new payment request
   */
  static async createPayment(
    userId: number,
    subscriptionType: 'WEEK' | 'MONTH' | 'THREE_MONTHS',
  ): Promise<{ payment: Payment; paymentLink: string }> {
    try {
      const tier = SUBSCRIPTION_TIERS.find((t) => t.type === subscriptionType);
      if (!tier) {
        throw new Error('Invalid subscription type');
      }

      // Generate Oxapay invoice
      const invoiceResult = await generateInvoice(tier.price_usd);
      if (!invoiceResult) {
        throw new Error('Failed to generate payment invoice');
      }

      const { payLink, expiredAt, trackId } = JSON.parse(invoiceResult);
      // Enforce one-hour expiration window regardless of provider returned value
      const enforcedExpiry = new Date(Date.now() + 60 * 60 * 1000);

      // Save payment to database
      const [newPayment] = await db
        .insert(payments)
        .values({
          userId,
          amount: tier.price_usd.toString(),
          currency: 'USD',
          status: 'pending',
          oxapayTrackId: trackId,
          paymentLink: payLink,
          expiresAt: enforcedExpiry,
          paymentType: 'subscription',
        })
        .returning();

      return {
        payment: newPayment,
        paymentLink: payLink,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Mark any payments past their expires_at timestamp (still pending) as expired.
   * Does not delete rows – only updates status field.
   */
  static async expireOverduePending(): Promise<number> {
    try {
      // First, get the count of payments that need to be expired
      const pendingExpiredPayments = await db
        .select({ count: count() })
        .from(payments)
        .where(and(eq(payments.status, 'pending'), sql`${payments.expiresAt} <= NOW()`));

      const expiredCount = pendingExpiredPayments[0]?.count || 0;

      // Only update if there are payments to expire
      if (expiredCount > 0) {
        await db
          .update(payments)
          .set({ status: 'expired' })
          .where(and(eq(payments.status, 'pending'), sql`${payments.expiresAt} <= NOW()`));
      }

      return expiredCount;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create an invite purchase payment request
   */
  static async createInvitePayment(
    userId: number,
    inviteCount: number = 1,
  ): Promise<{ payment: Payment; paymentLink: string }> {
    try {
      const totalAmount = config.prices.INVITE * inviteCount;

      // Generate Oxapay invoice
      const invoiceResult = await generateInvoice(totalAmount);
      if (!invoiceResult) {
        throw new Error('Failed to generate payment invoice');
      }

      const { payLink, expiredAt, trackId } = JSON.parse(invoiceResult);
      // Enforce one-hour expiration window
      const enforcedExpiry = new Date(Date.now() + 60 * 60 * 1000);

      // Save payment to database
      const [newPayment] = await db
        .insert(payments)
        .values({
          userId,
          amount: totalAmount.toString(),
          currency: 'USD',
          status: 'pending',
          oxapayTrackId: trackId,
          paymentLink: payLink,
          expiresAt: enforcedExpiry,
          paymentType: 'invite_purchase',
          inviteCount,
        })
        .returning();

      return {
        payment: newPayment,
        paymentLink: payLink,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get payment by ID
   */
  static async getPaymentById(paymentId: number): Promise<Payment | null> {
    try {
      const payment = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);

      return payment[0] || null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get payment by track ID
   */
  static async getPaymentByTrackId(trackId: string): Promise<Payment | null> {
    try {
      const payment = await db
        .select()
        .from(payments)
        .where(eq(payments.oxapayTrackId, trackId))
        .limit(1);

      return payment[0] || null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get payment by track ID with user information
   */
  static async getPaymentByTrackIdWithUser(
    trackId: string,
  ): Promise<(Payment & { username?: string }) | null> {
    try {
      const payment = await db
        .select({
          id: payments.id,
          userId: payments.userId,
          subscriptionId: payments.subscriptionId,
          amount: payments.amount,
          currency: payments.currency,
          status: payments.status,
          oxapayTrackId: payments.oxapayTrackId,
          oxapayTxid: payments.oxapayTxid,
          paymentLink: payments.paymentLink,
          expiresAt: payments.expiresAt,
          paymentType: payments.paymentType,
          inviteCount: payments.inviteCount,
          createdAt: payments.createdAt,
          username: users.username,
        })
        .from(payments)
        .leftJoin(users, eq(payments.userId, users.id))
        .where(eq(payments.oxapayTrackId, trackId))
        .limit(1);

      const result = payment[0];
      if (!result) return null;

      return {
        ...result,
        username: result.username || undefined,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update payment status
   */
  static async updatePaymentStatus(
    paymentId: number,
    status: 'paid' | 'failed' | 'expired',
    txid?: string,
  ): Promise<void> {
    try {
      await db
        .update(payments)
        .set({
          status,
          oxapayTxid: txid,
        })
        .where(eq(payments.id, paymentId));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update payment status with notification logging
   */
  static async updatePaymentStatusWithLogging(
    paymentId: number,
    status: 'paid' | 'failed' | 'expired',
    txid?: string,
    notificationSent?: boolean,
  ): Promise<void> {
    try {
      await db
        .update(payments)
        .set({
          status,
          oxapayTxid: txid,
        })
        .where(eq(payments.id, paymentId));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get user payments
   */
  static async getUserPayments(userId: number): Promise<Payment[]> {
    try {
      const userPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.userId, userId))
        .orderBy(desc(payments.createdAt));

      return userPayments;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Verify payment status with Oxapay
   */
  static async verifyPayment(trackId: string): Promise<any> {
    try {
      return await txidLookup(trackId);
    } catch (error) {
      throw new Error('Failed to verify payment with Oxapay');
    }
  }

  /**
   * Get payment statistics for admin
   */
  static async getPaymentStats(): Promise<any> {
    try {
      const stats = await db
        .select({
          status: payments.status,
          count: count(),
          total_amount: sum(payments.amount),
          avg_amount: avg(payments.amount),
        })
        .from(payments)
        .groupBy(payments.status);

      return stats;
    } catch (error) {
      throw error;
    }
  }

  /** List payments with optional filters & pagination (admin) */
  static async listPayments(params: {
    status?: string;
    userId?: number;
    trackId?: string; // substring match
    paymentType?: string;
    dateFrom?: string; // ISO or YYYY-MM-DD
    dateTo?: string; // ISO or YYYY-MM-DD
    page?: number;
    pageSize?: number;
  }): Promise<{
    payments: Payment[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    try {
      const {
        status,
        userId,
        trackId,
        paymentType,
        dateFrom,
        dateTo,
        page = 1,
        pageSize = 25,
      } = params || {};

      const whereConditions: any[] = [];

      if (status) {
        whereConditions.push(eq(payments.status, status as any));
      }
      if (userId) {
        whereConditions.push(eq(payments.userId, userId));
      }
      if (trackId) {
        whereConditions.push(like(payments.oxapayTrackId, `%${trackId}%`));
      }
      if (paymentType) {
        whereConditions.push(eq(payments.paymentType, paymentType as any));
      }
      if (dateFrom) {
        // Normalize to start of day if only date provided
        const from = /T/.test(dateFrom) ? dateFrom : `${dateFrom} 00:00:00`;
        whereConditions.push(gte(payments.createdAt, new Date(from)));
      }
      if (dateTo) {
        const to = /T/.test(dateTo) ? dateTo : `${dateTo} 23:59:59`;
        whereConditions.push(lte(payments.createdAt, new Date(to)));
      }

      const offset = (page - 1) * pageSize;

      // Get payments with pagination
      const baseQuery = db
        .select({
          id: payments.id,
          userId: payments.userId,
          subscriptionId: payments.subscriptionId,
          amount: payments.amount,
          currency: payments.currency,
          status: payments.status,
          oxapayTrackId: payments.oxapayTrackId,
          oxapayTxid: payments.oxapayTxid,
          paymentLink: payments.paymentLink,
          expiresAt: payments.expiresAt,
          paymentType: payments.paymentType,
          inviteCount: payments.inviteCount,
          createdAt: payments.createdAt,
          username: users.username,
        })
        .from(payments)
        .leftJoin(users, eq(payments.userId, users.id));

      const paymentsList =
        whereConditions.length > 0
          ? await baseQuery
              .where(and(...whereConditions))
              .orderBy(desc(payments.createdAt))
              .limit(pageSize)
              .offset(offset)
          : await baseQuery.orderBy(desc(payments.createdAt)).limit(pageSize).offset(offset);

      // Get total count
      const countBaseQuery = db
        .select({ count: count() })
        .from(payments)
        .leftJoin(users, eq(payments.userId, users.id));

      const totalResult =
        whereConditions.length > 0
          ? await countBaseQuery.where(and(...whereConditions))
          : await countBaseQuery;
      const total = totalResult[0]?.count || 0;

      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      return { payments: paymentsList, total, page, pageSize, totalPages };
    } catch (error) {
      throw error;
    }
  }

  /** Top spenders by total paid amount */
  static async getTopSpenders(limit = 3): Promise<
    {
      user_id: number;
      username: string;
      total_spent: number;
      paid_invoices: number;
    }[]
  > {
    try {
      const topSpenders = await db
        .select({
          user_id: users.id,
          username: users.username,
          total_spent: sql<number>`SUM(${payments.amount}::numeric)`.as('total_spent'),
          paid_invoices: count(payments.id).as('paid_invoices'),
        })
        .from(payments)
        .innerJoin(users, eq(payments.userId, users.id))
        .where(eq(payments.status, 'paid'))
        .groupBy(users.id, users.username)
        .orderBy(desc(sql`SUM(${payments.amount}::numeric)`))
        .limit(limit);

      return topSpenders;
    } catch (error) {
      throw error;
    }
  }

  /** Revenue summary aggregates */
  static async getRevenueSummary(): Promise<any> {
    try {
      const fetchAgg = async (whereCondition: any) => {
        const result = await db
          .select({
            total: sql<number>`COALESCE(SUM(${payments.amount}::numeric), 0)`.as('total'),
            count: count(),
          })
          .from(payments)
          .where(and(eq(payments.status, 'paid'), whereCondition));

        return {
          total: Number(result[0]?.total || 0),
          count: Number(result[0]?.count || 0),
        };
      };

      const today = await fetchAgg(sql`DATE(${payments.createdAt}) = CURRENT_DATE`);
      const last7 = await fetchAgg(sql`${payments.createdAt} >= NOW() - INTERVAL '6 days'`);
      const last30 = await fetchAgg(sql`${payments.createdAt} >= NOW() - INTERVAL '29 days'`);
      const thisMonth = await fetchAgg(
        sql`DATE_TRUNC('month', ${payments.createdAt}) = DATE_TRUNC('month', NOW())`,
      );
      const prevMonth = await fetchAgg(
        sql`DATE_TRUNC('month', ${payments.createdAt}) = DATE_TRUNC('month', NOW()) - INTERVAL '1 month'`,
      );
      const statusBreakdown = await this.getPaymentStats();
      const topSpenders = await this.getTopSpenders(5);

      // All time
      const allTimeResult = await db
        .select({
          total: sql<number>`COALESCE(SUM(${payments.amount}::numeric), 0)`.as('total'),
          count: count(),
        })
        .from(payments)
        .where(eq(payments.status, 'paid'));

      const allTime = {
        total: Number(allTimeResult[0]?.total || 0),
        count: Number(allTimeResult[0]?.count || 0),
      };

      return {
        today,
        last7,
        last30,
        thisMonth,
        previousMonth: prevMonth,
        allTime,
        statusBreakdown,
        topSpenders,
      };
    } catch (error) {
      throw error;
    }
  }

  /** Revenue time series (daily) for last N days (default 30) */
  static async getRevenueTimeseries(rangeDays = 30): Promise<
    {
      day: string; // YYYY-MM-DD
      total: number;
      count: number;
    }[]
  > {
    try {
      const days = Math.max(1, Math.min(rangeDays, 120));
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - (days - 1));
      // Set to start of day to avoid timezone issues
      startDate.setHours(0, 0, 0, 0);

      const rows = await db
        .select({
          day: sql<string>`DATE(${payments.createdAt})`.as('day'),
          total: sql<number>`COALESCE(SUM(${payments.amount}::numeric), 0)`.as('total'),
          count: count(),
        })
        .from(payments)
        .where(
          and(eq(payments.status, 'paid'), sql`DATE(${payments.createdAt}) >= DATE(${startDate})`),
        )
        .groupBy(sql`DATE(${payments.createdAt})`)
        .orderBy(sql`DATE(${payments.createdAt})`);

      // Build full sequence and fill gaps
      const map = new Map<string, { total: number; count: number }>();
      rows.forEach((r: any) => {
        const total = typeof r.total === 'string' ? parseFloat(r.total) : Number(r.total);
        const count = typeof r.count === 'string' ? parseInt(r.count) : Number(r.count);

        // Fix: Properly format the database date to YYYY-MM-DD string
        let formattedDay: string;
        if (r.day instanceof Date) {
          // If it's a Date object, format it properly
          const yyyy = r.day.getFullYear();
          const mm = String(r.day.getMonth() + 1).padStart(2, '0');
          const dd = String(r.day.getDate()).padStart(2, '0');
          formattedDay = `${yyyy}-${mm}-${dd}`;
        } else if (typeof r.day === 'string') {
          // If it's already a string, check if it needs formatting
          if (r.day.includes('T')) {
            // It's an ISO string, extract the date part
            formattedDay = r.day.split('T')[0];
          } else {
            formattedDay = r.day;
          }
        } else {
          // Convert to string and extract date
          const dateObj = new Date(r.day);
          const yyyy = dateObj.getFullYear();
          const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
          const dd = String(dateObj.getDate()).padStart(2, '0');
          formattedDay = `${yyyy}-${mm}-${dd}`;
        }

        map.set(formattedDay, { total: isNaN(total) ? 0 : total, count: isNaN(count) ? 0 : count });
      });

      const out: { day: string; total: number; count: number }[] = [];
      const now = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const key = `${yyyy}-${mm}-${dd}`;
        const entry = map.get(key) || { total: 0, count: 0 };
        out.push({ day: key, total: entry.total, count: entry.count });
      }

      return out;
    } catch (error) {
      throw error;
    }
  }

  /** Get payments for a specific user (wrapper to existing) */
  static async getUserInvoices(userId: number) {
    return this.getUserPayments(userId);
  }

  /** Recent invoices (latest N) */
  static async getRecentInvoices(limit = 20): Promise<Payment[]> {
    try {
      const recentInvoices = await db
        .select()
        .from(payments)
        .orderBy(desc(payments.createdAt))
        .limit(limit);

      return recentInvoices;
    } catch (error) {
      throw error;
    }
  }
}
