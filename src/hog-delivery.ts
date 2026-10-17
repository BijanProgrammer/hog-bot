import { fakerFA as faker } from "@faker-js/faker";
import { resolve } from "node:path";
import { clearHogHistory, loadHogHistory, saveHogHistory } from "./database";
import { editPhotoCaption, editText, sendHogSequence, type SentMessage } from "./sender";

const imagePaths = [1, 2, 3, 4, 5].map((number) => resolve(process.cwd(), `assets/images/${number}.jpeg`));
const textMessageCount = 15;
const imageMessageCount = 5;
const messageConcurrencyPerGroup = 5;
const recentMessageCandidateLimitPerGroup = 50;
const previousMessageEditCountPerGroup = 5;

type HogItem = { type: "text"; text: string } | { type: "image"; path: string; caption: string };

export interface HogDeliveryResult {
  sentCount: number;
  failedGroups: Array<{ chatId: number; reason: string }>;
}

function createHogText(sentenceCount: { min: number; max: number }): string {
  const count = faker.number.int(sentenceCount);
  const words = Array.from({ length: count }, () => faker.lorem.words({ min: 4, max: 12 }));
  return `${words.map((sentence) => `${sentence[0].toUpperCase()}${sentence.slice(1)}`).join(". ")}! 🐗`;
}

function createHogSequence(): HogItem[] {
  const sequence: HogItem[] = [
    ...Array.from({ length: textMessageCount }, () => ({ type: "text" as const, text: createHogText({ min: 2, max: 5 }) })),
    ...Array.from({ length: imageMessageCount }, () => ({
      type: "image" as const,
      path: faker.helpers.arrayElement(imagePaths),
      caption: createHogText({ min: 1, max: 5 }),
    })),
  ];
  return faker.helpers.shuffle(sequence);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function editPreviousMessages(token: string): Promise<void> {
  const previousByGroup = Map.groupBy(
    loadHogHistory(),
    (item) => item.chatId,
  );

  for (const [chatId, messages] of previousByGroup) {
    const recentMessages = messages.slice(0, recentMessageCandidateLimitPerGroup);
    const toEdit = faker.helpers.shuffle(recentMessages).slice(0, previousMessageEditCountPerGroup);
    console.log(`Editing ${toEdit.length} randomly selected messages from the ${recentMessages.length} most recent candidates in group ${chatId}.`);

    for (const [index, previous] of toEdit.entries()) {
      try {
        const replacement = previous.type === "text"
          ? createHogText({ min: 2, max: 5 })
          : createHogText({ min: 1, max: 5 });
        if (previous.type === "text") {
          await editText(token, previous.chatId, previous.messageId, `${replacement} (ویرایش شد)`);
        } else {
          await editPhotoCaption(token, previous.chatId, previous.messageId, `${replacement} (ویرایش شد)`);
        }
        console.log(`Edited previous hog message ${index + 1}/${toEdit.length} in group ${previous.chatId}.`);
      } catch (error) {
        console.log(`Could not edit previous hog message ${index + 1}/${toEdit.length} in group ${previous.chatId}:`, error);
      }
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
