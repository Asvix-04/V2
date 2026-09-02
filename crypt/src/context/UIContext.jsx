import { createContext, useContext, useState, useEffect } from "react";

const UIContext = createContext();

export function UIProvider({ children }) {
    const [theme, setThemeState] = useState(() => {
        const saved = localStorage.getItem("theme");
        return saved || "dark";
    });

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === "dark") {
            root.classList.add("dark");
            root.style.backgroundColor = "#020203";
            root.style.colorScheme = "dark";
        } else {
            root.classList.remove("dark");
            root.style.backgroundColor = "#F8F9FF";
            root.style.colorScheme = "light";
        }
        try {
            localStorage.setItem("theme", theme);
        } catch (e) {}
    }, [theme]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 1024);

    const setTheme = (newTheme) => {
        setThemeState(newTheme);
    };

    return (
        <UIContext.Provider value={{
            theme,
            setTheme,
            isSidebarOpen,
            setIsSidebarOpen
        }}>
            {children}
        </UIContext.Provider>
    );
}

export function useUI() {
    return useContext(UIContext);
}
