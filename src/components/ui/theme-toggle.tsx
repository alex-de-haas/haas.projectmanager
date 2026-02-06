"use client"

import * as React from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface ThemeToggleProps {
  isCompact?: boolean
  align?: "start" | "end"
  className?: string
}

export function ThemeToggle({
  isCompact = false,
  align = "start",
  className,
}: ThemeToggleProps) {
  const { setTheme, theme, resolvedTheme } = useTheme()
  const currentTheme = theme === "system" ? "system" : resolvedTheme
  const themeLabel =
    theme === "system" ? "System" : resolvedTheme === "dark" ? "Dark" : "Light"
  const ThemeIcon =
    currentTheme === "dark" ? Moon : currentTheme === "light" ? Sun : Monitor

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-10 w-full justify-start gap-3 px-3",
            "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            isCompact && "justify-center px-0",
            className
          )}
        >
          <ThemeIcon className="h-4 w-4" />
          <span className={cn("flex flex-col items-start leading-tight", isCompact && "sr-only")}>
            <span className="text-sm">Theme</span>
            <span className="text-xs text-sidebar-foreground/70">{themeLabel}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side="right" sideOffset={8}>
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 h-4 w-4" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
