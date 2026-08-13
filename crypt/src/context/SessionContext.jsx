import * as React from "react";
import api from "../lib/api";

const SessionContext = React.createContext();

export function SessionProvider({ children }) {
    const [sessions, setSessions] = React.useState([]);
    const [deepResearchChats, setDeepResearchChats] = React.useState([]);
    const [currentSessionId, setCurrentSessionId] = React.useState(null);
    const [currentSessionSource, setCurrentSessionSource] = React.useState(null);
    const [isRestoringSession, setIsRestoringSession] = React.useState(false);
    const [hasMoreSessions, setHasMoreSessions] = React.useState(true);
    const [isLoadingMoreSessions, setIsLoadingMoreSessions] = React.useState(false);

    const refreshSessions = React.useCallback(async () => {
        try {
            const res = await api.get("/chat/sessions");
            const data = Array.isArray(res.data) ? res.data : [];
            setSessions(data);
            return data;
        } catch (err) {
            console.error("SessionContext: Failed to fetch chat sessions:", err);
            return [];
        }
    }, []);

    const refreshResearch = React.useCallback(async () => {
        try {
            const res = await api.get("/research/sessions");
            const data = Array.isArray(res.data) ? res.data : [];
            setDeepResearchChats(data);
            return data;
        } catch (err) {
            console.error("SessionContext: Failed to fetch research sessions:", err);
            return [];
        }
    }, []);

    return (
        <SessionContext.Provider
            value={{
                sessions,
                setSessions,
                deepResearchChats,
                setDeepResearchChats,
                currentSessionId,
                setCurrentSessionId,
                currentSessionSource,
                setCurrentSessionSource,
                isRestoringSession,
                setIsRestoringSession,
                hasMoreSessions,
                setHasMoreSessions,
                isLoadingMoreSessions,
                setIsLoadingMoreSessions,
                refreshSessions,
                refreshResearch,
            }}
        >
            {children}
        </SessionContext.Provider>
    );
}

export function useSession() {
    const context = React.useContext(SessionContext);
    if (!context) {
        throw new Error("useSession must be used within a SessionProvider");
    }
    return context;
}
