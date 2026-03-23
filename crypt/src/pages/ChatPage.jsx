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
import { ArrowLeft, ChevronRight, FileText, Layout, Lightbulb, MessageSquare, MoreHorizontal, Settings, Share, CheckCircle, Map, Trash2, AlertCircle, Loader2, Wifi, WifiOff, Plus, User as UserIcon, X } from "lucide-react";
import { Logo } from "../components/ui/Logo";
import { MdSearch } from "react-icons/md";
import chatbotApi from "../lib/chatbotApi";
import api from "../lib/api";

const INITIAL_MESSAGE = {
    role: "assistant",
    content: "Hello! I am DigiLab, your personal learning assistant. How can I help you today?",
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

const GREETING_SENTENCES = [
    "How can I help you?",
    "What's on your mind?",
    "What is your today's agenda?",
    "How can I assist you today?",
    "What would you like to explore?",
    "Ready to start something new?",
    "What's the plan for today?"
];

const IncognitoIcon = ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="11" fill="#1a1a1a" />
        <circle cx="12" cy="12" r="11" stroke="#4a5568" strokeWidth="1.2" />
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 7C10 7 8.3 8.1 7.4 9.8h9.2C15.7 8.1 14 7 12 7zM5 11v1h14v-1H5zm11 1.5c-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5 2.5-1.1 2.5-2.5-1.1-2.5-2.5-2.5zm-8 0c-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5 2.5-1.1 2.5-2.5-1.1-2.5-2.5-2.5zm3.5 3h1v1h-1v-1z"
            fill="white"
        />
    </svg>
);

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
    const [isVoiceMode, setIsVoiceMode] = React.useState(false);

    // API integration states
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [isConnected, setIsConnected] = React.useState(false);
    const [isCheckingConnection, setIsCheckingConnection] = React.useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(window.innerWidth >= 1024);
    const [isIncognito, setIsIncognito] = React.useState(false);
    const messagesEndRef = React.useRef(null);

    const [greeting, setGreeting] = React.useState(() => {
        return GREETING_SENTENCES[Math.floor(Math.random() * GREETING_SENTENCES.length)];
    });

    // Check backend health and fetch sessions on mount
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
                        setSessions(res.data);

                        const sessionId = searchParams.get("sessionId");
                        if (sessionId) {
                            const found = res.data.find(s => s.id === sessionId);
                            if (found) {
                                setCurrentSessionId(found.id);
                                setMessages(found.messages);
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch sessions from DB:", err);
                }
            }
        };
        initChat();
    }, [isGuest]);

    // Handle incoming prompt from URL
    React.useEffect(() => {
        const prompt = searchParams.get("prompt");
        // Only trigger if we have a prompt, we're connected, and it's a fresh chat (only initial message)
        if (prompt && isConnected && messages.length === 1 && !isLoading) {
            handleSend(prompt);

            // Clean up the URL to avoid re-triggering on refresh if user stays on page
            const newParams = new URLSearchParams(searchParams);
            newParams.delete("prompt");
            navigate({ search: newParams.toString() }, { replace: true });
        }
    }, [isConnected, searchParams, messages.length, isLoading]);

    // Scroll to bottom when messages change
    React.useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Clear all chat history
    const handleClearHistory = async () => {
        if (!window.confirm("Are you sure you want to clear all chat history?")) return;

        try {
            // Clear from AI Backend memory (Python)
            await chatbotApi.clearHistory();

            // Clear all from Database (Node.js/Firestore)
            if (!isGuest) {
                await api.delete('/chat/sessions');
            }

            setMessages([INITIAL_MESSAGE]);
            setSessions([]);
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
                timestamp: new Date().toISOString()
            };

            // Avoid duplicates
            setSessions(prev => {
                const filtered = prev.filter(s => s.id !== lastSession.id);
                return [lastSession, ...filtered];
            });
        }

        setMessages([INITIAL_MESSAGE]);
        setCurrentSessionId(null);
        setError(null);

        // Clear sessionId from URL if present
        if (searchParams.has("sessionId")) {
            navigate("/chat", { replace: true });
        }

        // Pick a new random greeting that's different from the current one
        setGreeting(prev => {
            const others = GREETING_SENTENCES.filter(g => g !== prev);
            return others[Math.floor(Math.random() * others.length)];
        });

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
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, userMsg]);

        // Call the real API
        setIsLoading(true);
        try {
            const response = await chatbotApi.sendMessage(text);
            const assistantMsg = {
                role: "assistant",
                content: response.answer,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };

            const updatedMessages = [...messages, userMsg, assistantMsg];
            setMessages(updatedMessages);

            // Save to Database (Node.js/Firestore)
            if (!isGuest && !isIncognito) {
                try {
                    const sessionTitle = currentSessionId
                        ? sessions.find(s => s.id === currentSessionId)?.title
                        : text.substring(0, 30) + "...";

                    const res = await api.post('/chat/sessions', {
                        sessionId: currentSessionId,
                        messages: updatedMessages,
                        title: sessionTitle
                    });

                    if (res.data) {
                        // Always move the updated/new session to the top of the list
                        setSessions(prev => {
                            const filtered = prev.filter(s => s.id !== res.data.id);
                            return [res.data, ...filtered];
                        });

                        // Update current sessionId if it was new
                        if (!currentSessionId) {
                            setCurrentSessionId(res.data.id);
                        }
                    }
                } catch (dbErr) {
                    console.error("Failed to save history to DB:", dbErr);
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
                isError: true,
            }];
            setMessages(updatedWithErr);

            // Save error message state to DB too? 
            // Usually better to only save successful exchanges, but persistent error state can be helpful.
            if (!isGuest && !isIncognito) {
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

    const handleNewChatRef = React.useRef(handleNewChat);
    React.useEffect(() => {
        handleNewChatRef.current = handleNewChat;
    });

    React.useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.altKey && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                handleNewChatRef.current();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

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
                                {/* Clear History */}
                                <div className="flex items-center justify-end px-2 py-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleClearHistory}
                                        className="h-8 px-2 text-foreground-muted hover:text-red-500"
                                        title="Clear chat history"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
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
                                    <h3 className="px-2 text-xs font-semibold text-foreground-muted uppercase tracking-wider">{t('chat.today')}</h3>
                                    {sessions.length > 0 ? (
                                        sessions.map((session) => (
                                            <button
                                                key={session.id}
                                                onClick={() => handleSelectSession(session.id)}
                                                className={cn(
                                                    "flex w-full items-center space-x-3 rounded-lg px-2 py-2 text-sm transition-all",
                                                    currentSessionId === session.id
                                                        ? "bg-accent/10 text-accent font-medium ring-1 ring-accent/20"
                                                        : "text-foreground hover:bg-accent/5 dark:hover:bg-white/5"
                                                )}
                                            >
                                                <MessageSquare className={cn("h-4 w-4", currentSessionId === session.id ? "text-accent" : "text-foreground-muted")} />
                                                <span className="truncate flex-1 text-left">{session.title || "Quantum Physics Basics"}</span>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="px-2 py-4 text-center rounded-lg border border-dashed border-border-base dark:border-white/5">
                                            <p className="text-xs text-foreground-muted">No recent chats. Start a new one!</p>
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
                {/* Header Bar */}
                <div className={cn(
                    "flex h-16 items-center px-4 sm:px-6 transition-all duration-300 z-50 sticky top-0 backdrop-blur-md",
                    isIncognito ? "bg-[#1a1a1a] justify-between border-b border-white/5" : "bg-background-base/50 justify-end"
                )}>
                    {isIncognito && (
                        <div className="flex items-center gap-2">
                            <IncognitoIcon className="h-5 w-5 text-slate-300" />
                            <span className="text-sm font-semibold text-slate-200 tracking-tight">Incognito chat</span>
                        </div>
                    )}

                    {/* Incognito Toggle */}
                    <button
                        onClick={() => setIsIncognito(!isIncognito)}
                        title={isIncognito ? "Turn off incognito" : "Turn on incognito"}
                        className={cn(
                            "transition-all duration-200 p-2 rounded-full outline-none focus:outline-none",
                            isIncognito
                                ? "text-slate-400 hover:text-white hover:bg-white/5"
                                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                    >
                        {isIncognito ? <X className="h-5 w-5" /> : <IncognitoIcon className="h-7 w-7" />}
                    </button>
                </div>


                {/* ── CHAT CONTENT ── */}
                <AnimatePresence mode="wait">
                    {isIncognito ? (
                        <motion.div
                            key="incognito-chat"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-1 flex-col bg-[#1a1a1a] text-white overflow-hidden"
                        >
                            {messages.length <= 1 ? (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex-1 flex flex-col items-center justify-center px-6"
                                >
                                    <div className="mb-8 p-4 rounded-3xl bg-white/5 transition-transform hover:scale-105 active:scale-95 cursor-default">
                                        <IncognitoIcon className="h-16 w-16 text-slate-100" />
                                    </div>
                                    <h2 className="text-3xl sm:text-4xl font-semibold text-white mb-6 tracking-tight">
                                        You're incognito
                                    </h2>

                                    <div className="w-full max-w-4xl mb-8">
                                        <ChatInput
                                            onSend={handleSend}
                                            placeholder={isConnected ? "How can I help you today?" : "Backend not connected..."}
                                            disabled={isLoading || !isConnected}
                                            onVoiceToggle={() => setIsVoiceMode(true)}
                                        />
                                    </div>

                                    <div className="text-center max-w-md space-y-2 opacity-60">
                                        <p className="text-sm font-medium">
                                            Incognito chats aren't saved to history or used to train models.
                                        </p>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                                        <div className="mx-auto max-w-4xl space-y-6">
                                            {messages.map((msg, idx) => (
                                                <MessageBubble
                                                    key={idx}
                                                    message={msg}
                                                />
                                            ))}
                                            <div ref={messagesEndRef} className="h-24"></div>
                                        </div>
                                    </div>

                                    {/* Bottom Input Area */}
                                    <div className={cn(
                                        "w-full pb-4 sm:pb-6 pt-4 z-40 bg-gradient-to-t from-[#1a1a1a] to-transparent",
                                    )}>
                                        <div className="mx-auto max-w-4xl px-4 relative text-center">
                                            <ChatInput
                                                onSend={handleSend}
                                                placeholder={isConnected ? "How can I help you today?" : "Backend not connected..."}
                                                disabled={isLoading || !isConnected}
                                                onVoiceToggle={() => setIsVoiceMode(true)}
                                            />
                                            <p className="mt-2 text-[10px] text-slate-500">
                                                Incognito chats aren't saved to history.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="normal-chat"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col flex-1 overflow-hidden"
                        >
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

                            {currentTopic && (
                                <div className="border-b border-border-base dark:border-white/5 bg-gradient-to-r from-accent/5 via-accent/10 to-accent/5 px-4 sm:px-6 py-3 sm:py-4">
                                    <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
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
                                                <Logo className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent shrink-0" />
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
                                </div>
                            )}

                            {messages.length <= 1 ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex-1 flex flex-col items-center justify-center p-4 max-w-4xl mx-auto w-full"
                                >
                                    <div className="text-center mb-10">
                                        <div className="h-20 w-20 bg-accent/10 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-sm border border-accent/5">
                                            <MessageSquare className="h-10 w-10 text-accent" />
                                        </div>
                                        <h1 className="text-4xl font-bold tracking-tight mb-3">{greeting}</h1>
                                    </div>

                                    <div className="w-full relative px-4">
                                        <ChatInput
                                            onSend={handleSend}
                                            placeholder={isConnected ? t('chat.inputPlaceholder') : "Backend not connected..."}
                                            disabled={isLoading || !isConnected}
                                            onVoiceToggle={() => setIsVoiceMode(true)}
                                        />
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                                        <div className="mx-auto max-w-4xl space-y-6">
                                            {messages.map((msg, idx) => (
                                                <MessageBubble
                                                    key={idx}
                                                    message={msg}
                                                />
                                            ))}

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
                                            <div ref={messagesEndRef} className="h-24"></div>
                                        </div>
                                    </div>

                                    {/* Bottom Input Area */}
                                    <div className="w-full bg-gradient-to-t from-background-base via-background-base/95 to-transparent pb-4 sm:pb-6 pt-4 z-40">
                                        <div className="mx-auto max-w-4xl px-4 relative">
                                            {/* Mode Selector - Teacher Only */}
                                            {isTeacher && (
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 z-20 flex justify-center">
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
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Limit Modal */}
                <AnimatePresence>
                    {showLimitModal && (
                        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
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

                <VoiceOverlay
                    isOpen={isVoiceMode}
                    onClose={() => setIsVoiceMode(false)}
                />
            </div>
        </PageTransition>
    );
}
