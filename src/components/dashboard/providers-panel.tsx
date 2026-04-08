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
import { Label } from "@/components/ui/label";
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
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "lucide-react";

interface Provider {
  id: string;
  name: string;
  type?: string;
  endpoint?: string;
  status?: string;
  isDefault?: boolean;
  latency?: number;
  [key: string]: unknown;
}

export function ProvidersPanel() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "openai",
    endpoint: "",
    apiKey: "",
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
        setFormData({ name: "", type: "openai", endpoint: "", apiKey: "" });
        fetchProviders();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create provider");
      }
    } catch {
      toast.error("Failed to create provider");
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            AI Providers
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage your AI provider configurations
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
                  Configure a new AI provider for your agents.
                </DialogDescription>
              </DialogHeader>
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
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="google">Google AI</SelectItem>
                      <SelectItem value="ollama">Ollama</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
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
                  <Label htmlFor="provider-apikey">API Key</Label>
                  <Input
                    id="provider-apikey"
                    type="password"
                    placeholder="sk-..."
                    value={formData.apiKey}
                    onChange={(e) =>
                      setFormData({ ...formData, apiKey: e.target.value })
                    }
                  />
                </div>
              </div>
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
                            className="size-8 text-muted-foreground hover:text-emerald-400"
                            onClick={() => handleTest(provider.id)}
                            disabled={testingId === provider.id}
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
                            title="Activate"
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
    </div>
  );
}
