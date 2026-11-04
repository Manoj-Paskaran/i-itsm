import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
type Theme = 'light' | 'dark';
const Context = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem('itsm-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('itsm-theme', theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);
  return <Context.Provider value={{ theme, setTheme }}>{children}</Context.Provider>;
}
export function useTheme() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing ThemeProvider');
  return value;
}
