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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Wrench,
  RefreshCw,
  BarChart3,
  FileText,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Terminal,
  Code2,
  Globe,
  Search,
  Cpu,
  Settings,
} from "lucide-react";

interface ToolItem {
  name: string;
  description?: string;
  category?: string;
  enabled?: boolean;
  requiredAuth?: boolean;
  [key: string]: unknown;
}

interface ExecutionLog {
  id?: string;
  toolName?: string;
  status?: string;
  duration?: number;
  timestamp?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  agentId?: string;
  [key: string]: unknown;
}

interface ToolStats {
  totalTools?: number;
  enabledTools?: number;
  totalExecutions?: number;
  successRate?: number;
  avgLatency?: number;
  categoryBreakdown?: Record<string, number>;
  topTools?: Array<{ name: string; count: number; successRate?: number }>;
}

const categoryIcons: Record<string, React.ElementType> = {
  file: FileText,
  shell: Terminal,
  web: Globe,
  search: Search,
  code: Code2,
  system: Cpu,
  general: Settings,
};

const categoryColors: Record<string, string> = {
  file: "text-emerald-400 bg-emerald-500/15",
  shell: "text-amber-400 bg-amber-500/15",
  web: "text-cyan-400 bg-cyan-500/15",
  search: "text-purple-400 bg-purple-500/15",
  code: "text-pink-400 bg-pink-500/15",
  system: "text-blue-400 bg-blue-500/15",
  general: "text-zinc-400 bg-zinc-500/15",
};

