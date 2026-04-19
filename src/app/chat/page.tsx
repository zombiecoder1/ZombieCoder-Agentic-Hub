"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { MessageSquare, Plus, Send, Trash2 } from "lucide-react";

type Role = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  timestamp: string;
};

type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  backendSessionId?: string;
  messages: ChatMessage[];
};

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function PublicChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([
    { id: uid(), title: "New Chat", createdAt: new Date().toISOString(), messages: [] },
  ]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => sessions[0]?.id ?? "");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) ?? sessions[0],
    [sessions, currentSessionId],
  );

  const createSession = () => {
    const s: ChatSession = {
      id: uid(),
      title: "New Chat",
      createdAt: new Date().toISOString(),
      messages: [],
    };
    setSessions((prev) => [s, ...prev]);
    setCurrentSessionId(s.id);
  };

  const removeSession = (id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) {
        const fallback: ChatSession = {
          id: uid(),
          title: "New Chat",
          createdAt: new Date().toISOString(),
          messages: [],
        };
        setCurrentSessionId(fallback.id);
        return [fallback];
      }
      if (currentSessionId === id) setCurrentSessionId(next[0].id);
      return next;
    });
  };

  const updateSession = (sessionId: string, updater: (s: ChatSession) => ChatSession) => {
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? updater(s) : s)));
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !currentSession || loading) return;

    setInput("");
    setLoading(true);

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    const assistantId = uid();
    updateSession(currentSession.id, (s) => ({
      ...s,
      title: s.messages.length === 0 ? text.slice(0, 28) : s.title,
      messages: [
        ...s.messages,
        userMsg,
        { id: assistantId, role: "assistant", content: "", timestamp: new Date().toISOString() },
      ],
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text }],
          sessionId: currentSession.backendSessionId,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const lines = block.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event: "));
          const dataLine = lines.find((l) => l.startsWith("data: "));
          const event = eventLine ? eventLine.slice(7).trim() : "message";
          const payload = dataLine ? JSON.parse(dataLine.slice(6)) : {};

          if (event === "session" && payload?.sessionId) {
            updateSession(currentSession.id, (s) => ({ ...s, backendSessionId: payload.sessionId as string }));
          }

          if (event === "chunk" && payload?.content) {
            const delta = String(payload.content);
            updateSession(currentSession.id, (s) => ({
              ...s,
              messages: s.messages.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m)),
            }));
          }

          if (event === "error") {
            throw new Error(payload?.error ? String(payload.error) : "Streaming error");
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      updateSession(currentSession.id, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === assistantId ? { ...m, content: `Sorry, failed to get a response.\n${message}` } : m,
        ),
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <aside className="hidden w-72 border-r border-zinc-800 bg-zinc-900/70 p-4 md:flex md:flex-col">
        <Button onClick={createSession} className="justify-start gap-2">
          <Plus className="size-4" /> New Chat
        </Button>
        <div className="mt-4 space-y-2 overflow-y-auto">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group w-full rounded-lg p-3 text-left transition ${s.id === currentSessionId ? "bg-zinc-700" : "hover:bg-zinc-800"}`}
            >
              <p className="truncate text-sm font-semibold">{s.title}</p>
              <p className="mt-1 text-xs text-zinc-400">{new Date(s.createdAt).toLocaleDateString()}</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => setCurrentSessionId(s.id)}
                  className="inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-white"
                >
                  <MessageSquare className="size-3" /> Open
                </button>
                <button
                  onClick={() => removeSession(s.id)}
                  className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-red-400"
                >
                  <Trash2 className="size-3" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <MessageSquare className="size-5 text-sky-400" />
          <h1 className="text-sm font-black tracking-widest">PUBLIC CHAT</h1>
        </header>

        <ScrollArea className="flex-1 px-4 py-6">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            {currentSession?.messages.length ? (
              currentSession.messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <Card className={`max-w-[85%] px-4 py-3 ${m.role === "user" ? "bg-sky-600 text-white" : "bg-zinc-800 text-zinc-100"}`}>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content || (loading ? "Thinking..." : "")}</p>
                  </Card>
                </div>
              ))
            ) : (
              <div className="mx-auto mt-20 text-center text-zinc-400">
                <p className="text-lg font-semibold">Start a public chat</p>
                <p className="mt-2 text-sm">Send the first message to begin.</p>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-zinc-800 p-4">
          <div className="mx-auto flex max-w-4xl gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              disabled={loading}
              placeholder="Write your message..."
              className="h-11 border-zinc-700 bg-zinc-900"
            />
            <Button onClick={() => void sendMessage()} disabled={loading || !input.trim()} className="h-11 gap-2">
              <Send className="size-4" /> Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
