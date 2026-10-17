import "dotenv/config";
import { deliverHogMessages } from "./hog-delivery";
import { editText, getUpdates, sendText, validateBot } from "./sender";

const hogGroupChatIds = [4865424919, 5333489797, 4580430571, 4934503252, 4862147712];

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
          await sendText(token, message.chat.id, "سلام رفیق! 👋\nمن ربات هاگم 🐗 با دستور /hog هفت پیام متنی و سه عکس با کپشن به همه گروه‌هایی که عضو آن‌ها هستم می‌فرستم و از هر گروه پنج پیام قبلی رو ویرایش می‌کنم 😄");
        } else if (isCommand(message.text, "hog") && message.from && message.chat.type === "private") {
          console.log(`/hog requested by user ${message.from.id} in chat ${message.chat.id}; starting delivery to ${hogGroupChatIds.length} groups.`);
          const statusMessage = await sendText(token, message.chat.id, "دارم پیام‌ها رو به گروه‌ها می‌فرستم؛ لطفاً منتظر بمونید… ⏳");
          try {
            const result = await deliverHogMessages(token, hogGroupChatIds);
            const failures = result.failedGroups.map(({ chatId }) => chatId);
            console.log(`Hog delivery complete: ${result.sentCount} messages sent; ${failures.length} groups failed.`);
            const summary = failures.length
              ? `ارسال تموم شد. ${result.sentCount} پیام فرستاده شد؛ گروه‌های ناموفق: ${failures.join("، ")}.`
              : `تموم شد! ${result.sentCount} پیام به ${hogGroupChatIds.length} گروه فرستاده شد 😄`;
            await editText(token, message.chat.id, statusMessage.message_id, summary);
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            console.log(`Hog delivery could not start: ${reason}`);
            try {
              await editText(token, message.chat.id, statusMessage.message_id, `ارسال کامل نشد. لطفاً لاگ کنسول رو بررسی کنید. خطا: ${reason}`);
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