export function McpPanel() {
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [stats, setStats] = useState<ToolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [toolsRes, logsRes, statsRes] = await Promise.allSettled([
        fetch("/api/mcp/tools"),
        fetch("/api/mcp/logs"),
        fetch("/api/mcp/stats"),
      ]);
      if (toolsRes.status === "fulfilled" && toolsRes.value.ok) {
        const json = await toolsRes.value.json();
        setTools(json.data || json.tools || json || []);
      }
      if (logsRes.status === "fulfilled" && logsRes.value.ok) {
        const json = await logsRes.value.json();
        setLogs(json.data || json.logs || json || []);
      }
      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        const json = await statsRes.value.json();
        setStats(json.data || json);
      }
    } catch {
      toast.error("Failed to fetch MCP data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const categories = [
    "all",
    ...Array.from(new Set(tools.map((t) => t.category || "general"))),
  ];

  const filteredTools =
    activeCategory === "all"
      ? tools
      : tools.filter((t) => (t.category || "general") === activeCategory);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">MCP Tools</h2>
          <p className="text-sm text-muted-foreground">
            Model Context Protocol tool registry and execution logs
          </p>
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
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Total Tools",
            value: stats?.totalTools ?? tools.length,
            icon: Wrench,
            color: "text-emerald-400",
            bg: "bg-emerald-500/15",
          },
          {
            label: "Enabled",
            value: stats?.enabledTools ?? tools.filter((t) => t.enabled).length,
            icon: Zap,
            color: "text-cyan-400",
            bg: "bg-cyan-500/15",
          },
          {
            label: "Executions",
            value: stats?.totalExecutions ?? logs.length,
            icon: BarChart3,
            color: "text-amber-400",
            bg: "bg-amber-500/15",
          },
          {
            label: "Success Rate",
            value: stats?.successRate
              ? `${Math.round(stats.successRate)}%`
              : logs.length > 0
              ? `${Math.round(
                  (logs.filter((l) => l.status === "success").length /
                    logs.length) *
                    100
                )}%`
              : "N/A",
            icon: CheckCircle2,
            color: "text-purple-400",
            bg: "bg-purple-500/15",
          },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="text-xl font-bold text-foreground mt-0.5">
                    {loading ? (
                      <Skeleton className="h-6 w-12" />
                    ) : (
                      item.value
                    )}
                  </p>
                </div>
                <div
                  className={`flex items-center justify-center size-8 rounded-lg ${item.bg}`}
                >
                  <item.icon className={`size-4 ${item.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs: Tools / Logs */}
      <Tabs defaultValue="tools" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tools" className="text-xs">
            <Wrench className="size-3.5 mr-1" />
            Tools
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-xs">
            <Terminal className="size-3.5 mr-1" />
            Execution Logs
          </TabsTrigger>
          <TabsTrigger value="stats" className="text-xs">
            <BarChart3 className="size-3.5 mr-1" />
            Statistics
          </TabsTrigger>
        </TabsList>

        {/* Tools Tab */}
        <TabsContent value="tools">
          {/* Category Filter */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {categories.map((cat) => (
              <Button
                key={cat}
                variant={activeCategory === cat ? "default" : "outline"}
                size="sm"
                className="text-[10px] h-7"
                onClick={() => setActiveCategory(cat)}
              >
                {cat === "all" ? "All" : cat}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-6 w-16" />
                  </CardContent>
                </Card>
              ))
            ) : filteredTools.length === 0 ? (
              <Card className="sm:col-span-2 lg:col-span-3">
                <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Wrench className="size-8 mb-2 opacity-30" />
                  <p className="text-sm">No tools found</p>
                </CardContent>
              </Card>
            ) : (
              <AnimatePresence>
                {filteredTools.map((tool) => {
                  const cat = tool.category || "general";
                  const Icon = categoryIcons[cat] || Wrench;
                  const colorClass = categoryColors[cat] || categoryColors.general;

                  return (
                    <motion.div
                      key={tool.name}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <Card className="h-full hover:border-border/80 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className={`flex items-center justify-center size-8 rounded-lg ${colorClass}`}
                              >
                                <Icon className="size-4" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground font-mono">
                                  {tool.name}
                                </p>
                                <Badge
                                  variant="outline"
                                  className="text-[9px] mt-0.5"
                                >
                                  {cat}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge
                                variant={
                                  tool.enabled ? "default" : "secondary"
                                }
                                className={`text-[9px] ${
                                  tool.enabled
                                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                    : ""
                                }`}
                              >
                                {tool.enabled ? "On" : "Off"}
                              </Badge>
                              {tool.requiredAuth && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] text-amber-400 border-amber-500/30"
                                >
                                  Auth
                                </Badge>
                              )}
                            </div>
                          </div>
                          {tool.description && (
                            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                              {tool.description}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardContent className="p-4">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Terminal className="size-8 mb-2 opacity-30" />
                  <p className="text-sm">No execution logs yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  <AnimatePresence>
                    {logs.map((log, idx) => (
                      <motion.div
                        key={log.id || idx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-medium text-foreground">
                              {log.toolName || "unknown"}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[9px] ${
                                log.status === "success"
                                  ? "text-emerald-400 border-emerald-500/30"
                                  : log.status === "error"
                                  ? "text-red-400 border-red-500/30"
                                  : "text-amber-400 border-amber-500/30"
                              }`}
                            >
                              {log.status === "success" ? (
                                <CheckCircle2 className="size-2.5 mr-0.5" />
                              ) : log.status === "error" ? (
                                <XCircle className="size-2.5 mr-0.5" />
                              ) : (
                                <AlertCircle className="size-2.5 mr-0.5" />
                              )}
                              {log.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            {log.duration != null && (
                              <span className="inline-flex items-center gap-0.5">
                                <Clock className="size-2.5" />
                                {log.duration}ms
                              </span>
                            )}
                            {log.timestamp && (
                              <span className="font-mono">
                                {new Date(
                                  log.timestamp
                                ).toLocaleTimeString()}
                              </span>
                            )}
                          </div>
                        </div>
                        {log.error && (
                          <p className="text-[10px] text-red-400 mt-1 font-mono truncate">
                            {log.error}
                          </p>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stats Tab */}
        <TabsContent value="stats">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Success Rate */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Execution Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-2 w-full" />
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          Success Rate
                        </span>
                        <span className="text-foreground font-mono">
                          {stats?.successRate
                            ? `${Math.round(stats.successRate)}%`
                            : logs.length > 0
                            ? `${Math.round(
                                (logs.filter((l) => l.status === "success")
                                  .length /
                                  logs.length) *
                                  100
                              )}%`
                            : "N/A"}
                        </span>
                      </div>
                      <Progress
                        value={
                          stats?.successRate
                            ? stats.successRate
                            : logs.length > 0
                            ? (logs.filter((l) => l.status === "success")
                                .length /
                                logs.length) *
                              100
                            : 0
                        }
                        className="h-2"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          Average Latency
                        </span>
                        <span className="text-foreground font-mono">
                          {stats?.avgLatency
                            ? `${Math.round(stats.avgLatency)}ms`
                            : "N/A"}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          Total Executions
                        </span>
                        <span className="text-foreground font-mono">
                          {stats?.totalExecutions ?? logs.length}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Category Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Category Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                ) : stats?.categoryBreakdown ? (
                  <div className="space-y-2">
                    {Object.entries(stats.categoryBreakdown).map(
                      ([cat, count]) => {
                        const Icon =
                          categoryIcons[cat] || Wrench;
                        const colorClass =
                          categoryColors[cat] ||
                          categoryColors.general;
                        return (
                          <div
                            key={cat}
                            className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`flex items-center justify-center size-6 rounded ${colorClass}`}
                              >
                                <Icon className="size-3" />
                              </div>
                              <span className="text-xs text-foreground capitalize">
                                {cat}
                              </span>
                            </div>
                            <Badge variant="secondary" className="text-[10px]">
                              {count} tools
                            </Badge>
                          </div>
                        );
                      }
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No category data available
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Top Tools */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Top Used Tools</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : stats?.topTools && stats.topTools.length > 0 ? (
                  <div className="space-y-2">
                    {stats.topTools.map((tool, idx) => (
                      <div
                        key={tool.name}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-muted-foreground w-4">
                            {idx + 1}.
                          </span>
                          <span className="text-xs font-medium text-foreground font-mono">
                            {tool.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary" className="text-[10px]">
                            {tool.count} calls
                          </Badge>
                          {tool.successRate != null && (
                            <Badge
                              variant="outline"
                              className="text-[9px] text-emerald-400 border-emerald-500/30"
                            >
                              {Math.round(tool.successRate)}% success
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No usage data available
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
