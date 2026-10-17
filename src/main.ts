import "dotenv/config";
import { fakerFA as faker } from "@faker-js/faker";
import { resolve } from "node:path";
import { getUpdates, sendText, validateBot, sendHogSequence } from "./sender";

const hogGroupChatIds = [4865424919, 5333489797, 4580430571, 4934503252, 4862147712];
const imagePaths = [1, 2, 3, 4, 5].map((number) => resolve(process.cwd(), `assets/images/${number}.jpeg`));
const textMessageCount = 50;
const imageMessageCount = 10;

function createHogMessage(): string {
  const sentenceCount = faker.number.int({ min: 1, max: 5 });
  const words = Array.from({ length: sentenceCount }, () => faker.lorem.words({ min: 4, max: 12 }));
  return `${words.map((sentence) => `${sentence[0].toUpperCase()}${sentence.slice(1)}`).join(". ")}! 🐗`;
}

function createHogSequence(): Array<{ type: "text"; text: string } | { type: "image"; path: string }> {
  const sequence: Array<{ type: "text"; text: string } | { type: "image"; path: string }> = [
    ...Array.from({ length: textMessageCount }, () => ({ type: "text" as const, text: createHogMessage() })),
    ...Array.from({ length: imageMessageCount }, () => ({ type: "image" as const, path: faker.helpers.arrayElement(imagePaths) })),
  ];
  return faker.helpers.shuffle(sequence);
}

function isCommand(text: string, command: string): boolean {
  return new RegExp(`^/${command}(?:@\\w+)?(?:\\s|$)`, "i").test(text.trim());
}

async function main(): Promise<void> {
  const token = process.env.BALE_BOT_TOKEN?.trim();
  if (!token) throw new Error("Set BALE_BOT_TOKEN to the bot token.");
  console.log(`Connected bot ${await validateBot(token)}.`);

  let offset: number | undefined;
  while (true) {
    try {
      const updates = await getUpdates(token, offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        const message = update.message;
        if (!message?.text || message.from?.is_bot) continue;
        if (isCommand(message.text, "whoami") && message.from) {
          await sendText(token, message.chat.id, `اینم اطلاعاتت 😄\nشناسه کاربریت: ${message.from.id}\nشناسه گفتگوت: ${message.chat.id}${message.from.username ? `\nآیدی‌ت: @${message.from.username}` : ""}${message.from.first_name ? `\nاسمت: ${message.from.first_name}` : ""}`);
        } else if (isCommand(message.text, "start")) {
          await sendText(token, message.chat.id, "سلام رفیق! 👋\nمن ربات هاگم 🐗 با دستور /hog پنجاه تا پیام و ده تا عکس به همه گروه‌هایی که عضو آن‌ها هستم می‌فرستم 😄");
        } else if (isCommand(message.text, "hog") && message.from && message.chat.type === "private") {
          const sequence = createHogSequence();
          for (const groupChatId of hogGroupChatIds) {
            await sendHogSequence(token, groupChatId, sequence);
          }
          await sendText(token, message.chat.id, `پیام‌ها به ${hogGroupChatIds.length} گروه فرستاده شدن 😄`);
        } else if (/^hello[!.?]*$/i.test(message.text.trim())) {
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
