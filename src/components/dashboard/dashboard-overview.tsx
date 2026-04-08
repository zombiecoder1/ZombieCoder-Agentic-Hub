"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { HealthBadge } from "./health-badge";
import {
  Server,
  Bot,
  MessageSquare,
  Brain,
  Activity,
  Clock,
  MapPin,
  User,
  Building2,
  Skull,
  Zap,
  ArrowUpRight,
  TrendingUp,
  Database,
  Wifi,
} from "lucide-react";

interface HealthData {
  status: string;
  database?: string;
  stockServer?: string;
  uptime?: string;
  timestamp?: string;
}

interface MetricsData {
  providers?: number;
  agents?: number;
  sessions?: number;
  memories?: number;
  [key: string]: unknown;
}

interface StatusData {
  version?: string;
  environment?: string;
  uptime?: string;
  [key: string]: unknown;
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" },
  }),
};

export function DashboardOverview() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, metricsRes, statusRes] = await Promise.allSettled([
        fetch("/api/health"),
        fetch("/api/metrics"),
        fetch("/api/status"),
      ]);

      if (healthRes.status === "fulfilled" && healthRes.value.ok) {
        const data = await healthRes.value.json();
        setHealth(data.data || data);
      }
      if (metricsRes.status === "fulfilled" && metricsRes.value.ok) {
        const data = await metricsRes.value.json();
        setMetrics(data.data || data);
      }
      if (statusRes.status === "fulfilled" && statusRes.value.ok) {
        const data = await statusRes.value.json();
        setStatus(data.data || data);
      }
    } catch {
      // Silently fail, show loading skeleton as fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const parseStatus = (
    s?: string
  ): "healthy" | "unhealthy" | "degraded" | "unknown" => {
    if (!s) return "unknown";
    const lower = s.toLowerCase();
    if (lower === "healthy" || lower === "ok" || lower === "up")
      return "healthy";
    if (lower === "degraded" || lower === "warning") return "degraded";
    if (lower === "unhealthy" || lower === "down" || lower === "error")
      return "unhealthy";
    return "unknown";
  };

  return (
    <div className="space-y-6">
      {/* System Identity */}
      <motion.div
        custom={0}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
      >
        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center justify-center size-14 rounded-xl bg-emerald-500/15 text-emerald-400 shrink-0">
                <Skull className="size-7" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-foreground">
                    ZombieCoder
                  </h2>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono text-emerald-400 border-emerald-500/30"
                  >
                    {status?.version || "v1.0.0"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono text-muted-foreground border-border"
                  >
                    {status?.environment || "development"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  যেখানে কোড ও কথা বলে — AI Development Assistant
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <User className="size-3" /> Sahon Srabon
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="size-3" /> Developer Zone
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" /> Dhaka, Bangladesh
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Health & Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* System Health */}
        <motion.div
          custom={1}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="sm:col-span-2 lg:col-span-2"
        >
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="size-4 text-emerald-400" />
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Database className="size-3" /> Database
                    </span>
                    <HealthBadge
                      status={parseStatus(health?.database as string | undefined)}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Wifi className="size-3" /> Stock Server
                    </span>
                    <HealthBadge
                      status={parseStatus(
                        health?.stockServer as string | undefined
                      )}
                    />
                  </div>
                </div>
              )}
              {health?.uptime && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                  <Clock className="size-3" /> Uptime: {health.uptime}
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Metric Cards */}
        {[
          {
            label: "Providers",
            value: metrics?.providers ?? 0,
            icon: Server,
            color: "text-emerald-400",
            bg: "bg-emerald-500/15",
          },
          {
            label: "Agents",
            value: metrics?.agents ?? 0,
            icon: Bot,
            color: "text-cyan-400",
            bg: "bg-cyan-500/15",
          },
          {
            label: "Sessions",
            value: metrics?.sessions ?? 0,
            icon: MessageSquare,
            color: "text-amber-400",
            bg: "bg-amber-500/15",
          },
          {
            label: "Memories",
            value: metrics?.memories ?? 0,
            icon: Brain,
            color: "text-purple-400",
            bg: "bg-purple-500/15",
          },
        ].map((item, idx) => (
          <motion.div
            key={item.label}
            custom={2 + idx}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
          >
            <Card className="h-full">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">
                      {loading ? (
                        <Skeleton className="h-8 w-12" />
                      ) : (
                        item.value
                      )}
                    </p>
                  </div>
                  <div
                    className={`flex items-center justify-center size-10 rounded-lg ${item.bg}`}
                  >
                    <item.icon className={`size-5 ${item.color}`} />
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2 text-xs text-emerald-400">
                  <TrendingUp className="size-3" />
                  <span>Active</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          custom={6}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
        >
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="size-4 text-emerald-400" />
                System Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              {loading ? (
                <>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>Version</span>
                    <span className="text-foreground font-mono">
                      {status?.version || "v1.0.0"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Environment</span>
                    <span className="text-foreground font-mono">
                      {status?.environment || "development"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Uptime</span>
                    <span className="text-foreground font-mono">
                      {status?.uptime || health?.uptime || "—"}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          custom={7}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
        >
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ArrowUpRight className="size-4 text-amber-400" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  <div className="size-1.5 rounded-full bg-emerald-400" />
                  <span>System initialized</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  <div className="size-1.5 rounded-full bg-cyan-400" />
                  <span>Dashboard loaded</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  <div className="size-1.5 rounded-full bg-amber-400" />
                  <span>Fetching metrics...</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          custom={8}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
        >
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Server className="size-4 text-cyan-400" />
                API Endpoints
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-xs font-mono text-muted-foreground">
                {[
                  "/api/health",
                  "/api/status",
                  "/api/metrics",
                  "/api/providers",
                  "/api/agents",
                  "/api/chat",
                ].map((endpoint) => (
                  <div
                    key={endpoint}
                    className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 transition-colors"
                  >
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 text-emerald-400 border-emerald-500/30 h-4"
                    >
                      GET
                    </Badge>
                    <span>{endpoint}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
