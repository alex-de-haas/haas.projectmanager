"use client";

import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name?: string;
  className?: string;
}

export const getUserInitials = (name?: string): string => {
  if (!name) return "?";

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

export const getUserAvatarColor = (name?: string): string => {
  if (!name) return "hsl(210 35% 45%)";

  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 55% 42%)`;
};

export function UserAvatar({ name, className }: UserAvatarProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full text-xs font-semibold text-white",
        className
      )}
      style={{ backgroundColor: getUserAvatarColor(name) }}
      aria-label={name || "User"}
      title={name || "User"}
    >
      {getUserInitials(name)}
    </div>
  );
}
