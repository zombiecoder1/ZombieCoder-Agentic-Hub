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
import { HealthBadge } from "./health-badge";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Bot,
  RefreshCw,
  Cpu,
  MessageSquare,
  Sparkles,
  Shield,
  Wrench,
  Pencil,
  Eye,
  Clock,
  Brain,
  Server,
  Hash,
} from "lucide-react";

interface Agent {
  id: string;
  name: string;
  type?: string;
  persona?: string;
  personaName?: string;
  status?: string;
  capabilities?: string[];
  providerId?: string;
  systemPrompt?: string;
  description?: string;
  provider?: { id: string; name: string; type: string } | null;
  _count?: { memories: number; chatSessions: number; toolAssignments: number };
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

const typeColors: Record<string, string> = {
  chatbot: "text-emerald-400 bg-emerald-500/15",
  assistant: "text-cyan-400 bg-cyan-500/15",
  coder: "text-amber-400 bg-amber-500/15",
  researcher: "text-purple-400 bg-purple-500/15",
  custom: "text-pink-400 bg-pink-500/15",
};

const typeLabels: Record<string, string> = {
  chatbot: "Chatbot",
  assistant: "Assistant",
  coder: "Coder",
  researcher: "Researcher",
  custom: "Custom",
};

export function AgentsPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [detailAgent, setDetailAgent] = useState<Agent | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "assistant",
    persona: "",
    systemPrompt: "",
    providerId: "",
  });

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const json = await res.json();
        setAgents(json.data || json || []);
      }
    } catch {
      toast.error("Failed to fetch agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const resetForm = () =>
    setFormData({
      name: "",
      type: "assistant",
      persona: "",
      systemPrompt: "",
      providerId: "",
    });

  const handleCreate = async () => {
    if (!formData.name) {
      toast.error("Agent name is required");
      return;
    }
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        toast.success(`Agent "${formData.name}" created`);
        setCreateOpen(false);
        resetForm();
        fetchAgents();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create agent");
      }
    } catch {
      toast.error("Failed to create agent");
    }
  };

  const handleEdit = (agent: Agent) => {
    setEditAgent(agent);
    setFormData({
      name: agent.name,
      type: agent.type || "assistant",
      persona: agent.personaName || agent.persona || "",
      systemPrompt: agent.systemPrompt || "",
      providerId: agent.providerId || "",
    });
    setEditOpen(true);
  };

  const handleViewDetail = (agent: Agent) => {
    setDetailAgent(agent);
    setDetailOpen(true);
  };

  const handleUpdate = async () => {
    if (!editAgent) return;
    try {
      const res = await fetch(`/api/agents/${editAgent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        toast.success(`Agent "${formData.name}" updated`);
        setEditOpen(false);
        setEditAgent(null);
        fetchAgents();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update agent");
      }
    } catch {
      toast.error("Failed to update agent");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Agent deleted");
        fetchAgents();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete agent");
      }
    } catch {
      toast.error("Failed to delete agent");
    }
  };

  const parseStatus = (
    s?: string
  ): "healthy" | "unhealthy" | "degraded" | "unknown" => {
    if (!s) return "unknown";
    const lower = s.toLowerCase();
    if (lower === "active" || lower === "online") return "healthy";
    if (lower === "inactive" || lower === "offline") return "unhealthy";
    if (lower === "error") return "unhealthy";
    return "unknown";
  };

  const agentForm = (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          placeholder="e.g., Code Assistant"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Type</Label>
        <Select
          value={formData.type}
          onValueChange={(v) => setFormData({ ...formData, type: v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="chatbot">Chatbot</SelectItem>
            <SelectItem value="assistant">Assistant</SelectItem>
            <SelectItem value="coder">Coder</SelectItem>
            <SelectItem value="researcher">Researcher</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Persona / Description</Label>
        <Input
          placeholder="e.g., Helpful coding assistant"
          value={formData.persona}
          onChange={(e) =>
            setFormData({ ...formData, persona: e.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label>System Prompt</Label>
        <Textarea
          placeholder="System instructions for the agent..."
          value={formData.systemPrompt}
          onChange={(e) =>
            setFormData({ ...formData, systemPrompt: e.target.value })
          }
          rows={3}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">AI Agents</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage your AI agents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAgents}
            className="text-xs"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="text-xs">
                <Plus className="size-3.5" />
                Create Agent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Agent</DialogTitle>
                <DialogDescription>
                  Set up a new AI agent with a persona and capabilities.
                </DialogDescription>
              </DialogHeader>
              {agentForm}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreateOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreate}>
                  <Plus className="size-4" />
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Agent Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Bot className="size-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No agents created yet</p>
            <p className="text-xs mt-1">Create your first agent to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {agents.map((agent) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="h-full hover:border-emerald-500/30 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex items-center justify-center size-9 rounded-lg ${
                            typeColors[agent.type || ""] || "text-zinc-400 bg-zinc-500/15"
                          }`}
                        >
                          <Bot className="size-4" />
                        </div>
                        <div>
                          <CardTitle className="text-sm">{agent.name}</CardTitle>
                          <CardDescription className="text-[10px] font-mono">
                            {agent.id.slice(0, 8)}
                          </CardDescription>
                        </div>
                      </div>
                      <HealthBadge
                        status={parseStatus(agent.status as string | undefined)}
                        label={(agent.status as string) || "Idle"}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(agent.personaName || agent.persona || agent.description) && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {agent.personaName || agent.persona || agent.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 ${
                          typeColors[agent.type || ""] || ""
                        }`}
                      >
                        <Cpu className="size-2.5 mr-0.5" />
                        {typeLabels[agent.type || ""] || agent.type || "custom"}
                      </Badge>
                      {agent.capabilities?.map((cap) => (
                        <Badge
                          key={cap}
                          variant="outline"
                          className="text-[10px] px-1.5"
                        >
                          {cap}
                        </Badge>
                      ))}
                    </div>

                    {/* Agent Metrics */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-1.5 rounded bg-muted/40">
                        <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          <Brain className="size-2.5" />
                          <span>Memories</span>
                        </div>
                        <div className="text-xs font-bold text-foreground">
                          {agent._count?.memories ?? 0}
                        </div>
                      </div>
                      <div className="p-1.5 rounded bg-muted/40">
                        <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          <MessageSquare className="size-2.5" />
                          <span>Sessions</span>
                        </div>
                        <div className="text-xs font-bold text-foreground">
                          {agent._count?.chatSessions ?? 0}
                        </div>
                      </div>
                      <div className="p-1.5 rounded bg-muted/40">
                        <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          <Wrench className="size-2.5" />
                          <span>Tools</span>
                        </div>
                        <div className="text-xs font-bold text-foreground">
                          {agent._count?.toolAssignments ?? 0}
                        </div>
                      </div>
                    </div>

                    {agent.provider && (
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Server className="size-2.5" />
                        <span>Provider: {agent.provider.name}</span>
                        <Badge variant="outline" className="text-[8px] px-1 py-0">
                          {agent.provider.type}
                        </Badge>
                      </div>
                    )}

                    {agent.createdAt && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="size-2.5" />
                        <span>Created: {new Date(agent.createdAt).toLocaleDateString()}</span>
                      </div>
                    )}

                    <Separator />

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 pt-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-cyan-400"
                        onClick={() => handleViewDetail(agent)}
                        title="View Details"
                      >
                        <Eye className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-emerald-400"
                        onClick={() => handleEdit(agent)}
                        title="Edit"
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-red-400"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete &quot;
                              {agent.name}&quot;? This action cannot be undone.
                              All associated memories, sessions, and tool assignments will be permanently deleted.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(agent.id)}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
            <DialogDescription>
              Update agent configuration.
            </DialogDescription>
          </DialogHeader>
          {agentForm}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditOpen(false);
                setEditAgent(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate}>
              <Sparkles className="size-4" />
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="size-5 text-emerald-400" />
              {detailAgent?.name}
            </DialogTitle>
            <DialogDescription>Full agent details and configuration</DialogDescription>
          </DialogHeader>
          {detailAgent && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                {/* Identity */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/40">
                    <div className="text-[10px] text-muted-foreground uppercase mb-1">Agent ID</div>
                    <div className="text-xs font-mono text-foreground">{detailAgent.id}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <div className="text-[10px] text-muted-foreground uppercase mb-1">Status</div>
                    <HealthBadge
                      status={parseStatus(detailAgent.status as string | undefined)}
                      label={(detailAgent.status as string) || "Unknown"}
                    />
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <div className="text-[10px] text-muted-foreground uppercase mb-1">Type</div>
                    <Badge variant="secondary" className={`text-xs ${typeColors[detailAgent.type || ""] || ""}`}>
                      {typeLabels[detailAgent.type || ""] || detailAgent.type}
                    </Badge>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <div className="text-[10px] text-muted-foreground uppercase mb-1">Created</div>
                    <div className="text-xs text-foreground">
                      {detailAgent.createdAt
                        ? new Date(detailAgent.createdAt).toLocaleString()
                        : "—"}
                    </div>
                  </div>
                </div>

                {/* Provider */}
                {detailAgent.provider && (
                  <div className="p-3 rounded-lg bg-muted/30 border border-border">
                    <div className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center gap-1">
                      <Server className="size-3" /> Provider
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{detailAgent.provider.name}</span>
                      <Badge variant="outline" className="text-[9px]">{detailAgent.provider.type}</Badge>
                    </div>
                  </div>
                )}

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-center">
                    <Brain className="size-5 text-emerald-400 mx-auto mb-1" />
                    <div className="text-lg font-bold text-foreground">{detailAgent._count?.memories ?? 0}</div>
                    <div className="text-[10px] text-muted-foreground">Memories</div>
                  </div>
                  <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20 text-center">
                    <MessageSquare className="size-5 text-cyan-400 mx-auto mb-1" />
                    <div className="text-lg font-bold text-foreground">{detailAgent._count?.chatSessions ?? 0}</div>
                    <div className="text-[10px] text-muted-foreground">Sessions</div>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-center">
                    <Wrench className="size-5 text-amber-400 mx-auto mb-1" />
                    <div className="text-lg font-bold text-foreground">{detailAgent._count?.toolAssignments ?? 0}</div>
                    <div className="text-[10px] text-muted-foreground">Tool Assignments</div>
                  </div>
                </div>

                {/* Persona */}
                {(detailAgent.personaName || detailAgent.persona) && (
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center gap-1">
                      <Shield className="size-3" /> Persona
                    </div>
                    <p className="text-sm text-foreground p-3 rounded-lg bg-muted/30 border border-border">
                      {detailAgent.personaName || detailAgent.persona}
                    </p>
                  </div>
                )}

                {/* System Prompt */}
                {detailAgent.systemPrompt && (
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center gap-1">
                      <Hash className="size-3" /> System Prompt
                    </div>
                    <pre className="text-xs text-foreground p-3 rounded-lg bg-muted/30 border border-border whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto font-mono">
                      {detailAgent.systemPrompt}
                    </pre>
                  </div>
                )}

                {/* Capabilities */}
                {detailAgent.capabilities && detailAgent.capabilities.length > 0 && (
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center gap-1">
                      <Sparkles className="size-3" /> Capabilities
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {detailAgent.capabilities.map((cap) => (
                        <Badge key={cap} variant="outline" className="text-[10px]">
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Simple Label component to avoid extra import
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
