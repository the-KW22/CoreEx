"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };
const ICON = { system: MonitorIcon, light: SunIcon, dark: MoonIcon };

// The theme lives on <html data-theme> (set before paint by the script in the root layout) and in a cookie.
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const current = (): Theme => (document.documentElement.dataset.theme as Theme | undefined) ?? "system";

function choose(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
    document.cookie = "theme=; path=/; max-age=0; samesite=lax";
  } else {
    root.dataset.theme = theme;
    document.cookie = `theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  }
  listeners.forEach((listener) => listener());
}

export const useTheme = () => useSyncExternalStore(subscribe, current, () => "system" as Theme);

// System → Light → Dark, the same step as the button; the command palette uses it too.
export const toggleTheme = () => choose(NEXT[current()]);

// An icon button (with a label after the icon, if given as children); the other props let a Tooltip wrap it.
export function ThemeToggle(props: React.ComponentProps<"button">) {
  const theme = useTheme();
  const Icon = ICON[theme];
  return (
    <button
      type="button"
      {...props}
      onClick={toggleTheme}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[NEXT[theme]]}`}
    >
      <Icon aria-hidden />
      {props.children}
    </button>
  );
}
