import { fakerFA as faker } from "@faker-js/faker";
import { resolve } from "node:path";
import { clearHogHistory, loadHogHistory, saveHogHistory } from "./database";
import { editText, sendHogSequence, type SentMessage } from "./sender";

const imagePaths = [1, 2, 3, 4, 5].map((number) => resolve(process.cwd(), `assets/images/${number}.jpeg`));
const textMessageCount = 50;
const imageMessageCount = 10;
const messageConcurrencyPerGroup = 5;

type HogItem = { type: "text"; text: string } | { type: "image"; path: string };

export interface HogDeliveryResult {
  sentCount: number;
  failedGroups: Array<{ chatId: number; reason: string }>;
}

function createHogMessage(): string {
  const sentenceCount = faker.number.int({ min: 1, max: 5 });
  const words = Array.from({ length: sentenceCount }, () => faker.lorem.words({ min: 4, max: 12 }));
  return `${words.map((sentence) => `${sentence[0].toUpperCase()}${sentence.slice(1)}`).join(". ")}! 🐗`;
}

function createHogSequence(): HogItem[] {
  const sequence: HogItem[] = [
    ...Array.from({ length: textMessageCount }, () => ({ type: "text" as const, text: createHogMessage() })),
    ...Array.from({ length: imageMessageCount }, () => ({ type: "image" as const, path: faker.helpers.arrayElement(imagePaths) })),
  ];
  return faker.helpers.shuffle(sequence);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function editPreviousMessages(token: string): Promise<void> {
  const previousMessages = loadHogHistory().filter((item) => item.type === "text");
  const editCount = Math.min(
    previousMessages.length,
    faker.number.int({ min: 1, max: Math.max(1, Math.ceil(previousMessages.length * 0.2)) }),
  );
  const toEdit = faker.helpers.shuffle(previousMessages).slice(0, editCount);
  console.log(`Editing ${toEdit.length} randomly selected text messages from the previous hog command.`);

  for (const [index, previous] of toEdit.entries()) {
    try {
      await editText(token, previous.chatId, previous.messageId, `${createHogMessage()} (ویرایش شد)`);
      console.log(`Edited previous hog text ${index + 1}/${toEdit.length} in group ${previous.chatId}.`);
    } catch (error) {
      console.log(`Could not edit previous hog text ${index + 1}/${toEdit.length} in group ${previous.chatId}:`, error);
    }
  }
}

async function deliverToGroup(
  token: string,
  chatId: number,
  sequence: HogItem[],
  groupIndex: number,
  groupCount: number,
  onSent: (type: HogItem["type"], sentMessage: SentMessage) => void,
): Promise<void> {
  console.log(`Starting hog delivery to group ${chatId} (${groupIndex + 1}/${groupCount}).`);
  await sendHogSequence(token, chatId, sequence, (messageIndex, total, type, sentMessage) => {
    onSent(type, sentMessage);
    console.log(`Sent ${type} ${messageIndex}/${total} to group ${chatId} (${groupIndex + 1}/${groupCount}).`);
  }, messageConcurrencyPerGroup);
  console.log(`Finished hog delivery to group ${chatId}.`);
}

export async function deliverHogMessages(token: string, groupChatIds: number[]): Promise<HogDeliveryResult> {
  await editPreviousMessages(token);

  const sequence = createHogSequence();
  clearHogHistory();
  let sentCount = 0;
  const failedGroups: HogDeliveryResult["failedGroups"] = [];

  await Promise.all(groupChatIds.map(async (chatId, groupIndex) => {
    try {
      await deliverToGroup(token, chatId, sequence, groupIndex, groupChatIds.length, (type, sentMessage) => {
        sentCount += 1;
        saveHogHistory({ chatId, messageId: sentMessage.message_id, type });
      });
    } catch (error) {
      const reason = errorMessage(error);
      failedGroups.push({ chatId, reason });
      console.error(`Hog delivery to group ${chatId} failed: ${reason}`);
    }
  }));

  return { sentCount, failedGroups };
}
