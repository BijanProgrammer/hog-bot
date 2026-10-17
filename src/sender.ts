import { readFile } from "node:fs/promises";

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

export async function sendHogSequence(
  token: string,
  chatId: number,
  sequence: Array<{ type: "text"; text: string } | { type: "image"; path: string; caption: string }>,
  onSent?: (index: number, total: number, type: "text" | "image", sentMessage: SentMessage) => void | Promise<void>,
  concurrency = 1,
): Promise<void> {
  let nextIndex = 0;
  let stopped = false;
  let firstError: unknown;

  async function sendNext(): Promise<void> {
    while (!stopped) {
      const index = nextIndex;
      nextIndex += 1;
      const item = sequence[index];
      if (!item) return;

      try {
        const sentMessage = item.type === "text"
          ? await sendText(token, chatId, item.text)
          : await sendPhoto(token, chatId, item.path, item.caption);
        await onSent?.(index + 1, sequence.length, item.type, sentMessage);
      } catch (error) {
        if (!stopped) firstError = error;
        stopped = true;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.floor(concurrency)) }, () => sendNext()));
  if (stopped) throw firstError;
}

async function sendPhoto(token: string, chatId: number, path: string, caption: string): Promise<SentMessage> {
  const image = await readFile(path);
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("photo", new Blob([image], { type: "image/jpeg" }), path.split(/[\\/]/).pop() ?? "image.jpeg");
  form.set("caption", caption);
  const response = await fetch(`${baleApiBaseUrl}/bot${token}/sendPhoto`, { method: "POST", body: form, signal: AbortSignal.timeout(40_000) });
  if (!response.ok) throw new Error(`Bale API sendPhoto failed with HTTP ${response.status}`);
  const payload = (await response.json()) as BaleApiResponse<SentMessage>;
  if (!payload.ok || !payload.result) throw new Error(`Bale API sendPhoto failed: ${payload.description ?? "unknown error"}`);
  return payload.result;
}
