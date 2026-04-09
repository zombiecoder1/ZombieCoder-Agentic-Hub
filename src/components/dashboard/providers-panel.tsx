"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Play,
  Zap,
  Globe,
  Loader2,
  RefreshCw,
  Server,
  Pencil,
  Eye,
  Clock,
  Activity,
} from "lucide-react";

interface Provider {
  id: string;
  name: string;
  type?: string;
  endpoint?: string;
  model?: string;
  status?: string;
  isDefault?: boolean;
  latency?: number;
  lastHealthCheck?: string;
  errorCount?: number;
  lastError?: string;
  createdAt?: string;
  updatedAt?: string;
  config?: string;
  [key: string]: unknown;
}

export function ProvidersPanel() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [editProvider, setEditProvider] = useState<Provider | null>(null);
  const [detailProvider, setDetailProvider] = useState<Provider | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "openai",
    endpoint: "",
    model: "",
    apiKeyEnvVar: "",
  });

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/providers");
      if (res.ok) {
        const json = await res.json();
        setProviders(json.data || json || []);
      }
    } catch {
      toast.error("Failed to fetch providers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const resetForm = () =>
    setFormData({ name: "", type: "openai", endpoint: "", model: "", apiKeyEnvVar: "" });

  const handleCreate = async () => {
    if (!formData.name || !formData.endpoint) {
      toast.error("Name and endpoint are required");
      return;
    }
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        toast.success(`Provider "${formData.name}" created`);
        setCreateOpen(false);
        resetForm();
        fetchProviders();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create provider");
      }
    } catch {
      toast.error("Failed to create provider");
    }
  };

  const handleEdit = (provider: Provider) => {
    setEditProvider(provider);
    setFormData({
      name: provider.name,
      type: provider.type || "openai",
      endpoint: provider.endpoint || "",
      model: provider.model || "",
      apiKeyEnvVar: (provider as Record<string, unknown>).apiKeyEnvVar as string || "",
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editProvider) return;
    try {
      const res = await fetch(`/api/providers/${editProvider.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        toast.success(`Provider "${formData.name}" updated`);
        setEditOpen(false);
        setEditProvider(null);
        fetchProviders();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update provider");
      }
    } catch {
      toast.error("Failed to update provider");
    }
  };

  const handleViewDetail = async (provider: Provider) => {
    try {
      const res = await fetch(`/api/providers/${provider.id}`);
      if (res.ok) {
        const json = await res.json();
        setDetailProvider(json.data || json);
        setDetailOpen(true);
      }
    } catch {
      toast.error("Failed to load provider details");
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/providers/${id}/test`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(
          `Connection test ${data.data?.status || "passed"} for provider`
        );
      } else {
        const err = await res.json();
        toast.error(err.error || "Connection test failed");
      }
    } catch {
      toast.error("Connection test failed");
    } finally {
      setTestingId(null);
    }
  };

  const handleActivate = async (id: string) => {
    try {
      const res = await fetch(`/api/providers/${id}/activate`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Provider activated");
        fetchProviders();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to activate provider");
      }
    } catch {
      toast.error("Failed to activate provider");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/providers/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Provider deleted");
        fetchProviders();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete provider");
      }
    } catch {
      toast.error("Failed to delete provider");
    }
  };

  const parseStatus = (
    s?: string
  ): "healthy" | "unhealthy" | "degraded" | "unknown" => {
    if (!s) return "unknown";
    const lower = s.toLowerCase();
    if (lower === "active" || lower === "healthy" || lower === "connected")
      return "healthy";
    if (lower === "inactive" || lower === "disconnected") return "unhealthy";
    if (lower === "error" || lower === "unhealthy") return "unhealthy";
    return "unknown";
  };

  const providerForm = (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="provider-name">Name</Label>
        <Input
          id="provider-name"
          placeholder="e.g., OpenAI GPT-4"
          value={formData.name}
          onChange={(e) =>
            setFormData({ ...formData, name: e.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="provider-type">Type</Label>
        <Select
          value={formData.type}
          onValueChange={(v) =>
            setFormData({ ...formData, type: v })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ollama">Ollama</SelectItem>
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="gemini">Google AI</SelectItem>
            <SelectItem value="llamacpp">LlamaCpp</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="provider-endpoint">Endpoint URL</Label>
        <Input
          id="provider-endpoint"
          placeholder="https://api.openai.com/v1"
          value={formData.endpoint}
          onChange={(e) =>
            setFormData({ ...formData, endpoint: e.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="provider-model">Default Model</Label>
        <Input
          id="provider-model"
          placeholder="e.g., gpt-4, llama3.1:latest"
          value={formData.model}
          onChange={(e) =>
            setFormData({ ...formData, model: e.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="provider-apikey">API Key Env Variable</Label>
        <Input
          id="provider-apikey"
          placeholder="e.g., OPENAI_API_KEY"
          value={formData.apiKeyEnvVar}
          onChange={(e) =>
            setFormData({ ...formData, apiKeyEnvVar: e.target.value })
          }
        />
        <p className="text-[10px] text-muted-foreground">
          Name of the environment variable containing the API key. The actual key is never stored.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            AI Providers
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage your AI provider configurations — all traffic routes through the Public Gateway
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProviders}
            className="text-xs"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="text-xs">
                <Plus className="size-3.5" />
                Add Provider
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Provider</DialogTitle>
                <DialogDescription>
                  Configure a new AI provider. All requests route through the Public Gateway — providers are never called directly.
                </DialogDescription>
              </DialogHeader>
              {providerForm}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreate}>
                  <Plus className="size-4" />
                  Create Provider
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Providers Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : providers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Server className="size-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No providers configured</p>
              <p className="text-xs mt-1">
                Add a provider to get started
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="hidden md:table-cell">Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Latency
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {providers.map((provider) => (
                    <motion.tr
                      key={provider.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="hover:bg-muted/50 border-b transition-colors"
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Globe className="size-4 text-emerald-400 shrink-0" />
                          <div>
                            <p className="font-medium text-sm text-foreground">
                              {provider.name}
                            </p>
                            {provider.isDefault && (
                              <Badge
                                variant="outline"
                                className="text-[9px] mt-0.5 text-emerald-400 border-emerald-500/30"
                              >
                                DEFAULT
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="secondary" className="text-xs">
                          {provider.type || "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground font-mono max-w-[200px] truncate">
                        {provider.endpoint || "—"}
                      </TableCell>
                      <TableCell>
                        <HealthBadge
                          status={parseStatus(provider.status as string | undefined)}
                          label={
                            (provider.status as string | undefined) || "Unknown"
                          }
                        />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground font-mono">
                        {provider.latency
                          ? `${provider.latency}ms`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-cyan-400"
                            onClick={() => handleViewDetail(provider)}
                            title="View Details"
                          >
                            <Eye className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-emerald-400"
                            onClick={() => handleEdit(provider)}
                            title="Edit"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-blue-400"
                            onClick={() => handleTest(provider.id)}
                            disabled={testingId === provider.id}
                            title="Test Connection"
                          >
                            {testingId === provider.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Play className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-amber-400"
                            onClick={() => handleActivate(provider.id)}
                            title="Set as Default"
                          >
                            <Zap className="size-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-muted-foreground hover:text-red-400"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete Provider
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete &quot;
                                  {provider.name}&quot;? This action cannot be
                                  undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(provider.id)}
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Provider</DialogTitle>
            <DialogDescription>
              Update provider configuration. Changes take effect immediately.
            </DialogDescription>
          </DialogHeader>
          {providerForm}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditOpen(false);
                setEditProvider(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate}>
              <Pencil className="size-4" />
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="size-5 text-emerald-400" />
              {detailProvider?.name || "Provider Details"}
            </DialogTitle>
            <DialogDescription>Full provider configuration and health information</DialogDescription>
          </DialogHeader>
          {detailProvider && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/40">
                  <div className="text-[10px] text-muted-foreground uppercase mb-1">Provider ID</div>
                  <div className="text-xs font-mono text-foreground">{detailProvider.id}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/40">
                  <div className="text-[10px] text-muted-foreground uppercase mb-1">Type</div>
                  <Badge variant="secondary">{detailProvider.type}</Badge>
                </div>
                <div className="p-3 rounded-lg bg-muted/40">
                  <div className="text-[10px] text-muted-foreground uppercase mb-1">Status</div>
                  <HealthBadge
                    status={parseStatus(detailProvider.status as string | undefined)}
                    label={(detailProvider.status as string) || "Unknown"}
                  />
                </div>
                <div className="p-3 rounded-lg bg-muted/40">
                  <div className="text-[10px] text-muted-foreground uppercase mb-1">Default</div>
                  <Badge variant={detailProvider.isDefault ? "default" : "outline"}>
                    {detailProvider.isDefault ? "Yes" : "No"}
                  </Badge>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase">
                  <Activity className="size-3" /> Health Information
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 rounded bg-muted/30">
                    <span className="text-[10px] text-muted-foreground">Latency</span>
                    <div className="text-xs font-mono text-foreground">{detailProvider.latency ? `${detailProvider.latency}ms` : "N/A"}</div>
                  </div>
                  <div className="p-2 rounded bg-muted/30">
                    <span className="text-[10px] text-muted-foreground">Error Count</span>
                    <div className="text-xs font-mono text-foreground">{detailProvider.errorCount ?? 0}</div>
                  </div>
                  <div className="p-2 rounded bg-muted/30 col-span-2">
                    <span className="text-[10px] text-muted-foreground">Last Health Check</span>
                    <div className="text-xs font-mono text-foreground">
                      {detailProvider.lastHealthCheck
                        ? new Date(detailProvider.lastHealthCheck).toLocaleString()
                        : "Never"}
                    </div>
                  </div>
                </div>
                {detailProvider.lastError && (
                  <div className="p-2 rounded bg-red-500/5 border border-red-500/20">
                    <span className="text-[10px] text-muted-foreground">Last Error</span>
                    <div className="text-xs text-red-400 font-mono">{detailProvider.lastError}</div>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="text-[10px] text-muted-foreground uppercase">Connection Details</div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-[10px] text-muted-foreground">Endpoint</span>
                  <div className="text-xs font-mono text-foreground break-all">{detailProvider.endpoint || "Not configured"}</div>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-[10px] text-muted-foreground">Model</span>
                  <div className="text-xs font-mono text-foreground">{detailProvider.model || "Not configured"}</div>
                </div>
                {(detailProvider as Record<string, unknown>).apiKeyEnvVar && (
                  <div className="p-2 rounded bg-muted/30">
                    <span className="text-[10px] text-muted-foreground">API Key Env Variable</span>
                    <div className="text-xs font-mono text-foreground">{(detailProvider as Record<string, unknown>).apiKeyEnvVar as string}</div>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Clock className="size-3" />
                <span>Created: {detailProvider.createdAt ? new Date(detailProvider.createdAt).toLocaleString() : "Unknown"}</span>
                <span className="mx-1">|</span>
                <span>Updated: {detailProvider.updatedAt ? new Date(detailProvider.updatedAt).toLocaleString() : "Unknown"}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
