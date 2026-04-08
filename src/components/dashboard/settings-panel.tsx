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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Settings,
  RefreshCw,
  Save,
  Search,
  Eye,
  EyeOff,
  Loader2,
  Shield,
  Database,
  Globe,
  Bell,
  Palette,
  Terminal,
  Key,
} from "lucide-react";

interface Setting {
  key: string;
  value: string;
  category?: string;
  description?: string;
  isSecret?: boolean;
  type?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

const categoryIcons: Record<string, React.ElementType> = {
  general: Settings,
  security: Shield,
  database: Database,
  network: Globe,
  notifications: Bell,
  appearance: Palette,
  terminal: Terminal,
  api: Key,
};

const categoryColors: Record<string, string> = {
  general: "text-emerald-400 bg-emerald-500/15",
  security: "text-red-400 bg-red-500/15",
  database: "text-cyan-400 bg-cyan-500/15",
  network: "text-amber-400 bg-amber-500/15",
  notifications: "text-purple-400 bg-purple-500/15",
  appearance: "text-pink-400 bg-pink-500/15",
  terminal: "text-zinc-400 bg-zinc-500/15",
  api: "text-orange-400 bg-orange-500/15",
};

export function SettingsPanel() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSecrets, setShowSecrets] = useState<Set<string>>(new Set());

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const json = await res.json();
        const data = json.data || json.settings || json || [];
        setSettings(
          Array.isArray(data)
            ? data
            : Object.entries(data).map(([key, value]) => ({
                key,
                value: String(value),
              }))
        );
      }
    } catch {
      toast.error("Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (key: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: editValue }),
      });
      if (res.ok) {
        toast.success(`Setting "${key}" updated`);
        setEditingKey(null);
        fetchSettings();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update setting");
      }
    } catch {
      toast.error("Failed to update setting");
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (setting: Setting) => {
    setEditingKey(setting.key);
    setEditValue(setting.value);
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setEditValue("");
  };

  const toggleSecret = (key: string) => {
    setShowSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const filteredSettings = settings.filter(
    (s) =>
      !searchQuery ||
      s.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group by category
  const groupedSettings = filteredSettings.reduce(
    (acc, setting) => {
      const cat = setting.category || "general";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(setting);
      return acc;
    },
    {} as Record<string, Setting[]>
  );

  const isBooleanLike = (value: string) =>
    ["true", "false", "1", "0", "yes", "no"].includes(value.toLowerCase());

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure system settings and preferences
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-xs pl-8 w-[200px]"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSettings}
            className="text-xs"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Settings Groups */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-48" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : Object.keys(groupedSettings).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Settings className="size-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No settings found</p>
            <p className="text-xs mt-1">
              {searchQuery
                ? "Try a different search term"
                : "Settings will appear here when configured"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <AnimatePresence>
          {Object.entries(groupedSettings).map(([category, items]) => {
            const Icon =
              categoryIcons[category] || Settings;
            const colorClass =
              categoryColors[category] || categoryColors.general;

            return (
              <motion.div
                key={category}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex items-center justify-center size-8 rounded-lg ${colorClass}`}
                      >
                        <Icon className="size-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm capitalize">
                          {category}
                        </CardTitle>
                        <CardDescription className="text-[10px]">
                          {items.length} setting{items.length !== 1 ? "s" : ""}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {items.map((setting) => (
                      <div
                        key={setting.key}
                        className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex-1 min-w-0 mr-3">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-mono font-medium text-foreground">
                              {setting.key}
                            </p>
                            {setting.isSecret && (
                              <Badge
                                variant="outline"
                                className="text-[8px] px-1 py-0 text-amber-400 border-amber-500/30"
                              >
                                SECRET
                              </Badge>
                            )}
                          </div>
                          {setting.description && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {setting.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {editingKey === setting.key ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={editValue}
                                onChange={(e) =>
                                  setEditValue(e.target.value)
                                }
                                className="h-7 w-[200px] text-xs font-mono"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    handleSave(setting.key);
                                  if (e.key === "Escape") cancelEditing();
                                }}
                                type={setting.isSecret ? "password" : "text"}
                                autoFocus
                              />
                              <Button
                                size="icon"
                                className="size-7 text-emerald-400 hover:text-emerald-300"
                                onClick={() => handleSave(setting.key)}
                                disabled={saving}
                              >
                                {saving ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Save className="size-3" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 text-muted-foreground"
                                onClick={cancelEditing}
                              >
                                ×
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {setting.isSecret && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7 text-muted-foreground hover:text-foreground"
                                  onClick={() => toggleSecret(setting.key)}
                                >
                                  {showSecrets.has(setting.key) ? (
                                    <EyeOff className="size-3" />
                                  ) : (
                                    <Eye className="size-3" />
                                  )}
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 text-muted-foreground hover:text-foreground"
                                onClick={() => startEditing(setting)}
                              >
                                <Settings className="size-3" />
                              </Button>
                              <span className="text-xs font-mono text-muted-foreground max-w-[200px] truncate px-1">
                                {setting.isSecret && !showSecrets.has(setting.key)
                                  ? "••••••••"
                                  : setting.value || "—"}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      )}

      {/* Prompt Templates Section */}
      <PromptTemplatesSection />
    </div>
  );
}

function PromptTemplatesSection() {
  const [templates, setTemplates] = useState<
    Array<{ id?: string; name?: string; description?: string; template?: string; [key: string]: unknown }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch("/api/prompt-templates");
        if (res.ok) {
          const json = await res.json();
          setTemplates(json.data || json.templates || json || []);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchTemplates();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center size-8 rounded-lg text-purple-400 bg-purple-500/15">
            <Terminal className="size-4" />
          </div>
          <div>
            <CardTitle className="text-sm">Prompt Templates</CardTitle>
            <CardDescription className="text-[10px]">
              {templates.length} template{templates.length !== 1 ? "s" : ""}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : templates.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No prompt templates configured
          </p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {templates.map((tpl, idx) => (
              <div
                key={tpl.id || idx}
                className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-foreground">
                    {tpl.name || `Template ${idx + 1}`}
                  </p>
                </div>
                {tpl.description && (
                  <p className="text-[10px] text-muted-foreground">
                    {tpl.description}
                  </p>
                )}
                {tpl.template && (
                  <pre className="mt-2 p-2 rounded bg-background text-[10px] font-mono text-muted-foreground overflow-x-auto max-h-[60px] overflow-y-auto">
                    {tpl.template.slice(0, 200)}
                    {tpl.template.length > 200 && "..."}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
