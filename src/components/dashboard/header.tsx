"use client";

import { HealthBadge } from "./health-badge";
import { useTheme } from "next-themes";
import { Moon, Sun, Github, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import type { TabId } from "./sidebar";

interface HeaderProps {
  activeTab: TabId;
  healthStatus?: {
    database?: "healthy" | "unhealthy" | "degraded" | "unknown";
    stockServer?: "healthy" | "unhealthy" | "degraded" | "unknown";
    overall?: "healthy" | "unhealthy" | "degraded" | "unknown";
  };
}

const tabTitles: Record<TabId, string> = {
  dashboard: "Dashboard",
  providers: "Providers",
  agents: "Agents",
  chat: "Chat",
  memory: "Memory",
  mcp: "MCP Tools",
  settings: "Settings",
};

export function Header({ activeTab, healthStatus }: HeaderProps) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="flex items-center justify-between h-14 px-6 border-b border-border bg-card shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-foreground">
          {tabTitles[activeTab]}
        </h1>
        <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border hidden sm:inline-flex">
          v1.0.0
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        {/* Health indicators */}
        {healthStatus && (
          <div className="hidden md:flex items-center gap-2 mr-2">
            {healthStatus.database && (
              <HealthBadge status={healthStatus.database} label="DB" />
            )}
            {healthStatus.stockServer && (
              <HealthBadge status={healthStatus.stockServer} label="Stock" />
            )}
          </div>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              asChild
            >
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="size-4" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Source Code</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle theme</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
