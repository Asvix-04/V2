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
import {
    ArrowLeft, BookOpen, ChevronRight, FileText, Layout, Lightbulb,
    MessageSquare, MoreHorizontal, Settings, Share, CheckCircle, Map,
    Trash2, AlertCircle, Loader2, Wifi, WifiOff, Plus, User as UserIcon, X,
    CornerDownRight, Star, Sparkles, Zap, ChevronDown
} from "lucide-react";
import { MdSearch } from "react-icons/md";
import chatbotApi from "../lib/chatbotApi";
import geminiApi from "../lib/geminiApi";
import api from "../lib/api";

const MODELS = [
    { id: "Default", name: "Default (DigiLab)", description: "Standard high-speed assistant.", icon: MessageSquare, color: "text-blue-500" },
    { id: "Gemini 2.5 Flash", name: "Gemini 2.5 Flash", description: "Speed and intelligence for everyday learning.", icon: Sparkles, color: "text-blue-500" },
    { id: "Gemini 2.5 Pro", name: "Gemini 2.5 Pro", description: "Advanced reasoning for high-stakes problems.", icon: Zap, color: "text-purple-500" }
];

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

const QuoteIcon = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M14.017 21L16.41 14.53H14.017V8H21.017V14.53L18.625 21H14.017ZM5.01697 21L7.41097 14.53H5.01697V8H12.017V14.53L9.62497 21H5.01697Z" />
    </svg>
);

