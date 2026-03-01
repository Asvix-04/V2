import { createContext, useContext, useState, useEffect } from "react";
import { translations } from "../lib/translations";

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
    const [language, setLanguage] = useState(() => {
        const saved = localStorage.getItem("language");
        return saved || "en";
    });

    useEffect(() => {
        localStorage.setItem("language", language);
    }, [language]);

    const t = (key) => {
        const translation = translations[language][key];
        return translation || key;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error("useLanguage must be used within a LanguageProvider");
    }
    return context;
}
