import * as React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "../components/layout/Sidebar";
import { useSession } from "../context/SessionContext";
import { useUI } from "../context/UIContext";
import { useLanguage } from "../context/LanguageContext";

export function ChatLayout() {
    const location = useLocation();
    const { t } = useLanguage();
    const { isSidebarOpen, setIsSidebarOpen } = useUI();
    const {
        sessions,
        deepResearchChats,
        currentSessionId,
        hasMoreSessions,
        isLoadingMoreSessions,
        isRestoringSession
    } = useSession();

    // Local visual state mirrors for incognito & disappearing mode, updated via custom events
    const [isIncognito, setIsIncognito] = React.useState(() => {
        try {
            return sessionStorage.getItem("isIncognito") === "true";
        } catch {
            return false;
        }
    });
    const [isDisappearingMode, setIsDisappearingMode] = React.useState(false);

    // Sync state changes from the active page via CustomEvent listeners
    React.useEffect(() => {
        const handleIncognitoChange = (e) => {
            if (e.detail && typeof e.detail.isIncognito === "boolean") {
                setIsIncognito(e.detail.isIncognito);
            }
        };
        const handleDisappearingChange = (e) => {
            if (e.detail && typeof e.detail.isDisappearingMode === "boolean") {
                setIsDisappearingMode(e.detail.isDisappearingMode);
            }
        };

        window.addEventListener("sidebar-incognito-change", handleIncognitoChange);
        window.addEventListener("sidebar-disappearing-change", handleDisappearingChange);

        return () => {
            window.removeEventListener("sidebar-incognito-change", handleIncognitoChange);
            window.removeEventListener("sidebar-disappearing-change", handleDisappearingChange);
        };
    }, []);

    // Fetch user synchronously from localStorage
    const user = React.useMemo(() => {
        try {
            const saved = localStorage.getItem("user");
            return saved && saved !== "undefined" ? JSON.parse(saved) : null;
        } catch (e) {
            console.error("ChatLayout: Error parsing user data", e);
            return null;
        }
    }, []);

    const isTeacher = user?.role === "teacher";
    const isGuest = !user;

    const mode = location.pathname === "/deep-research" ? "research" : "chat";

    // Starred Chats (read directly from localStorage)
    const [starredChats, setStarredChats] = React.useState(() => {
        try {
            return JSON.parse(localStorage.getItem("starredChats") || "[]");
        } catch {
            return [];
        }
    });

    // Listen to starredChats updates from storage events (or custom toggle events)
    React.useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === "starredChats") {
                try {
                    setStarredChats(JSON.parse(e.newValue || "[]"));
                } catch {}
            }
        };
        const handleToggleStarChange = () => {
            try {
                setStarredChats(JSON.parse(localStorage.getItem("starredChats") || "[]"));
            } catch {}
        };

        window.addEventListener("storage", handleStorageChange);
        window.addEventListener("starred-chats-updated", handleToggleStarChange);
        return () => {
            window.removeEventListener("storage", handleStorageChange);
            window.removeEventListener("starred-chats-updated", handleToggleStarChange);
        };
    }, []);

    // Dispatch custom events to notify the active route component of sidebar actions
    const handleNewSession = React.useCallback(() => {
        window.dispatchEvent(new CustomEvent("page-new-session"));
    }, []);

    const handleSelectSession = React.useCallback((id) => {
        window.dispatchEvent(new CustomEvent("page-select-session", { detail: { id } }));
    }, []);

    const handleDeleteSession = React.useCallback((id, e) => {
        window.dispatchEvent(new CustomEvent("page-delete-session", { detail: { id, originalEvent: e } }));
    }, []);

    const handleDeleteResearch = React.useCallback((id, e) => {
        window.dispatchEvent(new CustomEvent("page-delete-research", { detail: { id, originalEvent: e } }));
    }, []);

    const handleToggleStar = React.useCallback((id, e) => {
        window.dispatchEvent(new CustomEvent("page-toggle-star", { detail: { id, originalEvent: e } }));
    }, []);

    const handleRenameSubmit = React.useCallback((id, title) => {
        window.dispatchEvent(new CustomEvent("page-rename-session", { detail: { id, title } }));
    }, []);

    const handleClearHistory = React.useCallback(() => {
        window.dispatchEvent(new CustomEvent("page-clear-history"));
    }, []);

    const handleLoadMoreSessions = React.useCallback(() => {
        window.dispatchEvent(new CustomEvent("page-load-more"));
    }, []);

    const handleIncognitoToggle = React.useCallback(() => {
        window.dispatchEvent(new CustomEvent("page-incognito-toggle"));
    }, []);

    const handleDisappearingToggle = React.useCallback((val) => {
        window.dispatchEvent(new CustomEvent("page-disappearing-toggle", { detail: { value: val } }));
    }, []);

    return (
        <div className="relative flex h-screen w-full overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
            {/* Sidebar remains permanently mounted */}
            <Sidebar
                mode={mode}
                isSidebarOpen={isSidebarOpen}
                setIsSidebarOpen={setIsSidebarOpen}
                user={user}
                isGuest={isGuest}
                isTeacher={isTeacher}
                sessions={sessions}
                starredChats={starredChats}
                deepResearchChats={deepResearchChats}
                currentSessionId={currentSessionId}
                onNewSession={handleNewSession}
                onSelectSession={handleSelectSession}
                onDeleteSession={handleDeleteSession}
                onDeleteResearch={handleDeleteResearch}
                onToggleStar={handleToggleStar}
                onRenameSubmit={handleRenameSubmit}
                onClearHistory={handleClearHistory}
                isIncognito={isIncognito}
                onIncognitoToggle={handleIncognitoToggle}
                isDisappearingMode={isDisappearingMode}
                setIsDisappearingMode={handleDisappearingToggle}
                t={t}
                hasMoreSessions={hasMoreSessions}
                isLoadingMoreSessions={isLoadingMoreSessions}
                onLoadMoreSessions={handleLoadMoreSessions}
            />

            {/* Inner page panel renders here */}
            <Outlet />
        </div>
    );
}
