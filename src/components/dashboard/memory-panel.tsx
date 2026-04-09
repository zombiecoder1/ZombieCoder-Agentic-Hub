"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Search,
  RefreshCw,
  Brain,
  FileText,
  Clock,
  MessageSquare,
  Bot,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface MemoryEntry {
  id: string;
  topic?: string;
  content?: string;
  type?: string;
  agentId?: string;
  importance?: number;
  agent?: { id: string; name: string } | null;
  createdAt?: string;
  [key: string]: unknown;
}

interface SessionEntry {
  id: string;
  title?: string;
  status?: string;
  agentId?: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount?: number;
  _count?: { messages: number };
  [key: string]: unknown;
}

interface SessionMessage {
  role: string;
  content: string;
  timestamp?: string;
}

interface AgentOption {
  id: string;
  name: string;
}

export function MemoryPanel() {
  const [agentMemories, setAgentMemories] = useState<MemoryEntry[]>([]);
  const [individualMemories, setIndividualMemories] = useState<MemoryEntry[]>(
    []
  );
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionEntry | null>(
    null
  );
  const [sessionMessages, setSessionMessages] = useState<SessionMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addType, setAddType] = useState<"agent" | "individual">("agent");
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    agentId: "",
    topic: "",
    content: "",
    type: "conversation",
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [agentRes, indivRes, sessionsRes, agentsRes] = await Promise.allSettled([
        fetch("/api/memory/agent"),
        fetch("/api/memory/individual"),
        fetch("/api/sessions"),
        fetch("/api/agents"),
      ]);
      if (agentRes.status === "fulfilled" && agentRes.value.ok) {
        const json = await agentRes.value.json();
        const d = json.data;
        setAgentMemories(Array.isArray(d?.memories) ? d.memories : Array.isArray(d) ? d : Array.isArray(json) ? json : []);
      }
      if (indivRes.status === "fulfilled" && indivRes.value.ok) {
        const json = await indivRes.value.json();
        const d = json.data;
        setIndividualMemories(Array.isArray(d?.memories) ? d.memories : Array.isArray(d) ? d : Array.isArray(json) ? json : []);
      }
      if (sessionsRes.status === "fulfilled" && sessionsRes.value.ok) {
        const json = await sessionsRes.value.json();
        const d = json.data;
        setSessions(Array.isArray(d?.sessions) ? d.sessions : Array.isArray(d) ? d : Array.isArray(json) ? json : []);
      }
      if (agentsRes.status === "fulfilled" && agentsRes.value.ok) {
        const json = await agentsRes.value.json();
        const list = json.data || json || [];
        setAgents(
          Array.isArray(list)
            ? list.map((a: AgentOption) => ({ id: a.id, name: a.name }))
            : []
        );
      }
    } catch {
      toast.error("Failed to fetch memory data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const fetchSessionMessages = async (sessionId: string) => {
    setSessionLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (res.ok) {
        const json = await res.json();
        const session = json.data || json;
        setSelectedSession(session);
        setSessionMessages(session.messages || []);
      }
    } catch {
      toast.error("Failed to load session");
    } finally {
      setSessionLoading(false);
    }
  };

  const handleAddMemory = async () => {
    if (addType === "agent" && !formData.agentId) {
      toast.error("Please select an agent");
      return;
    }
    if (!formData.content.trim()) {
      toast.error("Content is required");
      return;
    }
    try {
      const url =
        addType === "agent" ? "/api/memory/agent" : "/api/memory/individual";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        toast.success("Memory added successfully");
        setAddDialogOpen(false);
        setFormData({ agentId: "", topic: "", content: "", type: "conversation" });
        fetchAll();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to add memory");
      }
    } catch {
      toast.error("Failed to add memory");
    }
  };

  const handleDeleteMemory = async (
    type: "agent" | "individual",
    id: string
  ) => {
    try {
      const url = `/api/memory/${type}/${id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) {
        toast.success("Memory deleted");
        fetchAll();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete memory");
      }
    } catch {
      toast.error("Failed to delete memory");
    }
  };

  const getAgentName = (agentId?: string | null): string => {
    if (!agentId) return "Unknown Agent";
    const agent = agents.find((a) => a.id === agentId);
    return agent ? agent.name : agentId.slice(0, 8) + "...";
  };

  const filteredAgentMemories = agentMemories.filter(
    (m) =>
      !searchQuery ||
      m.topic?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getAgentName(m.agentId).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredIndividualMemories = individualMemories.filter(
    (m) =>
      !searchQuery ||
      m.topic?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.content?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const MemoryRow = ({
    memory,
    type,
  }: {
    memory: MemoryEntry;
    type: "agent" | "individual";
  }) => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-start justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
    >
      <div className="flex-1 min-w-0 mr-3">
        {/* Agent Identity */}
        {type === "agent" && memory.agentId && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="flex items-center justify-center size-5 rounded bg-emerald-500/15">
              <Bot className="size-3 text-emerald-400" />
            </div>
            <span className="text-[10px] font-medium text-emerald-400">
              {memory.agent?.name || getAgentName(memory.agentId)}
            </span>
            <Badge variant="outline" className="text-[8px] px-1 py-0 font-mono text-muted-foreground border-border">
              {memory.agentId.slice(0, 8)}
            </Badge>
          </div>
        )}
        <div className="flex items-center gap-2 mb-1">
          {memory.topic && (
            <Badge variant="secondary" className="text-[10px] px-1.5">
              {memory.topic}
            </Badge>
          )}
          {memory.type && (
            <Badge variant="outline" className="text-[10px] px-1.5">
              {memory.type}
            </Badge>
          )}
          {memory.importance != null && (
            <Badge variant="outline" className="text-[10px] px-1.5 text-amber-400 border-amber-500/30">
              ★ {memory.importance}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {memory.content}
        </p>
        {memory.createdAt && (
          <p className="text-[10px] text-muted-foreground mt-1 font-mono">
            {new Date(memory.createdAt).toLocaleString()}
          </p>
        )}
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-red-400 shrink-0"
          >
            <Trash2 className="size-3" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Memory</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this memory entry?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteMemory(type, memory.id)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Memory</h2>
          <p className="text-sm text-muted-foreground">
            Manage agent and individual memory stores
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-xs pl-8 w-[200px]"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAll}
            className="text-xs"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          <Dialog
            open={addDialogOpen}
            onOpenChange={setAddDialogOpen}
          >
            <DialogTrigger asChild>
              <Button size="sm" className="text-xs">
                <Plus className="size-3.5" />
                Add Memory
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Memory Entry</DialogTitle>
                <DialogDescription>
                  Create a new memory entry for the selected store.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Store</Label>
                  <Select
                    value={addType}
                    onValueChange={(v) => {
                      setAddType(v as "agent" | "individual");
                      setFormData({ ...formData, agentId: "" });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">Agent Memory</SelectItem>
                      <SelectItem value="individual">
                        Individual Memory
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {addType === "agent" && (
                  <div className="space-y-2">
                    <Label>Select Agent</Label>
                    {agents.length === 0 ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400">
                        <AlertCircle className="size-4 shrink-0" />
                        <span>No agents available. Create an agent first in the Agents panel.</span>
                      </div>
                    ) : (
                      <Select
                        value={formData.agentId}
                        onValueChange={(v) =>
                          setFormData({ ...formData, agentId: v })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select an agent" />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                              <div className="flex items-center gap-2">
                                <Bot className="size-3 text-emerald-400" />
                                {agent.name}
                                <span className="text-[9px] font-mono text-muted-foreground">
                                  ({agent.id.slice(0, 8)})
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Topic</Label>
                  <Input
                    placeholder="e.g., coding preferences"
                    value={formData.topic}
                    onChange={(e) =>
                      setFormData({ ...formData, topic: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Content</Label>
                  <Textarea
                    placeholder="Memory content..."
                    value={formData.content}
                    onChange={(e) =>
                      setFormData({ ...formData, content: e.target.value })
                    }
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAddDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleAddMemory}>
                  <Plus className="size-4" />
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Memory Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground">Agent Memories</p>
                <div className="text-xl font-bold text-foreground mt-0.5">
                  {agentMemories.length}
                </div>
              </div>
              <div className="flex items-center justify-center size-8 rounded-lg bg-emerald-500/15">
                <Brain className="size-4 text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground">Individual Memories</p>
                <div className="text-xl font-bold text-foreground mt-0.5">
                  {individualMemories.length}
                </div>
              </div>
              <div className="flex items-center justify-center size-8 rounded-lg bg-cyan-500/15">
                <FileText className="size-4 text-cyan-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground">Sessions</p>
                <div className="text-xl font-bold text-foreground mt-0.5">
                  {sessions.length}
                </div>
              </div>
              <div className="flex items-center justify-center size-8 rounded-lg bg-amber-500/15">
                <Clock className="size-4 text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="agent" className="space-y-4">
        <TabsList>
          <TabsTrigger value="agent" className="text-xs">
            <Brain className="size-3.5 mr-1" />
            Agent Memory
          </TabsTrigger>
          <TabsTrigger value="individual" className="text-xs">
            <FileText className="size-3.5 mr-1" />
            Individual Memory
          </TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs">
            <Clock className="size-3.5 mr-1" />
            Sessions
          </TabsTrigger>
        </TabsList>

        {/* Agent Memory Tab */}
        <TabsContent value="agent">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Agent Memory Store</CardTitle>
              <CardDescription className="text-xs">
                Memories linked to specific agents — each entry shows the agent identity
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : filteredAgentMemories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Brain className="size-8 mb-2 opacity-30" />
                  <p className="text-sm">No agent memories found</p>
                  <p className="text-xs mt-1">
                    {searchQuery ? "Try a different search term" : "Add agent memories using the button above"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {filteredAgentMemories.map((memory) => (
                    <MemoryRow
                      key={memory.id}
                      memory={memory}
                      type="agent"
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Individual Memory Tab */}
        <TabsContent value="individual">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Individual Memory Store</CardTitle>
              <CardDescription className="text-xs">
                General memories not tied to a specific agent
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : filteredIndividualMemories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileText className="size-8 mb-2 opacity-30" />
                  <p className="text-sm">No individual memories found</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {filteredIndividualMemories.map((memory) => (
                    <MemoryRow
                      key={memory.id}
                      memory={memory}
                      type="individual"
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sessions Tab */}
        <TabsContent value="sessions">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Session List */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Session History</CardTitle>
                <CardDescription className="text-xs">
                  {sessions.length} sessions
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Clock className="size-8 mb-2 opacity-30" />
                    <p className="text-sm">No sessions found</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {sessions.map((session) => (
                      <button
                        key={session.id}
                        onClick={() => fetchSessionMessages(session.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-muted/50 ${
                          selectedSession?.id === session.id
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-border bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-foreground">
                            {session.title || `Session ${session.id.slice(0, 8)}`}
                          </p>
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${
                              session.status === "active"
                                ? "text-emerald-400 border-emerald-500/30"
                                : "text-muted-foreground"
                            }`}
                          >
                            {session.status || "closed"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          <span className="inline-flex items-center gap-0.5">
                            <MessageSquare className="size-2.5" />
                            {session._count?.messages ?? session.messageCount ?? 0} messages
                          </span>
                          {session.createdAt && (
                            <span>
                              {new Date(
                                session.createdAt
                              ).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Session Messages */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {selectedSession ? "Session Messages" : "Select a Session"}
                  {sessionLoading && (
                    <Loader2 className="size-3.5 animate-spin" />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {!selectedSession ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <MessageSquare className="size-8 mb-2 opacity-30" />
                    <p className="text-sm">Click a session to view messages</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {sessionMessages.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">
                        No messages in this session
                      </p>
                    ) : (
                      sessionMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex gap-2 p-2 rounded-lg ${
                            msg.role === "user"
                              ? "bg-emerald-500/5"
                              : msg.role === "system"
                              ? "bg-amber-500/5"
                              : "bg-muted/30"
                          }`}
                        >
                          <div
                            className={`flex items-center justify-center size-6 rounded shrink-0 mt-0.5 ${
                              msg.role === "user"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : msg.role === "system"
                                ? "bg-amber-500/15 text-amber-400"
                                : "bg-cyan-500/15 text-cyan-400"
                            }`}
                          >
                            {msg.role === "user" ? (
                              <Bot className="size-3" />
                            ) : (
                              <MessageSquare className="size-3" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase mb-0.5">
                              {msg.role}
                            </p>
                            <p className="text-xs text-foreground line-clamp-3">
                              {msg.content}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Simple Label component
function Label({ children, ...props }: { children: React.ReactNode; className?: string } & React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${props.className || ""}`}
      {...props}
    >
      {children}
    </label>
  );
}
