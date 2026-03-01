import * as React from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useRoadmaps } from "../context/RoadmapContext";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ChatInput } from "../components/ui/ChatInput";
import { MessageBubble } from "../components/ui/MessageBubble";
import { PageTransition } from "../components/ui/PageTransition";
import { VoiceOverlay } from "../components/ui/VoiceOverlay";
import { ArrowLeft, BookOpen, ChevronRight, FileText, Layout, Lightbulb, MessageSquare, MoreHorizontal, Settings, Share, CheckCircle, Map, Trash2, AlertCircle, Loader2, Wifi, WifiOff, Plus, User as UserIcon, X, Star } from "lucide-react";
import { MdSearch } from "react-icons/md";
import chatbotApi from "../lib/chatbotApi";
import { ChevronDown } from "lucide-react";
import api from "../lib/api";

const INITIAL_MESSAGE = {
    role: "assistant",
    content: "Hello! I am DigiLab, your personal learning assistant. How can I help you today?",
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

// Local storage key for guest sessions
const GUEST_SESSIONS_KEY = "guest_chat_sessions";

export function ChatPage() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const urlMode = searchParams.get("mode");

    // Roadmap context
    const roadmapId = searchParams.get("roadmapId");
    const topicId = searchParams.get("topicId");
    const { roadmaps, getProgressForRoadmap, updateTopicProgress } = useRoadmaps();

    // Find current roadmap and topic
    const currentRoadmap = roadmapId ? roadmaps.find(r => r.id === roadmapId) : null;
    const currentTopic = currentRoadmap?.topics?.find(t => t.id === topicId);
    const progress = roadmapId ? getProgressForRoadmap(roadmapId) : null;
    const isTopicCompleted = progress?.completedTopicIds?.includes(topicId) || false;
    const [markingComplete, setMarkingComplete] = React.useState(false);

    // Get user from local storage to determine role
    const user = React.useMemo(() => {
        try {
            const saved = localStorage.getItem("user");
            return (saved && saved !== "undefined") ? JSON.parse(saved) : null;
        } catch (e) {
            console.error("Error parsing user data", e);
            return null;
        }
    }, []);
    const isTeacher = user?.role === "teacher";
    const isGuest = !user;

    const [messages, setMessages] = React.useState([INITIAL_MESSAGE]);
    const [sessions, setSessions] = React.useState([]);
    const [currentSessionId, setCurrentSessionId] = React.useState(null);

    // Initialize view based on URL param or default
    const [teacherView, setTeacherView] = React.useState(
        urlMode === "classroom-plan" ? "classroom_plan" :
            urlMode === "deep-dive" ? "deep_dive" :
                "overview"
    );
    const [isModeOpen, setIsModeOpen] = React.useState(false);

    const [showLimitModal, setShowLimitModal] = React.useState(false);
    const [showSettings, setShowSettings] = React.useState(false);
    const [isVoiceMode, setIsVoiceMode] = React.useState(false);
    const [disappearingChatsEnabled, setDisappearingChatsEnabled] = React.useState(
        user?.preferences?.disappearingChatsEnabled || false
    );

    // API integration states
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [isConnected, setIsConnected] = React.useState(false);
    const [isCheckingConnection, setIsCheckingConnection] = React.useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
    const messagesEndRef = React.useRef(null);
    const messagesContainerRef = React.useRef(null);
    const [showScrollDown, setShowScrollDown] = React.useState(false);

    // Starred chats feature
    const [showStarredOnly, setShowStarredOnly] = React.useState(false);

    // Save sessions to localStorage for guests
    const saveGuestSessions = React.useCallback((sessionsToSave) => {
        if (isGuest) {
            localStorage.setItem(GUEST_SESSIONS_KEY, JSON.stringify(sessionsToSave));
        }
    }, [isGuest]);

    // Load guest sessions from localStorage on mount
    React.useEffect(() => {
        if (isGuest) {
            const saved = localStorage.getItem(GUEST_SESSIONS_KEY);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        // Migrate old sessions: ensure every session has a 'starred' field (default false)
                        const migrated = parsed.map(session => ({
                            ...session,
                            starred: session.starred !== undefined ? session.starred : false
                        }));
                        setSessions(migrated);
                        // Save migrated sessions back to localStorage for consistency
                        localStorage.setItem(GUEST_SESSIONS_KEY, JSON.stringify(migrated));
                        // Load the most recent session
                        const latest = migrated[0];
                        setCurrentSessionId(latest.id);
                        setMessages(latest.messages);
                    }
                } catch (e) {
                    console.error("Failed to parse guest sessions", e);
                }
            }
        }
    }, [isGuest]);

    // Check backend health and fetch sessions from DB (if logged in)
    React.useEffect(() => {
        const initChat = async () => {
            // Check AI Backend connection
            try {
                await chatbotApi.checkHealth();
                setIsConnected(true);
            } catch (err) {
                console.error("Backend not available:", err);
                setIsConnected(false);
            } finally {
                setIsCheckingConnection(false);
            }

            // Fetch Sessions from Database (if logged in)
            if (!isGuest) {
                try {
                    const res = await api.get('/chat/sessions');
                    if (res.data && res.data.length > 0) {
                        // Ensure each session has a 'starred' field (default false)
                        const sessionsWithStar = res.data.map(session => ({
                            ...session,
                            starred: session.starred || false
                        }));
                        setSessions(sessionsWithStar);
                        // Load the most recent session by default
                        const latestSession = sessionsWithStar[0];
                        setCurrentSessionId(latestSession.id);
                        setMessages(latestSession.messages);
                    }
                } catch (err) {
                    console.error("Failed to fetch sessions from DB:", err);
                }
            }
        };
        initChat();
    }, [isGuest]);

    // Scroll behavior when messages change
    React.useEffect(() => {
        // if there's at least one message
        const container = messagesContainerRef.current;
        if (!container) return;

        // scroll to top of last message if content overflows
        const lastMsgEl = container.querySelector(".message-last");
        if (lastMsgEl) {
            container.scrollTo({ top: lastMsgEl.offsetTop, behavior: "smooth" });
        } else {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
        // always show the button after a response arrives
        setShowScrollDown(true);
    }, [messages]);

    // Check for expired disappearing chats every 60 seconds
    React.useEffect(() => {
        if (!disappearingChatsEnabled) return;

        const interval = setInterval(() => {
            const now = Date.now();
            // Remove sessions that have expired
            setSessions((prevSessions) =>
                prevSessions.filter(
                    (session) => !session.disappearTime || session.disappearTime > now
                )
            );
            // If current session expired, clear messages
            setMessages((prevMessages) => {
                const currentSession = sessions.find(s => s.id === currentSessionId);
                if (currentSession && currentSession.disappearTime && currentSession.disappearTime <= now) {
                    setCurrentSessionId(null);
                    return [INITIAL_MESSAGE];
                }
                return prevMessages;
            });
        }, 60000); // Check every 60 seconds

        return () => clearInterval(interval);
    }, [disappearingChatsEnabled, sessions, currentSessionId]);

    // Toggle starred status for a session
    const toggleStarred = async (sessionId, currentStarred) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;

        const newStarred = !currentStarred;
        // Optimistic update
        const updatedSessions = sessions.map(s =>
            s.id === sessionId ? { ...s, starred: newStarred } : s
        );
        setSessions(updatedSessions);

        if (isGuest) {
            // Save to localStorage
            saveGuestSessions(updatedSessions);
        } else {
            // Persist to backend
            try {
                await api.post('/chat/sessions', {
                    sessionId: session.id,
                    messages: session.messages,
                    starred: newStarred
                });
            } catch (err) {
                console.error("Failed to update starred status:", err);
                // Revert on error
                setSessions(sessions);
            }
        }
    };

    // Clear all chat history
    const handleClearHistory = async () => {
        if (!window.confirm("Are you sure you want to clear all chat history?")) return;

        try {
            // Clear from AI Backend memory (Python)
            await chatbotApi.clearHistory();

            if (isGuest) {
                // Clear from localStorage
                localStorage.removeItem(GUEST_SESSIONS_KEY);
                setSessions([]);
            } else {
                // Clear from Database (Node.js/Firestore)
                await api.delete('/chat/sessions');
            }

            setMessages([INITIAL_MESSAGE]);
            setCurrentSessionId(null);
            setError(null);
        } catch (err) {
            console.error("Failed to clear history:", err);
            setError("Failed to clear chat history");
        }
    };

    const handleNewChat = async () => {
        // Clear AI memory
        try {
            await chatbotApi.clearHistory();
        } catch (err) {
            console.error("Failed to clear AI memory:", err);
        }

        // Only add to sessions if there was a real conversation
        if (messages.length > 1) {
            const lastSession = {
                id: currentSessionId || `temp-${Date.now()}`,
                title: messages[1]?.content?.substring(0, 30) + "..." || "Chat session",
                messages: [...messages],
                timestamp: new Date().toISOString(),
                starred: false  // default not starred
            };

            // Avoid duplicates
            const updatedSessions = [lastSession, ...sessions.filter(s => s.id !== lastSession.id)];
            setSessions(updatedSessions);

            if (isGuest) {
                saveGuestSessions(updatedSessions);
            }
        }

        setMessages([INITIAL_MESSAGE]);
        setCurrentSessionId(null);
        setError(null);
        if (window.innerWidth < 1024) setIsSidebarOpen(false);
    };

    const handleSelectSession = async (sessionId) => {
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            setCurrentSessionId(session.id);
            setMessages(session.messages);
            setError(null);
            // Optionally: Tell AI backend to reset context for selected history
            await chatbotApi.clearHistory();
        }
    };

    const handleEditMessage = async (messageIndex, editedContent) => {
        // Find the edited message and remove it and all subsequent messages
        const messagesBeforeEdit = messages.slice(0, messageIndex);
        setMessages(messagesBeforeEdit);
        // Resend the edited message
        await handleSend(editedContent);
    };

    const handleSend = async (text) => {
        // GUEST LIMIT CHECK
        if (isGuest && messages.length >= 10) {
            setShowLimitModal(true);
            return;
        }

        // Clear any previous error
        setError(null);

        const userMsg = {
            role: "user",
            content: text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages((prev) => [...prev, userMsg]);

        // Call the real API
        setIsLoading(true);
        try {
            const response = await chatbotApi.sendMessage(text);
            const assistantMsg = {
                role: "assistant",
                content: response.answer,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };

            const updatedMessages = [...messages, userMsg, assistantMsg];
            setMessages(updatedMessages);

            if (isGuest) {
                // Update or create session in localStorage
                const existingSession = sessions.find(s => s.id === currentSessionId);
                const starred = existingSession ? existingSession.starred : false;

                const updatedSession = {
                    id: currentSessionId || `temp-${Date.now()}`,
                    title: updatedMessages[1]?.content?.substring(0, 30) + "..." || "Chat session",
                    messages: updatedMessages,
                    timestamp: new Date().toISOString(),
                    starred,
                    ...(disappearingChatsEnabled && { disappearTime: Date.now() + 24 * 60 * 60 * 1000 })
                };

                let updatedSessions;
                if (!currentSessionId) {
                    // New session
                    updatedSessions = [updatedSession, ...sessions];
                    setCurrentSessionId(updatedSession.id);
                } else {
                    // Update existing
                    updatedSessions = sessions.map(s =>
                        s.id === currentSessionId ? updatedSession : s
                    );
                }
                setSessions(updatedSessions);
                saveGuestSessions(updatedSessions);
            } else {
                // Save to Database (Node.js/Firestore)
                const existingSession = sessions.find(s => s.id === currentSessionId);
                const starred = existingSession ? existingSession.starred : false;

                const res = await api.post('/chat/sessions', {
                    sessionId: currentSessionId,
                    messages: updatedMessages,
                    starred: starred
                });

                if (res.data) {
                    const updatedSession = {
                        ...res.data,
                        starred: starred
                    };
                    if (!currentSessionId) {
                        setCurrentSessionId(res.data.id);
                        setSessions(prev => [updatedSession, ...prev]);
                    } else {
                        setSessions(prev => prev.map(s => s.id === res.data.id ? updatedSession : s));
                    }
                }
            }
        } catch (err) {
            console.error("API Error:", err);
            const errorMessage = err.response?.data?.detail || err.message || "Failed to get response";
            setError(errorMessage);
            // Add error message to chat
            const updatedWithErr = [...messages, userMsg, {
                role: "assistant",
                content: `Sorry, I encountered an error: ${errorMessage}. Please try again.`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isError: true
            }];
            setMessages(updatedWithErr);

            // Save error message state
            if (isGuest) {
                const existingSession = sessions.find(s => s.id === currentSessionId);
                const starred = existingSession ? existingSession.starred : false;
                const updatedSession = {
                    id: currentSessionId || `temp-${Date.now()}`,
                    title: updatedWithErr[1]?.content?.substring(0, 30) + "..." || "Chat session",
                    messages: updatedWithErr,
                    timestamp: new Date().toISOString(),
                    starred
                };
                let updatedSessions;
                if (!currentSessionId) {
                    updatedSessions = [updatedSession, ...sessions];
                    setCurrentSessionId(updatedSession.id);
                } else {
                    updatedSessions = sessions.map(s =>
                        s.id === currentSessionId ? updatedSession : s
                    );
                }
                setSessions(updatedSessions);
                saveGuestSessions(updatedSessions);
            } else {
                api.post('/chat/sessions', {
                    sessionId: currentSessionId,
                    messages: updatedWithErr
                }).catch(() => { });
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Theme Toggle Logic
    const toggleTheme = () => {
        const html = document.documentElement;
        if (html.classList.contains('dark')) {
            html.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        } else {
            html.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        }
    };

    // Mark topic as complete
    const handleMarkComplete = async () => {
        if (!roadmapId || !topicId) return;
        setMarkingComplete(true);
        try {
            await updateTopicProgress(roadmapId, topicId, !isTopicCompleted);
        } catch (err) {
            console.error("Error marking topic complete:", err);
        } finally {
            setMarkingComplete(false);
        }
    };

    // Find next topic in roadmap
    const getNextTopic = () => {
        if (!currentRoadmap || !currentTopic) return null;
        const currentIndex = currentRoadmap.topics.findIndex(t => t.id === topicId);
        if (currentIndex < currentRoadmap.topics.length - 1) {
            return currentRoadmap.topics[currentIndex + 1];
        }
        return null;
    };

    const nextTopic = getNextTopic();

    // Filter sessions based on starred filter
    const displayedSessions = showStarredOnly
        ? sessions.filter(s => s.starred)
        : sessions;

    return (
        <PageTransition className="relative flex h-screen w-full overflow-hidden bg-background-base text-foreground">
            {/* Sidebar - Context / History */}
            <AnimatePresence>
                {isSidebarOpen && (
                    <>
                        {/* Mobile Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsSidebarOpen(false)}
                            className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm lg:hidden"
                        />
                        <motion.div
                            initial={{ x: -320 }}
                            animate={{ x: 0 }}
                            exit={{ x: -320 }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed inset-y-0 left-0 z-[60] flex w-80 flex-col border-r border-border-base dark:border-white/5 bg-background-base backdrop-blur-xl lg:relative lg:flex h-full"
                        >
                            {/* Sidebar Header */}
                            <div className="flex h-16 items-center justify-between border-b border-border-base dark:border-white/5 px-4 bg-background-base/80 sticky top-0 z-10">
                                <Link
                                    to={isGuest ? "/home" : (isTeacher ? "/dashboard?mode=teacher" : "/dashboard")}
                                    onClick={() => setIsSidebarOpen(false)}
                                    className="flex items-center space-x-2 text-foreground-muted hover:text-foreground group"
                                >
                                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                                    <span className="text-sm font-medium">{isGuest ? t('nav.home') : t('chat.backToDashboard')}</span>
                                </Link>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsSidebarOpen(false)}
                                    className="h-10 w-10 p-0 text-foreground hover:text-red-600 hover:bg-red-500/10 transition-all rounded-full flex items-center justify-center shrink-0 border-2 border-border-base"
                                    title="Close"
                                >
                                    <X className="h-4 w-4" strokeWidth={2.5} />
                                </Button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {/* Connection Status and Action Buttons */}
                                <div className="flex items-center justify-between px-2 py-2 rounded-lg bg-accent/5 dark:bg-white/5">
                                    <div className="flex items-center gap-2">
                                        {isCheckingConnection ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-foreground-muted" />
                                        ) : isConnected ? (
                                            <Wifi className="h-4 w-4 text-green-500" />
                                        ) : (
                                            <WifiOff className="h-4 w-4 text-red-500" />
                                        )}
                                        <span className="text-xs text-foreground-muted">
                                            {isCheckingConnection ? "Connecting..." : isConnected ? "Connected" : "Offline"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {/* Starred filter toggle */}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowStarredOnly(!showStarredOnly)}
                                            className={cn(
                                                "h-8 w-8 p-0 text-foreground-muted hover:text-foreground",
                                                showStarredOnly && "text-yellow-500 hover:text-yellow-600"
                                            )}
                                            title={showStarredOnly ? "Show all chats" : "Show starred only"}
                                        >
                                            <Star className={cn("h-4 w-4", showStarredOnly && "fill-current")} />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleClearHistory}
                                            className="h-8 w-8 p-0 text-foreground-muted hover:text-red-500"
                                            title="Clear chat history"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                <Button
                                    onClick={handleNewChat}
                                    className="w-full justify-start gap-2 bg-accent/10 text-accent hover:bg-accent/20 border-accent/20"
                                    variant="outline"
                                >
                                    <Plus className="h-4 w-4" />
                                    New Chat
                                </Button>

                                <div className="space-y-2 pt-2">
                                    <h3 className="px-2 text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                                        {showStarredOnly ? "Starred" : "Today"}
                                    </h3>
                                    {displayedSessions.length > 0 ? (
                                        displayedSessions.map((session) => (
                                            <div
                                                key={session.id}
                                                className="flex items-center group"
                                            >
                                                <button
                                                    onClick={() => handleSelectSession(session.id)}
                                                    className={cn(
                                                        "flex-1 flex items-center space-x-3 rounded-lg px-2 py-2 text-sm transition-all",
                                                        currentSessionId === session.id
                                                            ? "bg-accent/10 text-accent font-medium ring-1 ring-accent/20"
                                                            : "text-foreground hover:bg-accent/5 dark:hover:bg-white/5"
                                                    )}
                                                >
                                                    <MessageSquare className={cn("h-4 w-4", currentSessionId === session.id ? "text-accent" : "text-foreground-muted")} />
                                                    <span className="truncate flex-1 text-left">{session.title || "Quantum Physics Basics"}</span>
                                                </button>
                                                {/* Star button - always visible (no opacity changes) */}
                                                <button
                                                    onClick={() => toggleStarred(session.id, session.starred)}
                                                    className={cn(
                                                        "flex items-center justify-center h-8 w-8 ml-1 rounded-md transition-all",
                                                        session.starred 
                                                            ? "text-yellow-400 hover:text-yellow-300 bg-yellow-500/10" 
                                                            : "text-foreground-muted hover:text-yellow-400"
                                                    )}
                                                    title={session.starred ? "Unstar" : "Star"}
                                                >
                                                    <Star className={cn("h-4 w-4", session.starred && "fill-current")} />
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="px-2 py-4 text-center rounded-lg border border-dashed border-border-base dark:border-white/5">
                                            <p className="text-xs text-foreground-muted">
                                                {showStarredOnly ? "No starred chats." : "No recent chats. Start a new one!"}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* User Section - At the bottom */}
                            <div className="mt-auto border-t border-border-base dark:border-white/5 p-4 bg-background-base/50">
                                <Link
                                    to="/profile"
                                    onClick={() => setIsSidebarOpen(false)}
                                    className="flex w-full items-center gap-3 rounded-xl p-3 transition-all hover:bg-accent/10 group bg-accent/5"
                                >
                                    <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center text-accent ring-2 ring-accent/20 group-hover:ring-accent/40 transition-all overflow-hidden shrink-0">
                                        {user?.profilePhoto ? (
                                            <img src={user.profilePhoto} alt="Avatar" className="h-full w-full object-cover" />
                                        ) : (
                                            <UserIcon className="h-5 w-5" />
                                        )}
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <p className="text-sm font-semibold text-foreground truncate group-hover:text-accent transition-colors">
                                            {user?.name || "Guest User"}
                                        </p>
                                        <p className="text-xs text-foreground-muted truncate capitalize">
                                            {user?.role || "Learning Member"}
                                        </p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-foreground-muted group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
                                </Link>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Main Chat Area */}
            <div className="flex flex-1 flex-col relative">
                {/* Search, Theme & Actions Top Bar */}
                {isTeacher && (
                    <div className="flex h-16 items-center justify-between border-b border-border-base dark:border-white/5 bg-background-base/50 px-4 sm:px-6 backdrop-blur-md">
                        <div className="flex items-center flex-1 gap-2">
                            <div className="relative flex-1 max-w-xs">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                    <MdSearch className="h-5 w-5 text-foreground-muted" />
                                </div>
                                <input
                                    type="text"
                                    placeholder={t('chat.searchPlaceholder') || "Search..."}
                                    className="block w-full rounded-full border-0 bg-white/50 dark:bg-white/5 py-1.5 pl-9 pr-4 text-sm text-foreground placeholder-foreground-subtle ring-1 ring-inset ring-gray-300 dark:ring-white/10 focus:ring-2 focus:ring-accent sm:text-sm sm:leading-6 backdrop-blur-sm transition-all focus:bg-white dark:focus:bg-white/10"
                                />
                            </div>

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={toggleTheme}
                                className="text-foreground-muted hover:text-foreground rounded-full hover:bg-white/10 shrink-0 h-9 w-9 sm:h-10 sm:w-10"
                            >
                                <svg className="hidden h-5 w-5 dark:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                <svg className="block h-5 w-5 dark:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                </svg>
                            </Button>
                            
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowSettings(true)}
                                className="text-foreground-muted hover:text-foreground rounded-full hover:bg-white/10 shrink-0 h-9 w-9 sm:h-10 sm:w-10"
                            >
                                <Settings className="h-5 w-5" />
                            </Button>
                        </div>

                        <div className="flex items-center space-x-1 sm:space-x-2">
                            <Button variant="ghost" size="sm" className="hidden sm:flex text-foreground-muted hover:text-foreground h-9">
                                <Share className="h-4 w-4 mr-2" /> {t('chat.share')}
                            </Button>
                            <Button size="sm" className="bg-accent text-white hover:bg-accent-bright h-9 px-3 sm:px-4">
                                <FileText className="h-4 w-4 sm:mr-2" />
                                <span className="hidden sm:inline">{t('chat.savePlan')}</span>
                            </Button>
                        </div>
                    </div>
                )}

                {/* Roadmap Topic Header - Shows when learning from a roadmap */}
                {currentTopic && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border-b border-border-base dark:border-white/5 bg-gradient-to-r from-accent/5 via-accent/10 to-accent/5 px-4 sm:px-6 py-3 sm:py-4"
                    >
                        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                                <Link
                                    to="/roadmaps"
                                    className="flex items-center gap-2 text-xs sm:text-sm text-foreground-muted hover:text-accent transition-colors"
                                >
                                    <Map className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                    <span className="max-w-[120px] sm:max-w-none truncate">{currentRoadmap?.title}</span>
                                </Link>
                                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-foreground-muted shrink-0" />
                                <div className="flex items-center gap-2">
                                    <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent shrink-0" />
                                    <span className="font-semibold text-sm sm:text-base text-foreground truncate max-w-[150px] sm:max-w-none">{currentTopic.title}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                                <Button
                                    size="sm"
                                    onClick={handleMarkComplete}
                                    disabled={markingComplete}
                                    className={cn(
                                        "flex-1 sm:flex-none gap-2 transition-all h-8 sm:h-9 py-0",
                                        isTopicCompleted
                                            ? "bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20"
                                            : "bg-accent text-white hover:bg-accent-bright"
                                    )}
                                >
                                    <CheckCircle className={cn("h-4 w-4", isTopicCompleted && "fill-current")} />
                                    <span className="text-xs sm:text-sm">{markingComplete ? "Saving..." : isTopicCompleted ? "Done" : "Mark Done"}</span>
                                </Button>
                                {nextTopic && isTopicCompleted && (
                                    <Link to={`/chat?roadmapId=${roadmapId}&topicId=${nextTopic.id}`} className="flex-1 sm:flex-none">
                                        <Button size="sm" variant="outline" className="w-full gap-2 border-accent/20 text-accent hover:bg-accent/5 h-8 sm:h-9 py-0 group">
                                            <span className="text-xs sm:text-sm">Next</span>
                                            <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-all" />
                                        </Button>
                                    </Link>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Sidebar Toggle (+ Icon) - Fixed at Bottom Left */}
                <AnimatePresence>
                    {!isSidebarOpen && (
                        <motion.button
                            initial={{ scale: 0, opacity: 0, rotate: -90 }}
                            animate={{ scale: 1, opacity: 1, rotate: 0 }}
                            exit={{ scale: 0, opacity: 0, rotate: 90 }}
                            onClick={() => setIsSidebarOpen(true)}
                            className="fixed bottom-6 left-6 z-50 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-accent text-white shadow-xl shadow-accent/40 transition-all active:scale-90 hover:scale-105"
                        >
                            <Plus className="h-6 w-6 sm:h-7 sm:w-7" />
                        </motion.button>
                    )}
                </AnimatePresence>

                {/* Messages */}
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-8" onScroll={() => {
                            const container = messagesContainerRef.current;
                            if (!container) return;
                            const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
                            if (nearBottom && showScrollDown) setShowScrollDown(false);
                        }}>
                    <div className="mx-auto max-w-3xl space-y-6">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={idx === messages.length - 1 ? "message-last" : ""}>
                                <MessageBubble
                                    message={msg}
                                    onEdit={(editedContent) => handleEditMessage(idx, editedContent)}
                                />
                            </div>
                        ))}

                        {/* Loading Indicator */}
                        {isLoading && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-3 p-4"
                            >
                                <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center">
                                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="text-sm text-foreground-muted">Thinking</span>
                                    <motion.span
                                        animate={{ opacity: [0.2, 1, 0.2] }}
                                        transition={{ repeat: Infinity, duration: 1.5 }}
                                        className="text-sm text-foreground-muted"
                                    >
                                        ...
                                    </motion.span>
                                </div>
                            </motion.div>
                        )}

                        <div ref={messagesEndRef} className="h-24"></div> {/* Spacer for bottom input */}
                    {showScrollDown && (
                        <button
                            onClick={() => {
                                const container = messagesContainerRef.current;
                                container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                                setShowScrollDown(false);
                            }}
                            className="fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-lg hover:scale-105 transition-transform"
                            title="Scroll to bottom"
                        >
                            <ChevronDown className="h-5 w-5" />
                        </button>
                    )}
                    </div>

                    {/* Input Area */}
                    <div className={cn(
                        "fixed bottom-0 left-0 w-full bg-gradient-to-t from-background-base via-background-base/95 to-transparent pb-4 sm:pb-6 pt-10 transition-all duration-300 z-40",
                        isSidebarOpen && "lg:pl-80"
                    )}>
                        <div className="mx-auto max-w-3xl px-4 relative">
                            {/* Mode Selector - Teacher Only */}
                            {isTeacher && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 z-20 flex justify-center">
                                    <motion.div
                                        layout
                                        onMouseEnter={() => setIsModeOpen(true)}
                                        onMouseLeave={() => setIsModeOpen(false)}
                                        onClick={() => setIsModeOpen(!isModeOpen)}
                                        className={cn(
                                            "overflow-hidden backdrop-blur-xl border shadow-lg cursor-pointer",
                                            isModeOpen
                                                ? "bg-background/90 border-border-base dark:border-white/10"
                                                : "bg-accent/10 border-accent/20 hover:bg-accent/20"
                                        )}
                                        initial={{ borderRadius: 24 }}
                                        animate={{
                                            borderRadius: isModeOpen ? 12 : 24,
                                        }}
                                        transition={{ type: "spring", stiffness: 260, damping: 20 }}
                                    >
                                        <div className="relative flex flex-col items-center justify-center p-1">
                                            <AnimatePresence mode="wait">
                                                {!isModeOpen ? (
                                                    <motion.div
                                                        key="label"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="px-4 py-1.5 flex items-center whitespace-nowrap"
                                                    >
                                                        <span className="text-xs font-bold uppercase tracking-wider text-accent">
                                                            {t(`chat.${teacherView.replace('_', '')}`) || teacherView.replace('_', ' ')}
                                                        </span>
                                                    </motion.div>
                                                ) : (
                                                    <motion.div
                                                        key="list"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="w-[200px] flex flex-col p-1 space-y-1"
                                                    >
                                                        {['Overview', 'Deep Dive', 'Classroom Plan'].map((view) => {
                                                            const isActive = teacherView === view.toLowerCase().replace(' ', '_');
                                                            return (
                                                                <button
                                                                    key={view}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setTeacherView(view.toLowerCase().replace(' ', '_'));
                                                                        setIsModeOpen(false);
                                                                    }}
                                                                    className={cn(
                                                                        "w-full text-center px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                                                                        isActive
                                                                            ? "bg-accent text-white shadow-sm"
                                                                            : "text-foreground-muted hover:bg-accent/10 hover:text-foreground"
                                                                    )}
                                                                >
                                                                    {t(`chat.${view.toLowerCase().replace(' ', '')}`) || view}
                                                                </button>
                                                            )
                                                        })}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </motion.div>
                                </div>
                            )}

                            <ChatInput
                                onSend={handleSend}
                                placeholder={isConnected ? t('chat.inputPlaceholder') : "Backend not connected..."}
                                disabled={isLoading || !isConnected}
                                onVoiceToggle={() => setIsVoiceMode(true)}
                            />
                            <p className="mt-2 text-center text-[10px] text-foreground-subtle">
                                {t('chat.disclaimer')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Settings Modal */}
                <AnimatePresence>
                    {showSettings && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full max-w-md bg-background-base border border-white/10 rounded-xl shadow-2xl p-6 space-y-6"
                            >
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xl font-semibold text-foreground">Settings</h3>
                                    <button
                                        onClick={() => setShowSettings(false)}
                                        className="text-foreground-muted hover:text-foreground transition-colors"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>

                                {/* Disappearing Chats Toggle */}
                                <div className="space-y-3 border-t border-b border-white/10 py-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-foreground">Disappearing Chats</p>
                                            <p className="text-sm text-foreground-muted mt-1">Chats and related content will automatically delete after 24 hours</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newValue = !disappearingChatsEnabled;
                                                setDisappearingChatsEnabled(newValue);
                                                // Update user preferences in localStorage
                                                if (user) {
                                                    const updatedUser = {
                                                        ...user,
                                                        preferences: {
                                                            ...user?.preferences,
                                                            disappearingChatsEnabled: newValue
                                                        }
                                                    };
                                                    localStorage.setItem('user', JSON.stringify(updatedUser));
                                                }
                                            }}
                                            className={cn(
                                                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                                disappearingChatsEnabled ? "bg-accent" : "bg-white/10"
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                                    disappearingChatsEnabled ? "translate-x-6" : "translate-x-1"
                                                )}
                                            />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <Button
                                        variant="ghost"
                                        onClick={() => setShowSettings(false)}
                                        className="flex-1 text-foreground-muted hover:text-foreground"
                                    >
                                        Close
                                    </Button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Limit Modal */}
                <AnimatePresence>
                    {showLimitModal && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full max-w-md bg-background-base border border-white/10 rounded-xl shadow-2xl p-6 text-center space-y-6"
                            >
                                <div className="space-y-2">
                                    <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                                        <MessageSquare className="h-6 w-6 text-accent" />
                                    </div>
                                    <h3 className="text-xl font-semibold text-foreground">Chat Limit Exceeded</h3>
                                    <p className="text-foreground-muted">
                                        You have reached the limit of 10 free messages. Please log in to continue chatting with unlimited access.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-3">
                                    <Link to="/login" className="w-full">
                                        <Button className="w-full">
                                            Log In to Continue
                                        </Button>
                                    </Link>
                                    <Button
                                        variant="ghost"
                                        onClick={() => setShowLimitModal(false)}
                                        className="text-foreground-muted hover:text-foreground"
                                    >
                                        Close
                                    </Button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Voice Overlay */}
                <VoiceOverlay
                    isOpen={isVoiceMode}
                    onClose={() => setIsVoiceMode(false)}
                />
            </div>
        </PageTransition>
    );
}