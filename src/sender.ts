import { readFile } from "node:fs/promises";

const baleApiBaseUrl = "https://tapi.bale.ai";
const messageRetryCount = 3;

async function retryMessageSend<T>(send: () => Promise<T>, description: string): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await send();
    } catch (error) {
      if (attempt > messageRetryCount) throw error;
      console.warn(`[hog-send] ${description} failed (attempt ${attempt}/${messageRetryCount + 1}); retrying: ${describeError(error)}`);
    }
  }
}

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
interface BaleApiResponse<T> { ok: boolean; result?: T; description?: string; error_code?: number }

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

async function readApiResponse<T>(response: Response, method: string): Promise<T> {
  const responseText = await response.text();
  let payload: BaleApiResponse<T> | undefined;
  try {
    payload = JSON.parse(responseText) as BaleApiResponse<T>;
  } catch {
    // Non-JSON response bodies are included below for diagnosing upstream/proxy failures.
  }

  if (!response.ok) {
    const detail = payload?.description ?? responseText.slice(0, 1000) ?? "empty response body";
    const errorCode = payload?.error_code === undefined ? "" : ` (Bale error ${payload.error_code})`;
    throw new Error(`Bale API ${method} failed with HTTP ${response.status} ${response.statusText}${errorCode}: ${detail || "empty response body"}`);
  }
  if (!payload?.ok || payload.result === undefined) {
    throw new Error(`Bale API ${method} returned an unsuccessful response: ${payload?.description ?? (responseText.slice(0, 1000) || "empty or invalid response body")}`);
  }
  return payload.result;
}

export async function validateBot(token: string): Promise<string> {
  const bot = await callBale<BaleUser>(token, "getMe");
  return bot.username ? `@${bot.username}` : String(bot.id);
}

async function callBale<T>(token: string, method: string, body?: object): Promise<T> {
  const url = `${baleApiBaseUrl}/bot${token}/${method}`;
  const startedAt = Date.now();
  console.log(`[bale] ${body === undefined ? "GET" : "POST"} ${method} started`);
  try {
    const response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(40_000),
    });
    const result = await readApiResponse<T>(response, method.split("?")[0] ?? method);
    console.log(`[bale] ${method.split("?")[0]} succeeded (HTTP ${response.status}, ${Date.now() - startedAt} ms)`);
    return result;
  } catch (error) {
    console.error(`[bale] ${method.split("?")[0]} failed after ${Date.now() - startedAt} ms: ${describeError(error)}`);
    throw error;
  }
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

      const startedAt = Date.now();
      console.log(`[hog-send] Starting ${item.type} ${index + 1}/${sequence.length} for group ${chatId}.`);
      try {
        const sentMessage = await retryMessageSend(
          () => item.type === "text"
            ? sendText(token, chatId, item.text)
            : sendPhoto(token, chatId, item.path, item.caption),
          `${item.type} ${index + 1}/${sequence.length} for group ${chatId}`,
        );
        await onSent?.(index + 1, sequence.length, item.type, sentMessage);
        console.log(`[hog-send] Sent ${item.type} ${index + 1}/${sequence.length} to group ${chatId} (message ${sentMessage.message_id}, ${Date.now() - startedAt} ms).`);
      } catch (error) {
        if (!stopped) firstError = error;
        console.error(`[hog-send] ${item.type} ${index + 1}/${sequence.length} failed for group ${chatId} after ${Date.now() - startedAt} ms: ${describeError(error)}`);
        stopped = true;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.floor(concurrency)) }, () => sendNext()));
  if (stopped) throw firstError;
}

async function sendPhoto(token: string, chatId: number, path: string, caption: string): Promise<SentMessage> {
  const startedAt = Date.now();
  console.log(`[bale] sendPhoto preparing upload for group ${chatId} from ${path}`);
  const image = await readFile(path);
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("photo", new Blob([image], { type: "image/jpeg" }), path.split(/[\\/]/).pop() ?? "image.jpeg");
  form.set("caption", caption);
  console.log(`[bale] POST sendPhoto started for group ${chatId} (image ${image.byteLength} bytes)`);
  try {
    // Native FormData generates its own multipart boundary; setting Content-Type here
    // would omit/mismatch that boundary and can make Bale fail while reading file bytes.
    const response = await fetch(`${baleApiBaseUrl}/bot${token}/sendPhoto`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(40_000),
    });
    const result = await readApiResponse<SentMessage>(response, "sendPhoto");
    console.log(`[bale] sendPhoto succeeded for group ${chatId} (HTTP ${response.status}, ${Date.now() - startedAt} ms)`);
    return result;
  } catch (error) {
    console.error(`[bale] sendPhoto failed for group ${chatId} after ${Date.now() - startedAt} ms: ${describeError(error)}`);
    throw error;
  }
}
