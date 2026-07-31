import { useRef } from "react";
import { create } from "zustand";

import type { Theme } from "~/lib/theme";
import { defaultTheme } from "~/lib/theme";

interface ThemeState {
  theme: Theme;
  stars: boolean;
  changeTheme: (newTheme: Theme) => void;
  changeStars: (newStarsValue: boolean) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: defaultTheme,
  stars: false,
  changeTheme: (newTheme) => {
    const currentThemeClass = `theme-${get().theme}`;
    document.body.classList.remove(currentThemeClass);
    const newThemeClass = `theme-${newTheme}`;
    document.body.classList.add(newThemeClass);
    set({ theme: newTheme });
    document.cookie = `theme=${newTheme}; path=/; max-age=31536000`;
  },
  changeStars: (newStarsValue) => {
    set({ stars: newStarsValue });
    document.cookie = `stars=${newStarsValue}; path=/; max-age=31536000`;
  },
}));

function initThemeStore(theme: Theme, stars: boolean) {
  useThemeStore.setState({ theme, stars });
}

export function useTheme() {
  return useThemeStore();
}

export function ThemeProvider({
  children,
  initialTheme,
  initialStars,
}: {
  children: React.ReactNode;
  initialTheme: Theme;
  initialStars: boolean;
}) {
  const initialized = useRef<true | null>(null);
  if (initialized.current == null) {
    initialized.current = true;
    initThemeStore(initialTheme, initialStars);
  }

  const stars = useThemeStore((s) => s.stars);

  return (
    <>
      {children}
      <Stars show={stars} />
    </>
  );
}

const starPositions = Array.from({ length: 200 }, () => ({
  left: `calc(100vw * ${Math.random()})`,
  top: `calc(100vh * ${Math.random()})`,
  opacity: Math.random(),
}));

function Stars({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="animate-in fade-in pointer-events-none absolute inset-0 h-screen w-screen transition-opacity duration-1000">
      {starPositions.map((pos, index) => (
        <div
          className="bg-foreground absolute h-[1px] w-[1px]"
          key={index}
          style={pos}
        />
      ))}
    </div>
  );
}
