import "dotenv/config";
import { fakerFA as faker } from "@faker-js/faker";
import { resolve } from "node:path";
import { editText, getUpdates, sendText, validateBot, sendHogSequence } from "./sender";

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
          console.log(`/hog requested by user ${message.from.id} in chat ${message.chat.id}; starting delivery to ${hogGroupChatIds.length} groups.`);
          const statusMessage = await sendText(token, message.chat.id, "دارم پیام‌ها رو به گروه‌ها می‌فرستم؛ لطفاً منتظر بمونید… ⏳");
          let sentCount = 0;
          try {
            const sequence = createHogSequence();
            for (const [groupIndex, groupChatId] of hogGroupChatIds.entries()) {
              console.log(`Starting hog delivery to group ${groupChatId} (${groupIndex + 1}/${hogGroupChatIds.length}).`);
              await sendHogSequence(token, groupChatId, sequence, (messageIndex, total, type) => {
                sentCount += 1;
                console.log(`Sent ${type} ${messageIndex}/${total} to group ${groupChatId} (${groupIndex + 1}/${hogGroupChatIds.length}); total sent: ${sentCount}/${hogGroupChatIds.length * total}.`);
              });
              console.log(`Finished hog delivery to group ${groupChatId}.`);
            }
            console.log(`Hog delivery complete: ${sentCount} messages sent to ${hogGroupChatIds.length} groups.`);
            await editText(token, message.chat.id, statusMessage.message_id, `تموم شد! ${sentCount} پیام به ${hogGroupChatIds.length} گروه فرستاده شد 😄`);
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            console.log(`Hog delivery failed after ${sentCount} successful sends: ${reason}`);
            try {
              await editText(token, message.chat.id, statusMessage.message_id, `ارسال کامل نشد. ${sentCount} پیام فرستاده شد و بعد خطا پیش اومد. لطفاً لاگ کنسول رو بررسی کنید. خطا: ${reason}`);
            } catch (editError) {
              console.log("Could not update the hog status message:", editError);
            }
          }
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
