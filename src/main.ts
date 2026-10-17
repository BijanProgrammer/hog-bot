import "dotenv/config";

const baleApiBaseUrl = "https://tapi.bale.ai";
const pollIntervalSeconds = 30;

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

function isHello(text: string): boolean {
  return /^hello[!.?]*$/i.test(text.trim());
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

        if (isHello(message.text)) {
          await sendText(token, message.chat.id, "Hello!");
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