// Extracted Component to prevent input focus loss
const QuotedTextPreview = ({ quotedText, onClear }) => (
    <AnimatePresence>
        {quotedText && (
            <motion.div
                id="quote-preview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="mb-3 flex w-full items-start justify-between gap-3 rounded-xl bg-blue-50/50 dark:bg-zinc-900 border border-blue-100 dark:border-zinc-800 px-4 py-3 shadow-sm backdrop-blur-md text-left"
            >
                <div className="flex items-start gap-3 overflow-hidden">
                    <CornerDownRight className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
                    <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200 italic">"{quotedText}"</span>
                </div>
                <button
                    onClick={onClear}
                    className="text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 p-1 rounded-full transition-colors shrink-0"
                >
                    <X className="h-4 w-4" />
                </button>
            </motion.div>
        )}
    </AnimatePresence>
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
    const [selectedLanguage, setSelectedLanguage] = React.useState('en-IN');
    const messagesEndRef = React.useRef(null);
    const [starredChats, setStarredChats] = React.useState(() => {
        try { return JSON.parse(localStorage.getItem('starredChats') || '[]'); } catch { return []; }
    });
    const [isDisappearingMode, setIsDisappearingMode] = React.useState(() => {
        try { return localStorage.getItem('disappearingMode') === 'true'; } catch { return false; }
    });

    // AI Model Selection
    const [selectedModel, setSelectedModel] = React.useState(MODELS[0]);
    const [isModelDropdownOpen, setIsModelDropdownOpen] = React.useState(false);

    React.useEffect(() => {
        localStorage.setItem('disappearingMode', isDisappearingMode);
    }, [isDisappearingMode]);

    React.useEffect(() => {
        localStorage.setItem('starredChats', JSON.stringify(starredChats));
    }, [starredChats]);

    const toggleStar = (id, e) => {
        e.stopPropagation();
        setStarredChats(prev => prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]);
    };

    const LANGUAGE_OPTIONS = [
        { code: 'en-IN', label: '🇮🇳 English' },
        { code: 'hi-IN', label: '🇮🇳 Hindi' },
        { code: 'ta-IN', label: '🇮🇳 Tamil' },
        { code: 'te-IN', label: '🇮🇳 Telugu' },
        { code: 'bn-IN', label: '🇮🇳 Bengali' },
        { code: 'mr-IN', label: '🇮🇳 Marathi' },
    ];

    // STATES FOR TEXT SELECTION & QUOTING
    const [selectionData, setSelectionData] = React.useState({
        text: "",
        x: 0,
        y: 0,
        visible: false
    });
    const [quotedText, setQuotedText] = React.useState(null);
    const [quoteType, setQuoteType] = React.useState('normal');

    const [greeting, setGreeting] = React.useState(() => {
        return GREETING_SENTENCES[Math.floor(Math.random() * GREETING_SENTENCES.length)];
    });

    // Selection Handling
    React.useEffect(() => {
        const handleSelectionChange = () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                setSelectionData(prev => ({ ...prev, visible: false }));
                return;
            }

            const text = selection.toString().trim();
            if (!text) {
                setSelectionData(prev => ({ ...prev, visible: false }));
                return;
            }

            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            if (!rect || rect.width === 0) {
                setSelectionData(prev => ({ ...prev, visible: false }));
                return;
            }

            let xPos = rect.left + rect.width / 2;
            const screenWidth = window.innerWidth;

            if (xPos < 80) xPos = 80;
            if (xPos > screenWidth - 80) xPos = screenWidth - 80;

            setSelectionData({
                text,
                x: xPos,
                y: rect.top,
                visible: true
            });
        };

        const hideTooltip = (e) => {
            if (!e.target.closest("#selection-tooltip")) {
                setSelectionData(prev => ({ ...prev, visible: false }));
            }
        };

        document.addEventListener("selectionchange", handleSelectionChange);
        document.addEventListener("mousedown", hideTooltip);

        return () => {
            document.removeEventListener("selectionchange", handleSelectionChange);
            document.removeEventListener("mousedown", hideTooltip);
        };
    }, []);

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

            if (!isGuest) {
                try {
                    const res = await api.get('/chat/sessions');
                    if (res.data && res.data.length > 0) {
                        setSessions(res.data);

                        // Load session from URL if present
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

    // Handle prompt from URL
    React.useEffect(() => {
        const prompt = searchParams.get("prompt");
        if (prompt && isConnected && messages.length === 1 && !isLoading) {
            handleSend(prompt);
            // Clear prompt from URL
            const newParams = new URLSearchParams(searchParams);
            newParams.delete("prompt");
            navigate({ search: newParams.toString() }, { replace: true });
        }
    }, [isConnected, searchParams, messages.length, isLoading]);

    // Auto scroll to bottom
    React.useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Handle Disappearing Messages (Auto-delete > 24h)
    React.useEffect(() => {
        if (!isDisappearingMode) return;

        const checkDisappearing = async () => {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const sessionsToDelete = sessions.filter(session => {
                const sessionDate = new Date(session.timestamp || session.updatedAt || session.createdAt);
                return sessionDate < twentyFourHoursAgo;
            });

            for (const session of sessionsToDelete) {
                try {
                    if (!isGuest) {
                        await api.delete(`/chat/sessions/${session.id}`);
                    }
                    setSessions(prev => prev.filter(s => s.id !== session.id));
                    if (currentSessionId === session.id) {
                        handleNewChat();
                    }
                } catch (err) {
                    console.error("Auto-delete failed for session:", session.id, err);
                }
            }
        };

        const interval = setInterval(checkDisappearing, 60000); // Check every minute
        checkDisappearing();
        return () => clearInterval(interval);
    }, [isDisappearingMode, sessions, isGuest, currentSessionId]);

    const handleDeleteSession = async (sessionId, e) => {
        if (e) e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this chat?")) return;

        try {
            if (!isGuest) {
                await api.delete(`/chat/sessions/${sessionId}`);
            }
            setSessions(prev => prev.filter(s => s.id !== sessionId));
            if (currentSessionId === sessionId) {
                setMessages([INITIAL_MESSAGE]);
                setCurrentSessionId(null);
            }
            setError(null);
        } catch (err) {
            console.error("Failed to delete session:", err);
            setError("Failed to delete chat session");
        }
    };


    const handleNewChat = async () => {
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
        setQuotedText(null);

        // Clear session from URL
        if (searchParams.has("sessionId")) {
            navigate("/chat", { replace: true });
        }

        // Pick new random greeting
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

        let displayContent = text;
        let apiPayload = text;

        if (quotedText) {
            displayContent = `> "${quotedText}"\n\n${text}`;
            if (quoteType === 'dive_deep') {
                apiPayload = `The user has highlighted the following specific text:\n"""\n${quotedText}\n"""\n\nUser's prompt: "${text}"\n\nINSTRUCTION: Please provide a deep dive explanation into the following concept, expanding on the highlighted text in extensive detail.`;
            } else if (quoteType === 'explore_more') {
                apiPayload = `The user has highlighted the following specific text:\n"""\n${quotedText}\n"""\n\nUser's prompt: "${text}"\n\nINSTRUCTION: Please help the user explore more related topics and expand on the context surrounding the highlighted text.`;
            } else {
                apiPayload = `The user has highlighted the following specific text:\n"""\n${quotedText}\n"""\n\nUser's prompt: "${text}"\n\nINSTRUCTION: Please focus your response strictly on explaining, elaborating, or answering the user's prompt entirely within the context of the highlighted text. Do not provide a general overview of the broader topic.`;
            }
            setQuotedText(null);
            setQuoteType('normal');
        }

        const userMsg = {
            role: "user",
            content: displayContent,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, userMsg]);

        // Call the real API (use textToText for non-English)
        setIsLoading(true);
        try {
            let response;
            if (selectedModel.id !== "Default") {
                response = await geminiApi.sendMessage(apiPayload, selectedModel.id);
            } else {
                response = selectedLanguage === 'en-IN'
                    ? await chatbotApi.sendMessage(apiPayload, !isIncognito)
                    : await chatbotApi.textToText(apiPayload, selectedLanguage, !isIncognito);
            }
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
                        // Update current sessionId if it was new
                        setSessions(prev => {
                            const filtered = prev.filter(s => s.id !== res.data.id);
                            return [res.data, ...filtered];
                        });

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

    // Handle voice-to-voice message result from VoiceOverlay
    const handleVoiceMessage = React.useCallback(({ transcription, answer, audioBase64 }) => {
        const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const userMsg = {
            role: 'user',
            content: transcription || '🎤 Voice message',
            timestamp: ts,
            isVoice: true,
        };
        const assistantMsg = {
            role: 'assistant',
            content: answer || '🔊 Audio response',
            timestamp: ts,
            isVoice: !!audioBase64,
        };
        setMessages(prev => [...prev, userMsg, assistantMsg]);
    }, []);

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
        <PageTransition className="relative flex h-screen w-full overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
            
            {/* Ask DigiLab Tooltip */}
            <AnimatePresence>
                {selectionData.visible && (
                    <div
                        id="selection-tooltip"
                        className="fixed z-[9999] -translate-x-1/2 -translate-y-full pb-2 pointer-events-auto drop-shadow-2xl flex gap-2"
                        style={{ left: selectionData.x, top: selectionData.y }}
                    >
                        <motion.button
                            initial={{ opacity: 0, y: 10, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.9 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            onClick={() => {
                                setQuoteType('normal');
                                setQuotedText(selectionData.text);
                                setSelectionData(prev => ({ ...prev, visible: false }));
                                window.getSelection().removeAllRanges();
                            }}
                            className="flex items-center gap-2 rounded-xl bg-zinc-900 dark:bg-zinc-800 px-3 py-2 text-sm font-medium text-white shadow-xl border border-white/10 hover:bg-zinc-800 dark:hover:bg-zinc-700 transition-colors"
                        >
                            <QuoteIcon className="h-3 w-3" />
                            Ask DigiLab
                        </motion.button>
                        <motion.button
                            initial={{ opacity: 0, y: 10, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.9 }}
                            transition={{ duration: 0.15, delay: 0.05, ease: "easeOut" }}
                            onClick={() => {
                                setQuoteType('dive_deep');
                                setQuotedText(selectionData.text);
                                setSelectionData(prev => ({ ...prev, visible: false }));
                                window.getSelection().removeAllRanges();
                            }}
                            className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-600/90 hover:bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-xl transition-colors backdrop-blur-md"
                        >
                            Dive Deep
                        </motion.button>
                        <motion.button
                            initial={{ opacity: 0, y: 10, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.9 }}
                            transition={{ duration: 0.15, delay: 0.1, ease: "easeOut" }}
                            onClick={() => {
                                setQuoteType('explore_more');
                                setQuotedText(selectionData.text);
                                setSelectionData(prev => ({ ...prev, visible: false }));
                                window.getSelection().removeAllRanges();
                            }}
                            className="flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-600/90 hover:bg-purple-600 px-3 py-2 text-sm font-medium text-white shadow-xl transition-colors backdrop-blur-md"
                        >
                            Explore More
                        </motion.button>
                    </div>
                )}
            </AnimatePresence>

            {/* Sidebar - Context / History */}
            <AnimatePresence>
                {isSidebarOpen && (
                    <>
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
                            className="fixed inset-y-0 left-0 z-[60] flex w-80 flex-col border-r border-zinc-200 dark:border-white/5 bg-white dark:bg-zinc-900 backdrop-blur-xl lg:relative lg:flex h-full"
                        >
                            <div className="flex h-16 items-center justify-between border-b border-zinc-200 dark:border-white/5 px-4 bg-white/80 dark:bg-zinc-900/80 sticky top-0 z-10">
                                <Link
                                    to={isGuest ? "/home" : (isTeacher ? "/dashboard?mode=teacher" : "/dashboard")}
                                    onClick={() => setIsSidebarOpen(false)}
                                    className="flex items-center space-x-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 group"
                                >
                                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                                    <span className="text-sm font-medium">{isGuest ? t('nav.home') : t('chat.backToDashboard')}</span>
                                </Link>

                                <button
                                    onClick={() => setIsSidebarOpen(false)}
                                    className="h-10 w-10 p-0 text-zinc-600 dark:text-zinc-400 hover:text-red-600 hover:bg-red-500/10 transition-all rounded-full flex items-center justify-center shrink-0 border-2 border-transparent"
                                    title="Close"
                                >
                                    <X className="h-4 w-4" strokeWidth={2.5} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between px-2 bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-200 dark:border-white/5 shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <div className={cn("p-1.5 rounded-lg", isDisappearingMode ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400")}>
                                                <Loader2 className={cn("h-4 w-4", isDisappearingMode && "animate-spin-slow")} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Disappearing</p>
                                                <p className="text-[10px] text-zinc-500 font-medium line-clamp-1">Auto-delete after 24h</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setIsDisappearingMode(!isDisappearingMode)}
                                            className={cn(
                                                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                                isDisappearingMode ? "bg-orange-500" : "bg-zinc-300 dark:bg-zinc-700"
                                            )}
                                        >
                                            <span className={cn(
                                                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                                isDisappearingMode ? "translate-x-4" : "translate-x-0"
                                            )} />
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={handleNewChat}
                                    className="w-full flex items-center justify-start gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-900/50 rounded-lg px-4 py-2 font-medium transition-colors"
                                >
                                    <Plus className="h-4 w-4" />
                                    New Chat
                                </button>

                                <div className="space-y-2 pt-2">
                                    <h3 className="px-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('chat.today')}</h3>
                                    {sessions.length > 0 ? (
                                        [...sessions]
                                            .sort((a, b) => {
                                                const aStarred = starredChats.includes(a.id);
                                                const bStarred = starredChats.includes(b.id);
                                                if (aStarred && !bStarred) return -1;
                                                if (!aStarred && bStarred) return 1;
                                                return 0;
                                            })
                                            .map((session) => (
                                            <button
                                                key={session.id}
                                                onClick={() => handleSelectSession(session.id)}
                                                className={cn(
                                                    "flex w-full items-center space-x-3 rounded-lg px-2 py-2 text-sm transition-all group",
                                                    currentSessionId === session.id
                                                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium ring-1 ring-blue-200 dark:ring-blue-900/50"
                                                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5"
                                                )}
                                            >
                                                <MessageSquare className={cn("h-4 w-4 shrink-0", currentSessionId === session.id ? "text-blue-600 dark:text-blue-400" : "text-zinc-400")} />
                                                <span className="truncate flex-1 text-left">{session.title}</span>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => toggleStar(session.id, e)}
                                                        className={cn(
                                                            "p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors",
                                                            starredChats.includes(session.id) ? "text-yellow-400" : "text-zinc-400"
                                                        )}
                                                        title="Star chat"
                                                    >
                                                        <Star className={cn("h-3.5 w-3.5", starredChats.includes(session.id) && "fill-yellow-400")} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDeleteSession(session.id, e)}
                                                        className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 transition-colors"
                                                        title="Delete chat"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="px-2 py-4 text-center rounded-lg border border-dashed border-zinc-200 dark:border-white/5">
                                            <p className="text-xs text-zinc-400">No recent chats. Start a new one!</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-auto border-t border-zinc-200 dark:border-white/5 p-4 bg-zinc-50 dark:bg-zinc-900/50">
                                <Link
                                    to="/profile"
                                    onClick={() => setIsSidebarOpen(false)}
                                    className="flex w-full items-center gap-3 rounded-xl p-3 transition-all hover:bg-zinc-100 dark:hover:bg-white/5 group bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/5"
                                >
                                    <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 ring-2 ring-blue-100 dark:ring-blue-900/30 group-hover:ring-blue-200 dark:group-hover:ring-blue-900/50 transition-all overflow-hidden shrink-0">
                                        {user?.profilePhoto ? (
                                            <img src={user.profilePhoto} alt="Avatar" className="h-full w-full object-cover" />
                                        ) : (
                                            <UserIcon className="h-5 w-5" />
                                        )}
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                            {user?.name || "Guest User"}
                                        </p>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate capitalize">
                                            {user?.role || "Learning Member"}
                                        </p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                                </Link>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Main Chat Area */}
            <div className="flex flex-1 flex-col relative">
                <div className={cn(
                    "flex h-16 items-center px-4 sm:px-6 transition-all duration-300 z-50 sticky top-0 backdrop-blur-md border-b",
                    isIncognito ? "bg-zinc-900 justify-between border-white/5" : "bg-white/50 dark:bg-zinc-950/50 border-transparent justify-end"
                )}>
                    {isIncognito ? (
                        /* Incognito label */
                        <div className="flex items-center gap-2">
                            <IncognitoIcon className="h-5 w-5 text-zinc-300" />
                            <span className="text-sm font-semibold text-zinc-200 tracking-tight">Incognito chat</span>
                        </div>
                    ) : (
                        /* Normal mode nav links */
                        <div className="flex items-center gap-1">
                            <Link
                                to="/home"
                                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/10 transition-all"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                <span className="hidden sm:inline">Home</span>
                            </Link>
                            {!isGuest && (
                                <Link
                                    to={isTeacher ? "/dashboard?mode=teacher" : "/dashboard"}
                                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/10 transition-all"
                                >
                                    <Layout className="h-4 w-4" />
                                    <span className="hidden sm:inline">Dashboard</span>
                                </Link>
                            )}
                        </div>
                    )}

                    {!isIncognito && (
                        <div className="relative mr-2">
                            <button
                                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 transition-all"
                            >
                                <selectedModel.icon className={cn("h-4 w-4", selectedModel.color)} />
                                <span className="hidden sm:inline">{selectedModel.name}</span>
                                <ChevronDown className={cn("h-3 w-3 transition-transform", isModelDropdownOpen && "rotate-180")} />
                            </button>

                            <AnimatePresence>
                                {isModelDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setIsModelDropdownOpen(false)} />
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            className="absolute right-0 mt-2 w-64 sm:w-72 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-xl z-50 overflow-hidden"
                                        >
                                            <div className="p-2 space-y-1">
                                                {MODELS.map((m) => (
                                                    <button
                                                        key={m.id}
                                                        onClick={() => {
                                                            setSelectedModel(m);
                                                            setIsModelDropdownOpen(false);
                                                        }}
                                                        className={cn(
                                                            "w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all",
                                                            selectedModel.id === m.id
                                                                ? "bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-900/50"
                                                                : "hover:bg-zinc-50 dark:hover:bg-white/5"
                                                        )}
                                                    >
                                                        <m.icon className={cn("h-5 w-5 mt-0.5", m.color)} />
                                                        <div>
                                                            <div className={cn("text-sm font-semibold", selectedModel.id === m.id ? "text-blue-600 dark:text-blue-400" : "text-zinc-900 dark:text-zinc-100")}>
                                                                {m.name}
                                                            </div>
                                                            <div className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                                                                {m.description}
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    <button
                        onClick={() => {
                            setIsIncognito(prev => {
                                if (!prev) setIsSidebarOpen(false); // close sidebar when turning on incognito
                                return !prev;
                            });
                        }}
                        title={isIncognito ? "Turn off incognito" : "Turn on incognito"}
                        className={cn(
                            "transition-all duration-200 p-2 rounded-full outline-none focus:outline-none ml-2",
                            isIncognito
                                ? "text-zinc-400 hover:text-white hover:bg-white/5"
                                : "text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5"
                        )}
                    >
                        {isIncognito ? <X className="h-5 w-5" /> : <IncognitoIcon className="h-7 w-7" />}
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {isIncognito ? (
                        <motion.div
                            key="incognito-chat"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-1 flex-col bg-zinc-900 text-white overflow-hidden"
                        >
                            {messages.length <= 1 ? (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex-1 flex flex-col items-center justify-center px-6"
                                >
                                    <div className="mb-8 p-4 rounded-3xl bg-white/5 transition-transform hover:scale-105 active:scale-95 cursor-default">
                                        <IncognitoIcon className="h-16 w-16 text-zinc-100" />
                                    </div>
                                    <h2 className="text-3xl sm:text-4xl font-semibold text-white mb-6 tracking-tight">
                                        You're incognito
                                    </h2>

                                    <div className="w-full max-w-4xl mb-8 relative">
                                        <QuotedTextPreview
                                            quotedText={quotedText}
                                            onClear={() => setQuotedText(null)}
                                        />
                                        <ChatInput
                                            onSend={handleSend}
                                            placeholder={isConnected ? t('chat.inputPlaceholder') || "How can I help?" : "Backend not connected..."}
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
                                    <div className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                        <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
                                            {messages.map((msg, idx) => (
                                                <MessageBubble key={idx} message={msg} />
                                            ))}
                                            <div ref={messagesEndRef} className="h-16 sm:h-24"></div>
                                        </div>
                                    </div>

                                    <div className="w-full pb-3 sm:pb-4 lg:pb-6 pt-3 sm:pt-4 z-40 bg-gradient-to-t from-zinc-900 to-transparent">
                                        <div className="mx-auto max-w-4xl px-3 sm:px-4 relative text-center">
                                            <QuotedTextPreview
                                                quotedText={quotedText}
                                                onClear={() => setQuotedText(null)}
                                            />
                                            <ChatInput
                                                onSend={handleSend}
                                                placeholder={isConnected ? t('chat.inputPlaceholder') || "How can I help?" : "Backend not connected..."}
                                                disabled={isLoading || !isConnected}
                                                onVoiceToggle={() => setIsVoiceMode(true)}
                                            />
                                            <p className="mt-2 text-center text-[10px] text-zinc-500">
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
                            <AnimatePresence>
                                {!isSidebarOpen && (
                                    <motion.button
                                        initial={{ scale: 0, opacity: 0, rotate: -90 }}
                                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                        exit={{ scale: 0, opacity: 0, rotate: 90 }}
                                        onClick={() => setIsSidebarOpen(true)}
                                        className="fixed bottom-6 left-6 z-50 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-500/40 transition-all active:scale-90 hover:scale-105"
                                    >
                                        <Plus className="h-6 w-6 sm:h-7 sm:w-7" />
                                    </motion.button>
                                )}
                            </AnimatePresence>

                            {currentTopic && (
                                <div className="border-b border-zinc-200 dark:border-white/5 bg-blue-50/50 dark:bg-blue-900/10 px-4 sm:px-6 py-3 sm:py-4">
                                    <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
                                        <div className="flex items-center gap-2 sm:gap-4">
                                            <Link
                                                to="/roadmaps"
                                                className="flex items-center gap-2 text-xs sm:text-sm text-zinc-500 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400 transition-colors"
                                            >
                                                <Map className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                                <span className="max-w-[120px] sm:max-w-none truncate">{currentRoadmap?.title}</span>
                                            </Link>
                                            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-zinc-400 shrink-0" />
                                            <div className="flex items-center gap-2">
                                                <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                                                <span className="font-semibold text-sm sm:text-base text-zinc-900 dark:text-zinc-100 truncate max-w-[150px] sm:max-w-none">{currentTopic.title}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                                            <Button
                                                size="sm"
                                                onClick={handleMarkComplete}
                                                disabled={markingComplete}
                                                className={cn(
                                                    "flex-1 sm:flex-none gap-2 transition-all h-8 sm:h-9 py-0 rounded-lg text-sm",
                                                    isTopicCompleted
                                                        ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-900/50 hover:bg-green-100 dark:hover:bg-green-900/40"
                                                        : "bg-blue-600 text-white hover:bg-blue-700"
                                                )}
                                            >
                                                <CheckCircle className={cn("h-4 w-4", isTopicCompleted && "fill-current")} />
                                                <span>{markingComplete ? "Saving..." : isTopicCompleted ? "Done" : "Mark Done"}</span>
                                            </Button>
                                            {nextTopic && isTopicCompleted && (
                                                <Link to={`/chat?roadmapId=${roadmapId}&topicId=${nextTopic.id}`} className="flex-1 sm:flex-none">
                                                    <Button size="sm" variant="outline" className="w-full gap-2 border-blue-200 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 h-8 sm:h-9 py-0 group rounded-lg text-sm">
                                                        <span>Next</span>
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
                                    <h1 className="text-4xl font-bold tracking-tight mb-6">{greeting}</h1>

                                    {/* Language selector */}
                                    <div className="mb-4 flex justify-center">
                                        <select
                                            value={selectedLanguage}
                                            onChange={(e) => setSelectedLanguage(e.target.value)}
                                            className="text-xs rounded-full border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-zinc-500 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500/50 cursor-pointer transition-all"
                                        >
                                            {LANGUAGE_OPTIONS.map(opt => (
                                                <option key={opt.code} value={opt.code}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="w-full relative px-4">
                                        <QuotedTextPreview
                                            quotedText={quotedText}
                                            onClear={() => setQuotedText(null)}
                                        />
                                        <ChatInput
                                            onSend={handleSend}
                                            placeholder={isConnected ? t('chat.inputPlaceholder') || "How can I help?" : "Backend not connected..."}
                                            disabled={isLoading || !isConnected}
                                            onVoiceToggle={() => setIsVoiceMode(true)}
                                        />
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    <div className="flex-1 overflow-y-auto p-4 sm:p-8" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                        <div className="mx-auto max-w-5xl space-y-6">
                                            {messages.map((msg, idx) => (
                                                <MessageBubble key={idx} message={msg} />
                                            ))}

                                            {isLoading && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="flex items-center gap-3 p-4"
                                                >
                                                    <div className="h-8 w-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                                                        <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-sm text-zinc-500 dark:text-zinc-400">Thinking</span>
                                                        <motion.span
                                                            animate={{ opacity: [0.2, 1, 0.2] }}
                                                            transition={{ repeat: Infinity, duration: 1.5 }}
                                                            className="text-sm text-zinc-500 dark:text-zinc-400"
                                                        >
                                                            ...
                                                        </motion.span>
                                                    </div>
                                                </motion.div>
                                            )}
                                            <div ref={messagesEndRef} className="h-24"></div>
                                        </div>
                                    </div>

                                    <div className="w-full bg-gradient-to-t from-white dark:from-zinc-950 to-transparent pb-4 sm:pb-6 pt-4 z-40">
                                        <div className="mx-auto max-w-4xl px-4 relative">
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
                                                                ? "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/10"
                                                                : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/30"
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
                                                                        <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
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
                                                                                            ? "bg-blue-600 text-white shadow-sm"
                                                                                            : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-100"
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

                                            <QuotedTextPreview
                                                quotedText={quotedText}
                                                onClear={() => setQuotedText(null)}
                                            />
                                           
                                            <ChatInput
                                                onSend={handleSend}
                                                placeholder={isConnected ? t('chat.inputPlaceholder') || "How can I help?" : "Backend not connected..."}
                                                disabled={isLoading || !isConnected}
                                                onVoiceToggle={() => setIsVoiceMode(true)}
                                            />
                                            <div className="mt-2 flex items-center justify-between px-1">
                                                <select
                                                    value={selectedLanguage}
                                                    onChange={(e) => setSelectedLanguage(e.target.value)}
                                                    className="text-xs rounded-full border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-zinc-500 px-3 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500/50 cursor-pointer transition-all"
                                                >
                                                    {LANGUAGE_OPTIONS.map(opt => (
                                                        <option key={opt.code} value={opt.code}>{opt.label}</option>
                                                    ))}
                                                </select>
                                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                                    {t('chat.disclaimer') || "Content generated by AI may contain errors."}
                                                </p>
                                            </div>
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
                                className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl p-6 text-center space-y-6"
                            >
                                <div className="space-y-2">
                                    <div className="h-12 w-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
                                        <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">Chat Limit Exceeded</h3>
                                    <p className="text-zinc-500 dark:text-zinc-400">
                                        You have reached the limit of 10 free messages. Please log in to continue chatting with unlimited access.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-3">
                                    <Link to="/login" className="w-full">
                                        <Button className="w-full bg-blue-600 text-white hover:bg-blue-700">
                                            Log In to Continue
                                        </Button>
                                    </Link>
                                    <Button
                                        variant="ghost"
                                        onClick={() => setShowLimitModal(false)}
                                        className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
                    onVoiceMessage={handleVoiceMessage}
                    responseLanguage={selectedLanguage}
                    isIncognito={isIncognito}
                />
            </div>
        </PageTransition>
    );
}