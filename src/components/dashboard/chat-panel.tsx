"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Send,
  Bot,
  User,
  Loader2,
  Zap,
  Clock,
  Hash,
  Trash2,
  MessageSquare,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
  tokens?: number;
  latency?: number;
}

interface AgentOption {
  id: string;
  name: string;
}

interface ProviderOption {
  id: string;
  name: string;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [agentId, setAgentId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [sending, setSending] = useState(false);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fetchOptions = useCallback(async () => {
    try {
      const [agentsRes, providersRes] = await Promise.allSettled([
        fetch("/api/agents"),
        fetch("/api/providers"),
      ]);
      if (agentsRes.status === "fulfilled" && agentsRes.value.ok) {
        const json = await agentsRes.value.json();
        const list = json.data || json || [];
        setAgents(
          list.map((a: AgentOption) => ({ id: a.id, name: a.name }))
        );
        if (list.length > 0 && !agentId) {
          setAgentId(list[0].id);
        }
      }
      if (providersRes.status === "fulfilled" && providersRes.value.ok) {
        const json = await providersRes.value.json();
        const list = json.data || json || [];
        setProviders(
          list.map((p: ProviderOption) => ({ id: p.id, name: p.name }))
        );
        if (list.length > 0 && !providerId) {
          setProviderId(list[0].id);
        }
      }
    } catch {
      // Silently fail
    }
  }, [agentId, providerId]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: input.trim() }],
          agentId: agentId || undefined,
          providerId: providerId || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const response = data.data || data;
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: response.content || response.response || response.message || "No response received.",
          timestamp: response.timestamp || new Date().toISOString(),
          tokens: response.tokenCount || response.tokens,
          latency: response.latencyMs || response.latency,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        const err = await res.json();
        const errorMsg: ChatMessage = {
          role: "system",
          content: `Error: ${err.error || "Failed to send message"}`,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        toast.error(err.error || "Failed to send message");
      }
    } catch {
      const errorMsg: ChatMessage = {
        role: "system",
        content: "Error: Network error — could not reach the server.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      toast.error("Network error");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Chat Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[150px] max-w-[250px]">
          <Bot className="size-4 text-emerald-400 shrink-0" />
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Select agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id} className="text-xs">
                  {a.name}
                </SelectItem>
              ))}
              {agents.length === 0 && (
                <SelectItem value="none" disabled>
                  No agents available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[150px] max-w-[250px]">
          <Zap className="size-4 text-amber-400 shrink-0" />
          <Select value={providerId} onValueChange={setProviderId}>
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
              {providers.length === 0 && (
                <SelectItem value="none" disabled>
                  No providers available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearChat}
          className="text-xs text-muted-foreground hover:text-red-400"
        >
          <Trash2 className="size-3.5" />
          Clear
        </Button>
      </div>

      {/* Messages Area */}
      <Card className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1">
          <div ref={scrollRef} className="p-4 space-y-4 min-h-[300px]">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <MessageSquare className="size-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">No messages yet</p>
                <p className="text-xs mt-1">
                  Select an agent and provider, then start chatting
                </p>
              </div>
            ) : (
              <AnimatePresence>
                {messages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                    className={`flex gap-3 ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {msg.role !== "user" && (
                      <div
                        className={`flex items-center justify-center size-7 rounded-lg shrink-0 mt-0.5 ${
                          msg.role === "assistant"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-amber-500/15 text-amber-400"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <Bot className="size-3.5" />
                        ) : (
                          <Zap className="size-3.5" />
                        )}
                      </div>
                    )}
                    <div
                      className={`max-w-[70%] rounded-xl px-4 py-2.5 text-sm ${
                        msg.role === "user"
                          ? "bg-emerald-500/15 text-foreground border border-emerald-500/20"
                          : msg.role === "system"
                          ? "bg-red-500/10 text-red-400 border border-red-500/20"
                          : "bg-muted text-foreground border border-border"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words leading-relaxed">
                        {msg.content}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                        {msg.timestamp && (
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="size-2.5" />
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </span>
                        )}
                        {msg.latency && (
                          <span className="inline-flex items-center gap-0.5">
                            <Zap className="size-2.5" />
                            {msg.latency}ms
                          </span>
                        )}
                        {msg.tokens && (
                          <span className="inline-flex items-center gap-0.5">
                            <Hash className="size-2.5" />
                            {msg.tokens} tokens
                          </span>
                        )}
                      </div>
                    </div>
                    {msg.role === "user" && (
                      <div className="flex items-center justify-center size-7 rounded-lg bg-primary/15 text-primary shrink-0 mt-0.5">
                        <User className="size-3.5" />
                      </div>
                    )}
                  </motion.div>
                ))}
                {sending && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-3 justify-start"
                  >
                    <div className="flex items-center justify-center size-7 rounded-lg bg-emerald-500/15 text-emerald-400 shrink-0">
                      <Bot className="size-3.5" />
                    </div>
                    <div className="bg-muted rounded-xl px-4 py-2.5 border border-border">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        Thinking...
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </ScrollArea>

        <Separator className="bg-border" />

        {/* Input Area */}
        <div className="p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[40px] max-h-[120px] resize-none text-sm font-mono"
              rows={1}
              disabled={sending}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              size="icon"
              className="size-10 shrink-0"
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
