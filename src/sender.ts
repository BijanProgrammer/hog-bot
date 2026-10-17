const baleApiBaseUrl = "https://tapi.bale.ai";

export interface BaleUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
}

export interface BaleMessage {
  message_id: number;
  text?: string;
  from?: BaleUser;
  chat: { id: number; type?: string };
}
export interface SentMessage { message_id: number }

interface BaleUpdate { update_id: number; message?: BaleMessage }
export interface BaleChat { id: number; type?: string; title?: string }
interface BaleApiResponse<T> { ok: boolean; result?: T; description?: string }

export async function validateBot(token: string): Promise<string> {
  const bot = await callBale<BaleUser>(token, "getMe");
  return bot.username ? `@${bot.username}` : String(bot.id);
}

async function callBale<T>(token: string, method: string, body?: object): Promise<T> {
  const response = await fetch(`${baleApiBaseUrl}/bot${token}/${method}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) throw new Error(`Bale API ${method} failed with HTTP ${response.status}`);
  const payload = (await response.json()) as BaleApiResponse<T>;
  if (!payload.ok || payload.result === undefined) {
    throw new Error(`Bale API ${method} failed: ${payload.description ?? "unknown error"}`);
  }
  return payload.result;
}

export async function sendText(token: string, chatId: number, text: string): Promise<SentMessage> {
  return callBale(token, "sendMessage", { chat_id: chatId, text });
}

export async function editText(token: string, chatId: number, messageId: number, text: string): Promise<void> {
  await callBale(token, "editMessageText", { chat_id: chatId, message_id: messageId, text });
}

export async function editPhotoCaption(token: string, chatId: number, messageId: number, caption: string): Promise<void> {
  await callBale(token, "editMessageCaption", { chat_id: chatId, message_id: messageId, caption });
}

export async function getUpdates(token: string, offset?: number): Promise<BaleUpdate[]> {
  const query = new URLSearchParams({ timeout: "30" });
  if (offset !== undefined) query.set("offset", String(offset));
  return callBale(token, `getUpdates?${query.toString()}`);
}

import { readFile } from "node:fs/promises";


export async function sendHogSequence(token: string, chatId: number, sequence: Array<{ type: "text"; text: string } | { type: "image"; path: string }>, onSent?: (index: number, total: number, type: "text" | "image", sentMessage: SentMessage) => void | Promise<void>): Promise<void> {
  for (const [index, item] of sequence.entries()) {
    if (item.type === "text") {
      const sentMessage = await sendText(token, chatId, item.text);
      await onSent?.(index + 1, sequence.length, item.type, sentMessage);
      continue;
    }
    const image = await readFile(item.path);
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("photo", new Blob([image], { type: "image/jpeg" }), item.path.split(/[\\/]/).pop() ?? "image.jpeg");
    const response = await fetch(`${baleApiBaseUrl}/bot${token}/sendPhoto`, { method: "POST", body: form, signal: AbortSignal.timeout(40_000) });
    if (!response.ok) throw new Error(`Bale API sendPhoto failed with HTTP ${response.status}`);
    const payload = (await response.json()) as BaleApiResponse<unknown>;
    if (!payload.ok || !payload.result) throw new Error(`Bale API sendPhoto failed: ${payload.description ?? "unknown error"}`);
    await onSent?.(index + 1, sequence.length, item.type, payload.result as SentMessage);
  }
}
