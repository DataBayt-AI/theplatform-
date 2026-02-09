import { useState, useEffect } from "react";

type Theme = "light" | "dark" | "system";

const THEME_KEY = "databayt_theme";

export const useTheme = () => {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window !== "undefined") {
            const stored = localStorage.getItem(THEME_KEY) as Theme | null;
            return stored || "system";
        }
        return "system";
    });

    useEffect(() => {
        const root = window.document.documentElement;

        const applyTheme = (newTheme: Theme) => {
            root.classList.remove("light", "dark");

            if (newTheme === "system") {
                const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
                    ? "dark"
                    : "light";
                root.classList.add(systemTheme);
            } else {
                root.classList.add(newTheme);
            }
        };

        applyTheme(theme);

        // Listen for system theme changes when using "system" preference
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => {
            if (theme === "system") {
                applyTheme("system");
            }
        };

        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, [theme]);

    const setTheme = (newTheme: Theme) => {
        localStorage.setItem(THEME_KEY, newTheme);
        setThemeState(newTheme);
    };

    return { theme, setTheme };
};
