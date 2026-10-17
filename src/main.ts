import "dotenv/config";
import { fakerFA as faker } from "@faker-js/faker";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const baleApiBaseUrl = "https://tapi.bale.ai";
const pollIntervalSeconds = 30;
const hogUserChatIds = [247763148, 1400586842];
const imagePaths = [1, 2, 3, 4, 5].map((number) =>
  fileURLToPath(new URL(`../assets/images/${number}.jpeg`, import.meta.url)),
);
function createHogMessage(): string {
  const sentenceCount = faker.number.int({ min: 1, max: 5 });
  const words = Array.from({ length: sentenceCount }, () =>
    faker.lorem.words({ min: 4, max: 12 }),
  );
  return `${words.map((sentence) => `${sentence[0].toUpperCase()}${sentence.slice(1)}`).join(". ")}! 🐗`;
}

interface BaleUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
}

interface BaleChat {
  id: number;
  type?: string;
}

interface BaleMessage {
  message_id: number;
  text?: string;
  from?: BaleUser;
  chat: BaleChat;
}

interface BaleUpdate {
  update_id: number;
  message?: BaleMessage;
}

interface BaleApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

async function callBale<T>(token: string, method: string, body?: object): Promise<T> {
  const response = await fetch(`${baleApiBaseUrl}/bot${token}/${method}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(40_000),
  });

  if (!response.ok) {
    throw new Error(`Bale API ${method} failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as BaleApiResponse<T>;
  if (!payload.ok || payload.result === undefined) {
    throw new Error(`Bale API ${method} failed: ${payload.description ?? "unknown error"}`);
  }
  return payload.result;
}

async function sendText(token: string, chatId: number, text: string): Promise<void> {
  await callBale(token, "sendMessage", { chat_id: chatId, text });
}

async function sendImage(token: string, chatId: number, imagePath: string): Promise<void> {
  const image = await readFile(imagePath);
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("photo", new Blob([image], { type: "image/jpeg" }), imagePath.split(/[\\/]/).pop() ?? "image.jpeg");

  const response = await fetch(`${baleApiBaseUrl}/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) {
    throw new Error(`Bale API sendPhoto failed with HTTP ${response.status}`);
  }
  const payload = (await response.json()) as BaleApiResponse<unknown>;
  if (!payload.ok) {
    throw new Error(`Bale API sendPhoto failed: ${payload.description ?? "unknown error"}`);
  }
}

function createHogSequence(): Array<{ type: "text"; text: string } | { type: "image"; path: string }> {
  const sequence: Array<{ type: "text"; text: string } | { type: "image"; path: string }> = [
    ...Array.from({ length: 20 }, () => ({ type: "text" as const, text: createHogMessage() })),
    ...imagePaths.map((path) => ({ type: "image" as const, path })),
  ];
  return faker.helpers.shuffle(sequence);
}

function isHello(text: string): boolean {
  return /^hello[!.?]*$/i.test(text.trim());
}

function isWhoAmI(text: string): boolean {
  return /^\/whoami(?:@\w+)?(?:\s|$)/i.test(text.trim());
}

function isStart(text: string): boolean {
  return /^\/start(?:@\w+)?(?:\s|$)/i.test(text.trim());
}

function isHog(text: string): boolean {
  return /^\/hog(?:@\w+)?(?:\s|$)/i.test(text.trim());
}

async function main(): Promise<void> {
  const token = process.env.BALE_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("Set BALE_BOT_TOKEN to the token provided by Bale's BotFather.");
  }

  const bot = await callBale<BaleUser>(token, "getMe");
  console.log(`Connected to Bale bot ${bot.username ? `@${bot.username}` : bot.id}.`);

  let offset: number | undefined;
  while (true) {
    try {
      const query = new URLSearchParams({ timeout: String(pollIntervalSeconds) });
      if (offset !== undefined) query.set("offset", String(offset));
      const updates = await callBale<BaleUpdate[]>(token, `getUpdates?${query.toString()}`);

      for (const update of updates) {
        offset = update.update_id + 1;
        const message = update.message;
        if (!message?.text || message.from?.is_bot) continue;

        if (isWhoAmI(message.text) && message.from) {
          await sendText(token, message.chat.id, `اینم اطلاعاتت 😄\nشناسه کاربریت: ${message.from.id}\nشناسه گفتگوت: ${message.chat.id}${message.from.username ? `\nآیدی‌ت: @${message.from.username}` : ""}${message.from.first_name ? `\nاسمت: ${message.from.first_name}` : ""}`);
        } else if (isStart(message.text)) {
          await sendText(token, message.chat.id, "سلام رفیق! 👋\nمن ربات هاگم 🐗 با دستور /hog بیست تا پیام «هاگ!» واسه اون یکی کاربر می‌فرستم 😄");
        } else if (isHog(message.text) && message.from) {
          const recipients = hogUserChatIds.filter((chatId) => chatId !== message.from?.id);
          for (const recipientChatId of recipients) {
            for (const item of createHogSequence()) {
              if (item.type === "text") {
                await sendText(token, recipientChatId, item.text);
              } else {
                await sendImage(token, recipientChatId, item.path);
              }
            }
          }
          await sendText(token, message.chat.id, "پیام‌ها با موفقیت فرستاده شدن 😄");
        } else if (isHello(message.text)) {
          await sendText(token, message.chat.id, "سلام! 😄");
        }
      }
    } catch (error) {
      console.error("Bale polling failed:", error);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
