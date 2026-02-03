import { createContext, useContext, useState, useEffect } from "react";

const UIContext = createContext();

export function UIProvider({ children }) {
    const [isShootingStarsEnabled, setIsShootingStarsEnabled] = useState(() => {
        const saved = localStorage.getItem("shootingStarsEnabled");
        return saved !== null ? JSON.parse(saved) : true;
    });

    const [isBubblesEnabled, setIsBubblesEnabled] = useState(() => {
        const saved = localStorage.getItem("bubblesEnabled");
        return saved !== null ? JSON.parse(saved) : true;
    });

    const toggleShootingStars = () => {
        setIsShootingStarsEnabled(prev => {
            const newValue = !prev;
            localStorage.setItem("shootingStarsEnabled", JSON.stringify(newValue));
            return newValue;
        });
    };

    const toggleBubbles = () => {
        setIsBubblesEnabled(prev => {
            const newValue = !prev;
            localStorage.setItem("bubblesEnabled", JSON.stringify(newValue));
            return newValue;
        });
    };

    const [theme, setThemeState] = useState(() => {
        const saved = localStorage.getItem("theme");
        return saved || "dark";
    });

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === "dark") {
            root.classList.add("dark");
        } else {
            root.classList.remove("dark");
        }
        localStorage.setItem("theme", theme);
    }, [theme]);

    const setTheme = (newTheme) => {
        setThemeState(newTheme);
    };

    return (
        <UIContext.Provider value={{
            isShootingStarsEnabled,
            toggleShootingStars,
            isBubblesEnabled,
            toggleBubbles,
            theme,
            setTheme
        }}>
            {children}
        </UIContext.Provider>
    );
}

export function useUI() {
    return useContext(UIContext);
}
