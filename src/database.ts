import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface HogHistoryMessage {
  chatId: number;
  messageId: number;
  type: "text" | "image";
}

const database = new DatabaseSync(resolve(process.cwd(), "hog-history.sqlite"));

database.exec(`
  CREATE TABLE IF NOT EXISTS hog_messages (
    chat_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('text', 'image')),
    PRIMARY KEY (chat_id, message_id)
  )
`);

const selectHogHistory = database.prepare(
  "SELECT chat_id AS chatId, message_id AS messageId, message_type AS type FROM hog_messages",
);
const insertHogHistory = database.prepare(
  "INSERT OR REPLACE INTO hog_messages (chat_id, message_id, message_type) VALUES (?, ?, ?)",
);

export function loadHogHistory(): HogHistoryMessage[] {
  return selectHogHistory.all() as Array<{
    chatId: number;
    messageId: number;
    type: HogHistoryMessage["type"];
  }>;
}

export function clearHogHistory(): void {
  database.exec("DELETE FROM hog_messages");
}

export function saveHogHistory(message: HogHistoryMessage): void {
  insertHogHistory.run(message.chatId, message.messageId, message.type);
}
