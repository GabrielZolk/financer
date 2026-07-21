import type { ChatMsg } from "@/lib/aiChat";

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMsg[];
  updatedAt: number;
}

const KEY = "fin.chats";
const OLD_KEY = "fin.chat"; // versão antiga: uma conversa só

function read(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Conversation[];
  } catch {
    /* ignore */
  }
  // migra a conversa única antiga, se houver
  try {
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const msgs = JSON.parse(old) as ChatMsg[];
      localStorage.removeItem(OLD_KEY);
      if (Array.isArray(msgs) && msgs.length) {
        const conv: Conversation = {
          id: newId(),
          title: titleFrom(msgs),
          messages: msgs,
          updatedAt: Date.now(),
        };
        write([conv]);
        return [conv];
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

function write(list: Conversation[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function titleFrom(messages: ChatMsg[]): string {
  const first = messages.find((m) => m.role === "user")?.content ?? "";
  return first.trim().slice(0, 40) || "Conversa";
}

/** Conversas ordenadas da mais recente pra mais antiga. */
export function listConversations(): Conversation[] {
  return read().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversation(id: string): Conversation | undefined {
  return read().find((c) => c.id === id);
}

/** Salva (cria ou atualiza) uma conversa a partir das mensagens. */
export function saveConversation(id: string, messages: ChatMsg[]): void {
  const list = read();
  const idx = list.findIndex((c) => c.id === id);
  const conv: Conversation = {
    id,
    title: titleFrom(messages),
    messages,
    updatedAt: Date.now(),
  };
  if (idx >= 0) list[idx] = conv;
  else list.push(conv);
  write(list);
}

export function deleteConversation(id: string): void {
  write(read().filter((c) => c.id !== id));
}
