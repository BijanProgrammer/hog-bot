import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface HogHistoryMessage {
  chatId: number;
  messageId: number;
  type: "text" | "image";
  createdAt: string;
  updatedAt: string;
}

const database = new DatabaseSync(resolve(process.cwd(), "hog-history.sqlite"));

database.exec(`
  CREATE TABLE IF NOT EXISTS hog_messages (
    chat_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('text', 'image')),
    created_at TEXT,
    updated_at TEXT,
    PRIMARY KEY (chat_id, message_id)
  )
`);

let hogMessageColumns = database.prepare("PRAGMA table_info(hog_messages)").all() as Array<{ name: string }>;
if (!hogMessageColumns.some((column) => column.name === "created_at")) {
  database.exec("ALTER TABLE hog_messages ADD COLUMN created_at TEXT");
}
if (!hogMessageColumns.some((column) => column.name === "updated_at")) {
  database.exec("ALTER TABLE hog_messages ADD COLUMN updated_at TEXT");
}
hogMessageColumns = database.prepare("PRAGMA table_info(hog_messages)").all() as Array<{ name: string }>;
const hasSentAtColumn = hogMessageColumns.some((column) => column.name === "sent_at");
if (hasSentAtColumn) {
  database.exec(`
    UPDATE hog_messages
    SET created_at = COALESCE(created_at, sent_at, CURRENT_TIMESTAMP),
        updated_at = COALESCE(updated_at, sent_at, created_at, CURRENT_TIMESTAMP)
    WHERE created_at IS NULL OR updated_at IS NULL
  `);
} else {
  database.exec(`
    UPDATE hog_messages
    SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
        updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
    WHERE created_at IS NULL OR updated_at IS NULL
  `);
}

const selectHogHistory = database.prepare(
  "SELECT chat_id AS chatId, message_id AS messageId, message_type AS type, created_at AS createdAt, updated_at AS updatedAt FROM hog_messages ORDER BY created_at DESC, rowid DESC",
);
const insertHogHistory = database.prepare(
  `INSERT INTO hog_messages (chat_id, message_id, message_type, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT (chat_id, message_id) DO UPDATE SET
     message_type = excluded.message_type,
     updated_at = excluded.updated_at`,
);

export function loadHogHistory(): HogHistoryMessage[] {
  return selectHogHistory.all() as Array<{
    chatId: number;
    messageId: number;
    type: HogHistoryMessage["type"];
    createdAt: string;
    updatedAt: string;
  }>;
}

export function clearHogHistory(): void {
  database.exec("DELETE FROM hog_messages");
}

export function saveHogHistory(message: Omit<HogHistoryMessage, "createdAt" | "updatedAt">): void {
  const timestamp = new Date().toISOString();
  insertHogHistory.run(message.chatId, message.messageId, message.type, timestamp, timestamp);
}
