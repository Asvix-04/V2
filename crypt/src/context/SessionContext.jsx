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

    // Ref to track the previous user ID between render cycles
    const lastUserIdRef = React.useRef(null);

    // Centralized state reset helper
    const resetSessionState = React.useCallback(() => {
        setSessions([]);
        setDeepResearchChats([]);
        setCurrentSessionId(null);
        setCurrentSessionSource(null);
        setHasMoreSessions(true);
        setIsLoadingMoreSessions(false);
        setIsRestoringSession(false);
    }, []);

    // Observer effect: runs on every render pass. Tracks when user changes (User A -> User B)
    // or disappears (Authenticated -> Guest), purging stale context data.
    React.useEffect(() => {
        let currentUser = null;
        try {
            const saved = localStorage.getItem("user");
            currentUser = saved && saved !== "undefined" ? JSON.parse(saved) : null;
        } catch (e) {
            console.error("SessionProvider: Error parsing user data", e);
        }

        const currentUserId = currentUser?.id || currentUser?.uid || null;
        const lastUserId = lastUserIdRef.current;

        // Reset if we transition:
        // 1. Authenticated user -> Guest (logout)
        // 2. User A -> User B (user switch)
        if (lastUserId !== null && currentUserId !== lastUserId) {
            resetSessionState();
        }

        lastUserIdRef.current = currentUserId;
    });

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
