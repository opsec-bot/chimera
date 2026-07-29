import axios from 'axios';
import { TelegramResetService } from './resetService';
import { TelegramLinkService } from './linkService';
import { Logger } from '../../utils/logger';
import { db } from '../../db/connection';
import { eq } from 'drizzle-orm';
import { telegramResetRuntime } from '../../db/schema/other';

interface WorkerState {
  running: boolean;
  lastUpdateId: number | null;
  startedAt: number | null;
  lastPollAt: number | null;
  errors: number;
  processed_requests: number;
}

const state: WorkerState = {
  running: false,
  lastUpdateId: null,
  startedAt: null,
  lastPollAt: null,
  errors: 0,
  processed_requests: 0,
};

let loopPromise: Promise<void> | null = null;

export function getResetBotStatus() {
  const now = Date.now();
  const uptime = state.startedAt ? Math.floor((now - state.startedAt) / 1000) : 0;

  return {
    ...state,
    startedAt: state.startedAt ? new Date(state.startedAt).toISOString() : null,
    lastPollAt: state.lastPollAt ? new Date(state.lastPollAt).toISOString() : null,
    uptime,
  };
}

export async function startResetBot(): Promise<boolean> {
  if (state.running) return true;
  const cfg = await TelegramResetService.getConfig();
  if (!cfg.enabled || !cfg.bot_token) throw new Error('Reset bot not configured or not enabled');
  state.running = true;
  state.startedAt = Date.now();
  state.errors = 0;
  state.processed_requests = 0;
  // persist desired state
  await db
    .update(telegramResetRuntime)
    .set({ shouldRun: true, updatedAt: new Date() })
    .where(eq(telegramResetRuntime.id, 1));
  loopPromise = runLoop(cfg.bot_token);
  Logger.debug('Password reset bot polling started');
  return true;
}

export async function stopResetBot(): Promise<boolean> {
  if (!state.running) return true;
  state.running = false;
  await db
    .update(telegramResetRuntime)
    .set({ shouldRun: false, updatedAt: new Date() })
    .where(eq(telegramResetRuntime.id, 1));
  Logger.debug('Password reset bot polling stopping...');
  return true;
}

async function runLoop(botToken: string) {
  while (state.running) {
    try {
      state.lastPollAt = Date.now();
      const params: any = { timeout: 25, allowed_updates: ['message'] };
      if (state.lastUpdateId !== null) params.offset = state.lastUpdateId + 1;
      const r = await axios.get(`https://api.telegram.org/bot${botToken}/getUpdates`, {
        params,
        timeout: 30000,
      });
      if (r.data?.ok && Array.isArray(r.data.result)) {
        for (const upd of r.data.result) {
          state.lastUpdateId = upd.update_id;
          await handleUpdate(botToken, upd);
        }
      } else {
        Logger.warn('Reset bot polling unexpected response', { data: r.data });
      }
    } catch (e: any) {
      state.errors += 1;
      Logger.warn('Reset bot polling error', { error: e.message });
      await delay(Math.min(10000, 1000 * state.errors));
    }
  }
}

async function handleUpdate(botToken: string, update: any) {
  if (!update.message) return;
  const msg = update.message;
  const chatId = msg.chat?.id;
  const text: string = (msg.text || '').trim();
  if (!chatId || !text.startsWith('/')) return; // only commands

  // Increment processed requests counter for valid commands
  state.processed_requests += 1;

  if (text === '/start' || text === '/help') {
    await sendMessage(
      botToken,
      chatId,
      '👋 This bot delivers password reset codes. Use /link <code> after generating a link code from your account security settings.',
    );
    return;
  }

  if (text.startsWith('/link')) {
    const parts = text.split(/\s+/);
    const code = parts[1];
    if (!code) {
      await sendMessage(
        botToken,
        chatId,
        'Usage: /link <code>. Generate the code in your account security tab.',
      );
      return;
    }
    try {
      const consumed = await TelegramLinkService.consumeLinkCode(code);
      if (!consumed) {
        await sendMessage(botToken, chatId, 'Invalid or expired link code.');
        return;
      }
      let username = msg.from?.username || null;
      await TelegramLinkService.saveLink(consumed.user_id, String(chatId), username || undefined);
      await sendMessage(botToken, chatId, `Telegram account linked. User ID: ${chatId}`);
    } catch (e: any) {
      const errMsg = e?.message || '';
      if (/already linked/i.test(errMsg)) {
        await sendMessage(
          botToken,
          chatId,
          'This Telegram account is already linked to another user account.',
        );
      } else {
        await sendMessage(botToken, chatId, '⚠️ Failed to link. Try again later.');
      }
    }
    return;
  }
}

async function sendMessage(botToken: string, chatId: number | string, text: string) {
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text,
    });
  } catch (e: any) {
    Logger.warn('Reset bot send message failed', { error: e.message });
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
