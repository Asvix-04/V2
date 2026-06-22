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

import {
    ArrowLeft, BookOpen, Check, ChevronLeft, ChevronRight, FileText, Layout, Lightbulb,
    MessageSquare, MoreHorizontal, Settings, Share, CheckCircle, Map,
    Trash2, AlertCircle, Loader2, Wifi, WifiOff, Plus, User as UserIcon, X,
    CornerDownRight, Sparkles, Zap, ChevronDown, Star, Menu,
    MoreVertical, MessageSquareDashed
} from "lucide-react";
import { MdSearch } from "react-icons/md";

import chatbotApi from "../lib/chatbotApi";
import api from "../lib/api";

const MODELS = [
    { id: "Gemini 2.5 Flash", name: "Gemini 2.5 Flash", description: "Speed and intelligence for everyday learning.", icon: Sparkles, color: "text-blue-500" },
    { id: "Gemini 2.5 Pro", name: "Gemini 2.5 Pro", description: "Advanced reasoning for high-stakes problems.", icon: Zap, color: "text-purple-500" }
];



const INITIAL_MESSAGE = {
    id: "initial-assistant-message",

    role: "assistant",

    content: "Hello! I am DigiLab, your personal learning assistant. How can I help you today?",

    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),

};

const createMessageId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const withMessageId = (message) => ({
    id: message?.id || createMessageId(),
    ...message,
});

const getMessageDomId = (message, index) => message?.id || `message-${index}`;



const GREETING_SENTENCES = [

    "How can I help you?",

    "What's on your mind?",

    "What is your today's agenda?",

    "How can I assist you today?",

    "What would you like to explore?",

    "Ready to start something new?",

    "What's the plan for today?"

];

const ACTIVE_DRAFT_STORAGE_PREFIX = "digilab-active-draft:";
const PENDING_DRAFT_STORAGE_PREFIX = "digilab-pending-draft:";
const DISAPPEARING_MODE_STORAGE_KEY = "disappearingMode";
const DISAPPEARING_EXPIRY_STORAGE_PREFIX = "chat_expiry_";
const DISAPPEARING_TTL_MS = 24 * 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

const CHAT_SESSION_SOURCE = {
    DRAFTS: "drafts",
    TODAY: "today",
};

const parseStoredActiveDraft = (value) => {
    if (!value) {
        return null;
    }

    try {
        const parsed = JSON.parse(value);

        if (parsed && typeof parsed === "object" && typeof parsed.sessionId === "string" && parsed.sessionId) {
            return {
                sessionId: parsed.sessionId,
                source: parsed.source === CHAT_SESSION_SOURCE.TODAY
                    ? CHAT_SESSION_SOURCE.TODAY
                    : CHAT_SESSION_SOURCE.DRAFTS,
            };
        }
    } catch (error) {
        // Backward compatibility for legacy plain-string storage.
    }

    return typeof value === "string" && value
        ? { sessionId: value, source: CHAT_SESSION_SOURCE.DRAFTS }
        : null;
};

const parsePendingDraftSnapshot = (value) => {
    if (!value) {
        return null;
    }

    try {
        const parsed = JSON.parse(value);
        const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];

        if (messages.length <= 1) {
            return null;
        }

        return {
            sessionId: typeof parsed.sessionId === "string" && parsed.sessionId ? parsed.sessionId : null,
            title: typeof parsed.title === "string" && parsed.title.trim()
                ? parsed.title
                : getSessionTitle(messages),
            source: parsed.source === CHAT_SESSION_SOURCE.TODAY
                ? CHAT_SESSION_SOURCE.TODAY
                : CHAT_SESSION_SOURCE.DRAFTS,
            messages,
        };
    } catch (error) {
        return null;
    }
};

const resolveSessionSource = (session, preferredSource = null) => {
    if (!session?.isDraft) {
        return CHAT_SESSION_SOURCE.TODAY;
    }

    return preferredSource === CHAT_SESSION_SOURCE.TODAY
        ? CHAT_SESSION_SOURCE.TODAY
        : CHAT_SESSION_SOURCE.DRAFTS;
};

const normalizeConversationTitle = (value = "") => {
    return typeof value === "string" ? value.trim() : "";
};

const serializeConversationMessages = (messages = []) => {
    try {
        return JSON.stringify(Array.isArray(messages) ? messages : []);
    } catch (error) {
        return "[]";
    }
};

const isSameConversationPayload = (left = {}, right = {}) => {
    return normalizeConversationTitle(left.title) === normalizeConversationTitle(right.title)
        && serializeConversationMessages(left.messages) === serializeConversationMessages(right.messages);
};

const getSessionTitle = (messages = [], fallback = "Chat session") => {
    const firstUserMessage = messages.find((message) => {
        return message?.role === "user" && typeof message.content === "string" && message.content.trim();
    });

    if (!firstUserMessage) {
        return fallback;
    }

    const normalized = firstUserMessage.content.replace(/\s+/g, " ").trim();
    return normalized.length > 30 ? `${normalized.substring(0, 30)}...` : normalized;
};

const getSessionSortValue = (session) => {
    const value = session?.updatedAt || session?.timestamp || session?.createdAt;
    const parsed = new Date(value || 0);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const sortSessionsForSidebar = (items, starredChats) => {
    return [...items].sort((a, b) => {
        const aStarred = starredChats.includes(a.id);
        const bStarred = starredChats.includes(b.id);

        if (aStarred && !bStarred) return -1;
        if (!aStarred && bStarred) return 1;

        return getSessionSortValue(b) - getSessionSortValue(a);
    });
};

const getDisappearingExpiryStorageKey = (chatId) => `${DISAPPEARING_EXPIRY_STORAGE_PREFIX}${chatId}`;

const parseDisappearingExpiry = (value) => {
    const expiry = Number(value);
    return Number.isFinite(expiry) && expiry > 0 ? expiry : null;
};

const readStoredDisappearingExpiries = () => {
    const expiries = {};

    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);

            if (!key?.startsWith(DISAPPEARING_EXPIRY_STORAGE_PREFIX)) {
                continue;
            }

            const chatId = key.slice(DISAPPEARING_EXPIRY_STORAGE_PREFIX.length);
            const expiry = parseDisappearingExpiry(localStorage.getItem(key));

            if (chatId && expiry) {
                expiries[chatId] = expiry;
            }
        }
    } catch (error) {
        console.error("Failed to read disappearing chat expiries:", error);
    }

    return expiries;
};

const writeStoredDisappearingExpiry = (chatId, expiry) => {
    if (!chatId || !expiry) {
        return;
    }

    try {
        localStorage.setItem(getDisappearingExpiryStorageKey(chatId), String(expiry));
    } catch (error) {
        console.error("Failed to save disappearing chat expiry:", error);
    }
};

const readStoredDisappearingExpiry = (chatId) => {
    if (!chatId) {
        return null;
    }

    try {
        return parseDisappearingExpiry(localStorage.getItem(getDisappearingExpiryStorageKey(chatId)));
    } catch (error) {
        console.error("Failed to read disappearing chat expiry:", error);
        return null;
    }
};

const removeStoredDisappearingExpiry = (chatId) => {
    if (!chatId) {
        return;
    }

    try {
        localStorage.removeItem(getDisappearingExpiryStorageKey(chatId));
    } catch (error) {
        console.error("Failed to remove disappearing chat expiry:", error);
    }
};

const clearStoredDisappearingExpiries = () => {
    try {
        const keys = [];

        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);

            if (key?.startsWith(DISAPPEARING_EXPIRY_STORAGE_PREFIX)) {
                keys.push(key);
            }
        }

        keys.forEach((key) => localStorage.removeItem(key));
    } catch (error) {
        console.error("Failed to clear disappearing chat expiries:", error);
    }
};

const removeExpiredDisappearingExpiries = (expiries, now = Date.now()) => {
    const activeExpiries = {};
    const expiredIds = [];

    Object.entries(expiries || {}).forEach(([chatId, expiry]) => {
        const parsedExpiry = parseDisappearingExpiry(expiry);

        if (!parsedExpiry || parsedExpiry <= now) {
            expiredIds.push(chatId);
            return;
        }

        activeExpiries[chatId] = parsedExpiry;
    });

    return { activeExpiries, expiredIds };
};

const formatDisappearingCountdown = (expiry, now = Date.now()) => {
    const parsedExpiry = parseDisappearingExpiry(expiry);

    if (!parsedExpiry) {
        return "";
    }

    const remainingMs = parsedExpiry - now;

    if (remainingMs <= 0) {
        return "now";
    }

    const totalMinutes = Math.ceil(remainingMs / ONE_MINUTE_MS);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours}h ${minutes}min`;
};

const formatDraftExpiryTime = (value) => {
    if (!value) {
        return "";
    }

    const expiryDate = new Date(value);

    if (Number.isNaN(expiryDate.getTime())) {
        return "";
    }

    const now = new Date();
    const sameDay = expiryDate.toDateString() === now.toDateString();
    const timeLabel = expiryDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    return sameDay
        ? timeLabel
        : `${expiryDate.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeLabel}`;
};

const buildBackendHistoryFromMessages = (conversationMessages = []) => {
    const history = [];
    let pendingQuestion = null;

    conversationMessages.forEach((message) => {
        const content = typeof message?.content === "string" ? message.content.trim() : "";

        if (!content) {
            return;
        }

        if (message.role === "user") {
            pendingQuestion = content;
            return;
        }

        if (message.role === "assistant" && pendingQuestion) {
            history.push({
                question: pendingQuestion,
                answer: content,
                sources: [],
                expanded_queries: [],
                validation: {},
            });
            pendingQuestion = null;
        }
    });

    return history;
};

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read audio."));
    reader.onloadend = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        resolve(result.split(",")[1] || "");
    };
    reader.readAsDataURL(blob);
});



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

const ConversationNavigator = ({ messages = [] }) => {
    const [activeIndex, setActiveIndex] = React.useState(0);
    const [isHovered, setIsHovered] = React.useState(false);
    const [isMobilePanelOpen, setIsMobilePanelOpen] = React.useState(false);
    const [tooltipData, setTooltipData] = React.useState({ text: null, x: 0, y: 0 });

    const userMessages = React.useMemo(() => (
        messages
            .map((message, index) => ({
                ...message,
                originalIdx: index,
                domId: getMessageDomId(message, index),
            }))
            .filter((message) => message.role === "user" && typeof message.content === "string" && message.content.trim())
    ), [messages]);

    React.useEffect(() => {
        if (userMessages.length < 2) {
            return undefined;
        }

        const observer = new IntersectionObserver((entries) => {
            let maxRatio = 0;
            let activeId = null;

            entries.forEach((entry) => {
                if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
                    maxRatio = entry.intersectionRatio;
                    activeId = entry.target.getAttribute("data-message-index");
                }
            });

            if (activeId !== null) {
                setActiveIndex(Number(activeId));
            }
        }, {
            root: null,
            rootMargin: "-20% 0px -60% 0px",
            threshold: [0, 0.25, 0.5, 0.75, 1],
        });

        const elements = document.querySelectorAll("[data-message-index]");
        elements.forEach((element) => observer.observe(element));

        return () => observer.disconnect();
    }, [messages.length, userMessages.length]);

    if (userMessages.length < 2) {
        return null;
    }

    let activeUserMarkerIdx = 0;
    for (let index = userMessages.length - 1; index >= 0; index -= 1) {
        if (userMessages[index].originalIdx <= activeIndex) {
            activeUserMarkerIdx = index;
            break;
        }
    }

    const handleNavigate = (message) => {
        const element = document.getElementById(`chat-message-${message.domId}`);

        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.classList.add("bg-zinc-100", "dark:bg-white/5", "rounded-2xl");
            window.setTimeout(() => {
                element.classList.remove("bg-zinc-100", "dark:bg-white/5", "rounded-2xl");
            }, 1400);
        }

        setIsHovered(false);
        setIsMobilePanelOpen(false);
        setTooltipData({ text: null, x: 0, y: 0 });
    };

    const renderMessageButton = (message, index, className) => (
        <button
            key={message.domId}
            onClick={() => handleNavigate(message)}
            onMouseMove={(event) => setTooltipData({ text: message.content, x: event.clientX, y: event.clientY })}
            onMouseLeave={() => setTooltipData({ text: null, x: 0, y: 0 })}
            className={cn(
                className,
                activeUserMarkerIdx === index
                    ? "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-zinc-100"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
            )}
        >
            <span className="block w-full truncate">
                {message.content}
            </span>
        </button>
    );

    return (
        <>
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed right-4 top-1/2 z-50 hidden -translate-y-1/2 items-center lg:flex"
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => {
                        setIsHovered(false);
                        setTooltipData({ text: null, x: 0, y: 0 });
                    }}
                >
                    {tooltipData.text && (
                        <div
                            className="fixed z-[100] max-w-[280px] rounded-lg border border-black/10 bg-zinc-900 px-2.5 py-1.5 text-xs text-white shadow-xl backdrop-blur-sm dark:border-white/10 dark:bg-black"
                            style={{ left: tooltipData.x - 16, top: tooltipData.y + 16, transform: "translateX(-100%)" }}
                        >
                            {tooltipData.text}
                        </div>
                    )}

                    <AnimatePresence>
                        {isHovered && (
                            <motion.div
                                initial={{ opacity: 0, x: 10, filter: "blur(4px)" }}
                                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                                exit={{ opacity: 0, x: 10, filter: "blur(4px)" }}
                                transition={{ duration: 0.15 }}
                                className="absolute right-8 mr-4 w-[240px] overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm dark:border-white/5 dark:bg-zinc-900"
                            >
                                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-gradient-to-b from-white to-transparent dark:from-zinc-900" />
                                <div className="max-h-[350px] overflow-y-auto overflow-x-hidden p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    <div className="flex flex-col gap-0.5">
                                        {userMessages.map((message, index) => renderMessageButton(
                                            message,
                                            index,
                                            "h-8 rounded-lg px-3 text-left text-xs font-medium transition-all"
                                        ))}
                                    </div>
                                </div>
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-4 bg-gradient-to-t from-white to-transparent dark:from-zinc-900" />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex w-8 cursor-pointer flex-col items-center gap-1.5 px-2 py-4">
                        {userMessages.map((message, index) => (
                            <button
                                key={message.domId}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleNavigate(message);
                                }}
                                className={cn(
                                    "shrink-0 rounded-full transition-all duration-300",
                                    activeUserMarkerIdx === index
                                        ? "h-4 w-2 bg-zinc-600 dark:bg-zinc-400"
                                        : "h-2.5 w-1 bg-zinc-300 hover:h-3.5 hover:bg-zinc-400 dark:bg-white/20 dark:hover:bg-white/40"
                                )}
                                aria-label="Jump to question"
                            />
                        ))}
                    </div>
                </motion.div>
            </AnimatePresence>

            <div className="lg:hidden">
                {!isMobilePanelOpen && (
                    <button
                        onClick={() => setIsMobilePanelOpen(true)}
                        className="fixed right-0 top-1/2 z-40 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center transition-opacity"
                        aria-label="Open chat navigator"
                    >
                        <ChevronLeft className="h-5 w-5 text-zinc-500 drop-shadow-md dark:text-zinc-400" />
                    </button>
                )}

                <AnimatePresence>
                    {isMobilePanelOpen && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                onClick={() => setIsMobilePanelOpen(false)}
                                className="fixed inset-0 z-40 bg-black/20"
                            />
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0, x: "-50%", y: "-50%" }}
                                animate={{ scale: 1, opacity: 1, x: "-50%", y: "-50%" }}
                                exit={{ scale: 0.95, opacity: 0, x: "-50%", y: "-50%" }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                className="fixed left-1/2 top-1/2 z-50 flex max-h-[60vh] w-[260px] flex-col overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-2xl dark:border-white/5 dark:bg-zinc-900"
                            >
                                <div className="border-b border-zinc-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-white/5">
                                    Chat selector
                                </div>
                                <div className="flex-1 overflow-y-auto overscroll-contain p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    <div className="flex flex-col gap-1">
                                        {userMessages.map((message, index) => renderMessageButton(
                                            message,
                                            index,
                                            "flex min-h-[44px] items-center rounded-xl px-4 text-left text-sm font-medium transition-colors"
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
};

export function ChatPage() {

    const { t } = useLanguage();

    const navigate = useNavigate();

    const [searchParams] = useSearchParams();

    const urlMode = searchParams.get("mode");



    const roadmapId = searchParams.get("roadmapId");

    const topicId = searchParams.get("topicId");

    const { roadmaps, getProgressForRoadmap, updateTopicProgress } = useRoadmaps();



    const currentRoadmap = roadmapId ? roadmaps.find(r => r.id === roadmapId) : null;

    const currentTopic = currentRoadmap?.topics?.find(t => t.id === topicId);

    const progress = roadmapId ? getProgressForRoadmap(roadmapId) : null;

    const isTopicCompleted = progress?.completedTopicIds?.includes(topicId) || false;

    const [markingComplete, setMarkingComplete] = React.useState(false);



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
    const dashboardPath = isGuest ? "/home" : (isTeacher ? "/workspace?mode=teacher" : "/workspace");



    const [messages, setMessages] = React.useState([INITIAL_MESSAGE]);

    const [sessions, setSessions] = React.useState([]);

    const [currentSessionId, setCurrentSessionId] = React.useState(null);
    const [currentSessionSource, setCurrentSessionSource] = React.useState(null);
    const [draftMenuSessionId, setDraftMenuSessionId] = React.useState(null);

    const [searchQuery, setSearchQuery] = React.useState("");
    const [activeMenuId, setActiveMenuId] = React.useState(null);
    const [renamingSessionId, setRenamingSessionId] = React.useState(null);
    const [renameValue, setRenameValue] = React.useState("");
    const [isIncognito, setIsIncognito] = React.useState(() => {
        try { return sessionStorage.getItem('isIncognito') === 'true'; } catch { return false; }
    });

    const [isRestoringSession, setIsRestoringSession] = React.useState(!!searchParams.get("sessionId"));

    const normalStateCache = React.useRef((() => {
        try {
            const cached = sessionStorage.getItem('normalStateCache');
            if (cached) return JSON.parse(cached);
        } catch { }
        return {
            messages: null,
            sessionId: null,
            urlSessionId: null,
            scrollPos: 0,
            followUpQuestions: null
        };
    })());
    const scrollContainerRef = React.useRef(null);

    const handleScroll = (e) => {
        if (!isIncognito) {
            normalStateCache.current.scrollPos = e.target.scrollTop;
        }
    };

    const setScrollRef = React.useCallback((node) => {
        scrollContainerRef.current = node;
        if (node && !isIncognito && normalStateCache.current.scrollPos > 0) {
            // Restore instantly upon mount
            node.scrollTop = normalStateCache.current.scrollPos;
        }
    }, [isIncognito]);

    const handleIncognitoToggle = async () => {
        const nextIncognito = !isIncognito;

        try {
            await chatbotApi.clearHistory();
        } catch (err) {
            console.error("Failed to clear AI memory on incognito toggle:", err);
        }

        if (nextIncognito) {
            // Entering Incognito: Cache normal state
            normalStateCache.current = {
                messages,
                sessionId: currentSessionId,
                urlSessionId: searchParams.get("sessionId"),
                scrollPos: scrollContainerRef.current ? scrollContainerRef.current.scrollTop : 0,
                followUpQuestions
            };
            try { sessionStorage.setItem('normalStateCache', JSON.stringify(normalStateCache.current)); } catch { }

            // Start fresh incognito session
            setMessages([INITIAL_MESSAGE]);
            setCurrentSessionId(null);
            setFollowUpQuestions([]);
            if (searchParams.get("sessionId")) {
                const newParams = new URLSearchParams(searchParams);
                newParams.delete("sessionId");
                navigate({ search: newParams.toString() }, { replace: true });
            }
        } else {
            // Exiting Incognito: Restore normal state
            const cache = normalStateCache.current;
            if (cache.messages) {
                setMessages(cache.messages);
                setCurrentSessionId(cache.sessionId);
                setFollowUpQuestions(cache.followUpQuestions || []);

                if (cache.urlSessionId) {
                    const newParams = new URLSearchParams(searchParams);
                    newParams.set("sessionId", cache.urlSessionId);
                    navigate({ search: newParams.toString() }, { replace: true });
                }
            }
            try { sessionStorage.removeItem('normalStateCache'); } catch { }
        }
        setIsIncognito(nextIncognito);
        try { sessionStorage.setItem('isIncognito', nextIncognito); } catch { }
        if (nextIncognito) {
            setIsSidebarOpen(false);
            setIsModelDropdownOpen(false);
        }
    };

    const [teacherView, setTeacherView] = React.useState(

        urlMode === "classroom-plan" ? "classroom_plan" :

            urlMode === "deep-dive" ? "deep_dive" :

                "overview"

    );

    const [isModeOpen, setIsModeOpen] = React.useState(false);



    const [showLimitModal, setShowLimitModal] = React.useState(false);

    const [isLLMActive, setIsLLMActive] = React.useState(false);
    const [s2sResult, setS2sResult] = React.useState(null);
    const [inlineSendError, setInlineSendError] = React.useState(null);



    const [isLoading, setIsLoading] = React.useState(false);

    const [error, setError] = React.useState(null);

    const [isConnected, setIsConnected] = React.useState(false);
    const [connectionStatus, setConnectionStatus] = React.useState({
        status: "checking",
        message: "Checking backend connection",
        node: false,
        ai: false,
    });

    const [isCheckingConnection, setIsCheckingConnection] = React.useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(window.innerWidth >= 1024);
    const sidebarBreakpointRef = React.useRef(window.innerWidth >= 1024);
    const [selectedModel, setSelectedModel] = React.useState(() => {
        const saved = localStorage.getItem("selectedModelId");
        return MODELS.find(m => m.id === saved) || MODELS[0];
    });
    const [isModelDropdownOpen, setIsModelDropdownOpen] = React.useState(false);
    const [selectedLanguage, setSelectedLanguage] = React.useState(null); // null = English (default)
    const [isTranslating, setIsTranslating] = React.useState(false);
    const [isLangDropdownOpen, setIsLangDropdownOpen] = React.useState(false);
    const [isMobileFooterExpanded, setIsMobileFooterExpanded] = React.useState(false);
    const [isTyping, setIsTyping] = React.useState(false);
    const [composerValue, setComposerValue] = React.useState("");
    const [editingMessageId, setEditingMessageId] = React.useState(null);
    const lastSendAtRef = React.useRef(0);

    const TRANSLATE_LANGUAGES = [
        { code: null, label: "English", flag: "🇬🇧" },
        { code: "hi-IN", label: "Hindi", flag: "🇮🇳" },
        { code: "bn-IN", label: "Bengali", flag: "🇧🇩" },
        { code: "gu-IN", label: "Gujarati", flag: "🇮🇳" },
        { code: "kn-IN", label: "Kannada", flag: "🇮🇳" },
        { code: "ml-IN", label: "Malayalam", flag: "🇮🇳" },
        { code: "mr-IN", label: "Marathi", flag: "🇮🇳" },
        { code: "od-IN", label: "Odia", flag: "🇮🇳" },
        { code: "pa-IN", label: "Punjabi", flag: "🇮🇳" },
        { code: "ta-IN", label: "Tamil", flag: "🇮🇳" },
        { code: "te-IN", label: "Telugu", flag: "🇮🇳" },
    ];

    const chatInputPlaceholder = isCheckingConnection
        ? "Checking connection..."
        : isConnected
            ? (connectionStatus.ai === false
                ? "AI service unavailable"
                : selectedLanguage
                    ? `Ask in ${TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label || 'selected language'}...`
                    : t('chat.inputPlaceholder') || "How can I help?")
            : "Backend not connected";

    React.useEffect(() => {
        localStorage.setItem("selectedModelId", selectedModel.id);
    }, [selectedModel]);

    React.useEffect(() => {
        const handleResize = () => {
            const isDesktop = window.innerWidth >= 1024;

            if (sidebarBreakpointRef.current === isDesktop) {
                return;
            }

            sidebarBreakpointRef.current = isDesktop;
            setIsSidebarOpen(isDesktop);
        };

        if (window.innerWidth < 1024) {
            setIsSidebarOpen(false);
        }

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    React.useEffect(() => {
        let typingTimeout;

        const handleFocusIn = (event) => {
            if (event.target?.tagName === "INPUT" || event.target?.tagName === "TEXTAREA") {
                setIsTyping(true);
                setIsMobileFooterExpanded(false);
                window.clearTimeout(typingTimeout);
            }
        };

        const handleFocusOut = (event) => {
            if (event.target?.tagName === "INPUT" || event.target?.tagName === "TEXTAREA") {
                typingTimeout = window.setTimeout(() => {
                    setIsTyping(false);
                }, 1200);
            }
        };

        document.addEventListener("focusin", handleFocusIn);
        document.addEventListener("focusout", handleFocusOut);

        return () => {
            document.removeEventListener("focusin", handleFocusIn);
            document.removeEventListener("focusout", handleFocusOut);
            window.clearTimeout(typingTimeout);
        };
    }, []);

    const messagesEndRef = React.useRef(null);
    const chatInputRef = React.useRef(null);
    const isLoadingRef = React.useRef(false);
    const currentAbortController = React.useRef(null);
    const currentVoiceAudioRef = React.useRef(null);
    const currentVoiceAudioUrlRef = React.useRef(null);
    const voiceInputRef = React.useRef(null);
    const activeAssistantMessageIdRef = React.useRef(null);
    const suppressAbortStoppedRef = React.useRef(false);
    const pendingAbandonedDraftIdRef = React.useRef(null);
    const skipLocalBackupRestoreRef = React.useRef(false);
    const expiredDisappearingSessionIdsRef = React.useRef(new Set());
    const [followUpQuestions, setFollowUpQuestions] = React.useState([]);

    // ── Star & Disappearing Messages (Sagar's features) ──────────────
    const [starredChats, setStarredChats] = React.useState(() => {
        try { return JSON.parse(localStorage.getItem('starredChats') || '[]'); } catch { return []; }
    });
    const [isDisappearingMode, setIsDisappearingMode] = React.useState(() => {
        try { return localStorage.getItem(DISAPPEARING_MODE_STORAGE_KEY) === 'true'; } catch { return false; }
    });
    const [disappearingExpiries, setDisappearingExpiries] = React.useState(() => readStoredDisappearingExpiries());
    const [countdownNow, setCountdownNow] = React.useState(() => Date.now());

    React.useEffect(() => {
        localStorage.setItem('starredChats', JSON.stringify(starredChats));
    }, [starredChats]);

    React.useEffect(() => {
        localStorage.setItem(DISAPPEARING_MODE_STORAGE_KEY, String(isDisappearingMode));
    }, [isDisappearingMode]);

    React.useEffect(() => {
        isLoadingRef.current = isLoading;
    }, [isLoading]);

    const toggleStar = (id, e) => {
        e.stopPropagation();
        setStarredChats(prev => prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]);
    };
    // ─────────────────────────────────────────────────────────────────


    const [selectionData, setSelectionData] = React.useState({

        text: "",

        x: 0,

        y: 0,

        visible: false

    });

    const [quotedText, setQuotedText] = React.useState(null);
    const editingMessage = editingMessageId
        ? messages.find((message, index) => getMessageDomId(message, index) === editingMessageId) || null
        : null;



    const [greeting, setGreeting] = React.useState(() => {

        return GREETING_SENTENCES[Math.floor(Math.random() * GREETING_SENTENCES.length)];

    });

    const activeDraftStorageKey = user?.id ? `${ACTIVE_DRAFT_STORAGE_PREFIX}${user.id}` : null;
    const pendingDraftStorageKey = user?.id ? `${PENDING_DRAFT_STORAGE_PREFIX}${user.id}` : null;
    const localChatBackupKey = `digilab-chat-backup:${user?.id || "guest"}`;
    const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:5001/api";

    const resetComposerState = () => {
        setComposerValue("");
        setEditingMessageId(null);
    };

    const refreshConnectionStatus = React.useCallback(async () => {
        const health = await chatbotApi.checkHealth();
        setConnectionStatus(health);
        setIsConnected(Boolean(health.node));
        setIsCheckingConnection(false);
        return health;
    }, []);

    const getReadyConnectionStatus = React.useCallback(async () => {
        let latestConnectionStatus = connectionStatus;

        if (!latestConnectionStatus.node || latestConnectionStatus.ai === false) {
            try {
                latestConnectionStatus = await refreshConnectionStatus();
            } catch (healthErr) {
                latestConnectionStatus = healthErr.healthStatus || latestConnectionStatus;
            }
        }

        return latestConnectionStatus;
    }, [connectionStatus, refreshConnectionStatus]);

    const startLLMRequest = React.useCallback(() => {
        if (currentAbortController.current) {
            currentAbortController.current.abort();
        }

        const controller = new AbortController();
        currentAbortController.current = controller;
        setIsLLMActive(true);
        setInlineSendError(null);
        return controller;
    }, []);

    const finishLLMRequest = React.useCallback(() => {
        currentAbortController.current = null;
        activeAssistantMessageIdRef.current = null;
        setIsLLMActive(false);
    }, []);

    const stopVoicePlayback = React.useCallback(() => {
        if (currentVoiceAudioRef.current) {
            currentVoiceAudioRef.current.pause();
            currentVoiceAudioRef.current.onended = null;
            currentVoiceAudioRef.current.onerror = null;
            currentVoiceAudioRef.current = null;
        }

        if (currentVoiceAudioUrlRef.current) {
            URL.revokeObjectURL(currentVoiceAudioUrlRef.current);
            currentVoiceAudioUrlRef.current = null;
        }
    }, []);

    const markLastAssistantStopped = React.useCallback(() => {
        setMessages((currentMessages) => {
            const nextMessages = [...currentMessages];
            const activeAssistantId = activeAssistantMessageIdRef.current;

            if (activeAssistantId) {
                const activeIndex = nextMessages.findIndex((message) => message.id === activeAssistantId);
                if (activeIndex !== -1) {
                    nextMessages[activeIndex] = {
                        ...nextMessages[activeIndex],
                        isStreaming: false,
                        stopped: true,
                    };
                    return nextMessages;
                }
            }

            for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
                if (nextMessages[index]?.role === "assistant") {
                    if (nextMessages[index].stopped) {
                        return nextMessages;
                    }

                    nextMessages[index] = {
                        ...nextMessages[index],
                        isStreaming: false,
                        stopped: true,
                    };
                    return nextMessages;
                }
            }

            return [
                ...nextMessages,
                withMessageId({
                    role: "assistant",
                    content: "",
                    isStreaming: false,
                    stopped: true,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                }),
            ];
        });
    }, []);

    const markLastAssistantPlaybackFailed = React.useCallback(() => {
        setMessages((currentMessages) => {
            const nextMessages = [...currentMessages];
            for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
                if (nextMessages[index]?.role === "assistant") {
                    nextMessages[index] = {
                        ...nextMessages[index],
                        playbackFailed: true,
                    };
                    return nextMessages;
                }
            }
            return nextMessages;
        });
    }, []);

    const handleStopLLM = React.useCallback(() => {
        if (!isLLMActive || !currentAbortController.current) {
            return;
        }

        currentAbortController.current.abort();
        voiceInputRef.current?.stopAudio?.();
        stopVoicePlayback();
        setS2sResult(null);
        markLastAssistantStopped();
        finishLLMRequest();
        setIsLoading(false);
        isLoadingRef.current = false;
    }, [finishLLMRequest, isLLMActive, markLastAssistantStopped, stopVoicePlayback]);

    const handleVoicePlaybackError = React.useCallback(() => {
        markLastAssistantPlaybackFailed();
        setS2sResult(null);
        finishLLMRequest();
    }, [finishLLMRequest, markLastAssistantPlaybackFailed]);

    const handleVoicePlaybackComplete = React.useCallback(() => {
        setS2sResult(null);
        finishLLMRequest();
    }, [finishLLMRequest]);

    const getConversationTitle = (nextMessages = messages, sessionId = currentSessionId) => {
        if (sessionId) {
            return sessions.find((session) => session.id === sessionId)?.title || getSessionTitle(nextMessages);
        }

        return getSessionTitle(nextMessages);
    };

    const getSessionRecord = (sessionId = currentSessionId) => {
        if (!sessionId) {
            return null;
        }

        return sessions.find((session) => session.id === sessionId) || null;
    };

    const hydrateDisappearingExpiriesFromStorage = () => {
        const hydrated = removeExpiredDisappearingExpiries(readStoredDisappearingExpiries());
        hydrated.expiredIds.forEach((id) => expiredDisappearingSessionIdsRef.current.add(id));
        setDisappearingExpiries(hydrated.activeExpiries);
        setCountdownNow(Date.now());
        return hydrated;
    };

    const ensureDisappearingExpiryForSession = (sessionId) => {
        if (!isDisappearingMode || !sessionId) {
            return null;
        }

        const now = Date.now();
        const storedExpiry = readStoredDisappearingExpiry(sessionId);
        const currentExpiry = parseDisappearingExpiry(disappearingExpiries[sessionId]);
        const expiry = storedExpiry && storedExpiry > now
            ? storedExpiry
            : currentExpiry && currentExpiry > now
                ? currentExpiry
                : now + DISAPPEARING_TTL_MS;

        writeStoredDisappearingExpiry(sessionId, expiry);
        setDisappearingExpiries((prev) => (
            prev[sessionId] === expiry ? prev : { ...prev, [sessionId]: expiry }
        ));
        setCountdownNow(now);
        return expiry;
    };

    const snapshotMatchesSession = (snapshot, session = getSessionRecord(snapshot?.sessionId)) => {
        if (!snapshot || !session) {
            return false;
        }

        return isSameConversationPayload(
            {
                title: snapshot.title || getSessionTitle(snapshot.messages),
                messages: snapshot.messages,
            },
            {
                title: session.title || getSessionTitle(session.messages),
                messages: session.messages,
            }
        );
    };

    const shouldKeepDraftState = (sessionId = currentSessionId) => {
        if (!sessionId) {
            return false;
        }

        return getSessionRecord(sessionId)?.isDraft === true;
    };

    const getStoredActiveDraft = () => {
        if (!activeDraftStorageKey) {
            return null;
        }

        return parseStoredActiveDraft(localStorage.getItem(activeDraftStorageKey));
    };

    const rememberActiveDraft = (sessionId, source = CHAT_SESSION_SOURCE.DRAFTS) => {
        if (!activeDraftStorageKey || !sessionId) {
            return;
        }

        localStorage.setItem(activeDraftStorageKey, JSON.stringify({
            sessionId,
            source: source === CHAT_SESSION_SOURCE.TODAY
                ? CHAT_SESSION_SOURCE.TODAY
                : CHAT_SESSION_SOURCE.DRAFTS,
        }));
    };

    const clearStoredDraft = (sessionId = null) => {
        if (!activeDraftStorageKey) {
            return;
        }

        const storedDraft = getStoredActiveDraft();
        if (!sessionId || storedDraft?.sessionId === sessionId) {
            localStorage.removeItem(activeDraftStorageKey);
        }
    };

    const readPendingDraftSnapshot = () => {
        if (!pendingDraftStorageKey) {
            return null;
        }

        return parsePendingDraftSnapshot(localStorage.getItem(pendingDraftStorageKey));
    };

    const writePendingDraftSnapshot = ({
        sessionId = currentSessionId,
        nextMessages = messages,
        title = getConversationTitle(nextMessages, sessionId),
        source = currentSessionSource,
    } = {}) => {
        if (!pendingDraftStorageKey || isGuest || isIncognito || !Array.isArray(nextMessages) || nextMessages.length <= 1) {
            return null;
        }

        const snapshot = {
            sessionId: sessionId || null,
            title,
            source: source === CHAT_SESSION_SOURCE.TODAY
                ? CHAT_SESSION_SOURCE.TODAY
                : CHAT_SESSION_SOURCE.DRAFTS,
            messages: nextMessages,
        };

        localStorage.setItem(pendingDraftStorageKey, JSON.stringify(snapshot));
        return snapshot;
    };

    const clearPendingDraftSnapshot = () => {
        if (!pendingDraftStorageKey) {
            return;
        }

        localStorage.removeItem(pendingDraftStorageKey);
    };

    const sendKeepaliveDraftSnapshot = (snapshot) => {
        if (!snapshot || !user?.token) {
            return;
        }

        if (snapshotMatchesSession(snapshot)) {
            return;
        }

        try {
            window.fetch(`${apiBaseUrl}/chat/sessions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${user.token}`,
                },
                body: JSON.stringify({
                    sessionId: snapshot.sessionId,
                    messages: snapshot.messages,
                    title: snapshot.title,
                    isDraft: true,
                }),
                keepalive: true,
            }).catch(() => { });
        } catch (error) {
            console.error("Failed to keepalive-save draft:", error);
        }
    };

    const upsertSessionInState = (nextSession) => {
        setSessions((prev) => {
            const filtered = prev.filter((session) => session.id !== nextSession.id);
            return [nextSession, ...filtered];
        });

        ensureDisappearingExpiryForSession(nextSession?.id);
    };

    const makeTodaySession = (session, nextMessages, title) => ({
        ...session,
        messages: nextMessages || session.messages || [],
        title: title || session.title || getSessionTitle(nextMessages || session.messages || []),
        isDraft: false,
        draftExpiresAt: null,
        updatedAt: new Date().toISOString()
    });

    const flushPendingDraftSnapshot = async (existingSessions = sessions) => {
        const snapshot = readPendingDraftSnapshot();

        if (!snapshot || isGuest || isIncognito) {
            return null;
        }

        const matchingSession = snapshot.sessionId
            ? existingSessions.find((session) => session.id === snapshot.sessionId)
            : null;

        if (snapshotMatchesSession(snapshot, matchingSession)) {
            clearPendingDraftSnapshot();

            if (matchingSession?.isDraft) {
                rememberActiveDraft(matchingSession.id, snapshot.source);
                return {
                    session: matchingSession,
                    source: snapshot.source,
                };
            }

            return null;
        }

        try {
            const res = await api.post('/chat/sessions', {
                sessionId: snapshot.sessionId,
                messages: snapshot.messages,
                title: snapshot.title,
                isDraft: true,
            });

            if (!res.data) {
                return null;
            }

            const savedSession = {
                ...res.data,
                messages: snapshot.messages,
                title: res.data.title || snapshot.title || getSessionTitle(snapshot.messages),
            };

            upsertSessionInState(savedSession);
            rememberActiveDraft(savedSession.id, snapshot.source);
            clearPendingDraftSnapshot();

            return {
                session: savedSession,
                source: snapshot.source,
            };
        } catch (err) {
            console.error("Failed to restore pending draft:", err);
            return null;
        }
    };

    const loadConversation = async (session, preferredSource = null) => {
        if (!session) {
            return;
        }

        if (isDisappearingMode) {
            const { activeExpiries, expiredIds } = hydrateDisappearingExpiriesFromStorage();
            const activeExpiry = parseDisappearingExpiry(activeExpiries[session.id]);

            if (expiredIds.includes(session.id) || (activeExpiry && activeExpiry <= Date.now())) {
                expireDisappearingSessions([session.id]);
                return;
            }
        }

        const nextMessages = Array.isArray(session.messages) && session.messages.length > 0
            ? session.messages
            : [INITIAL_MESSAGE];

        const sessionSource = resolveSessionSource(session, preferredSource);

        setCurrentSessionId(session.id);
        setCurrentSessionSource(sessionSource);
        setMessages(nextMessages);
        setError(null);
        setQuotedText(null);
        setFollowUpQuestions([]);
        setDraftMenuSessionId(null);
        resetComposerState();

        if (session.isDraft) {
            rememberActiveDraft(session.id, sessionSource);
        } else {
            clearStoredDraft(session.id);
        }

        try {
            const history = buildBackendHistoryFromMessages(nextMessages);

            if (history.length > 0) {
                await chatbotApi.syncHistory(history);
            } else {
                await chatbotApi.clearHistory();
            }
        } catch (err) {
            console.error("Failed to sync AI memory:", err);

            try {
                await chatbotApi.clearHistory();
            } catch (clearErr) {
                console.error("Failed to reset AI memory:", clearErr);
            }
        }

        if (window.innerWidth < 1024) {
            setIsSidebarOpen(false);
        }
    };

    const persistSession = async ({ sessionId = currentSessionId, nextMessages, title, isDraft = false }) => {
        if (isGuest || isIncognito) {
            return null;
        }

        const requestedTitle = title || getConversationTitle(nextMessages, sessionId);

        const res = await api.post('/chat/sessions', {
            sessionId,
            messages: nextMessages,
            title: requestedTitle,
            isDraft,
        });

        if (res.data) {
            let savedSession = isDraft
                ? res.data
                : makeTodaySession(res.data, nextMessages, requestedTitle);

            if (!isDraft && res.data.isDraft) {
                try {
                    const archiveRes = await api.post(`/chat/sessions/${savedSession.id}/archive`);
                    savedSession = makeTodaySession(archiveRes.data || savedSession, nextMessages, requestedTitle);
                } catch (err) {
                    console.error("Failed to move chat out of drafts:", err);
                }
            }

            const fallbackSessionId = !sessionId && savedSession.id
                ? `local-${user?.id || "guest"}`
                : null;
            const fallbackExpiry = fallbackSessionId
                ? parseDisappearingExpiry(disappearingExpiries[fallbackSessionId])
                || readStoredDisappearingExpiry(fallbackSessionId)
                : null;

            upsertSessionInState(savedSession);

            if (fallbackSessionId && fallbackSessionId !== savedSession.id) {
                if (fallbackExpiry && fallbackExpiry > Date.now()) {
                    writeStoredDisappearingExpiry(savedSession.id, fallbackExpiry);
                    removeStoredDisappearingExpiry(fallbackSessionId);
                    setDisappearingExpiries((prev) => {
                        const next = { ...prev, [savedSession.id]: fallbackExpiry };
                        delete next[fallbackSessionId];
                        return next;
                    });
                } else {
                    removeDisappearingExpiryState([fallbackSessionId]);
                }

                setSessions((prev) => prev.filter((session) => session.id !== fallbackSessionId));
            }

            if (!sessionId && savedSession.id) {
                setCurrentSessionId(savedSession.id);
            }

            const nextSource = savedSession.isDraft
                ? (currentSessionSource === CHAT_SESSION_SOURCE.TODAY
                    ? CHAT_SESSION_SOURCE.TODAY
                    : CHAT_SESSION_SOURCE.DRAFTS)
                : CHAT_SESSION_SOURCE.TODAY;

            if (savedSession.isDraft) {
                rememberActiveDraft(savedSession.id, nextSource);
            } else {
                clearStoredDraft(savedSession.id);
            }

            if (!sessionId || sessionId === currentSessionId) {
                setCurrentSessionSource(nextSource);
            }

            clearPendingDraftSnapshot();

            return savedSession;
        }

        return null;
    };

    const saveCurrentConversationAsDraft = async () => {
        if (isGuest || isIncognito || messages.length <= 1) {
            return null;
        }

        try {
            const draftSession = await persistSession({
                sessionId: currentSessionId,
                nextMessages: messages,
                title: getConversationTitle(messages, currentSessionId),
                isDraft: true
            });

            return draftSession || null;
        } catch (err) {
            console.error("Failed to save dashboard draft:", err);
            return null;
        }
    };

    const resetChatSurface = () => {
        skipLocalBackupRestoreRef.current = true;
        localStorage.removeItem(localChatBackupKey);
        setMessages([INITIAL_MESSAGE]);
        setCurrentSessionId(null);
        setCurrentSessionSource(null);
        setError(null);
        setQuotedText(null);
        setFollowUpQuestions([]);
        setDraftMenuSessionId(null);
        clearPendingDraftSnapshot();
        resetComposerState();
    };

    const getCurrentConversationSession = () => {
        if (messages.length <= 1) {
            return null;
        }

        const fallbackSessionId = currentSessionId || `local-${user?.id || "guest"}`;
        const existingSession = sessions.find((session) => session.id === fallbackSessionId);
        const now = new Date().toISOString();

        return {
            ...existingSession,
            id: fallbackSessionId,
            title: existingSession?.title || getConversationTitle(messages, fallbackSessionId),
            messages,
            isDraft: existingSession?.isDraft === true,
            draftExpiresAt: existingSession?.draftExpiresAt || null,
            updatedAt: existingSession?.updatedAt || now,
            source: existingSession?.source || CHAT_SESSION_SOURCE.TODAY,
        };
    };

    const getSessionsIncludingCurrentConversation = () => {
        const currentConversationSession = getCurrentConversationSession();

        if (!currentConversationSession) {
            return sessions;
        }

        const hasCurrentSession = sessions.some((session) => session.id === currentConversationSession.id);

        if (hasCurrentSession) {
            return sessions.map((session) => (
                session.id === currentConversationSession.id ? currentConversationSession : session
            ));
        }

        return [currentConversationSession, ...sessions];
    };

    const removeDisappearingExpiryState = (sessionIds, { removeStorage = true } = {}) => {
        const ids = Array.isArray(sessionIds) ? sessionIds.filter(Boolean) : [];

        if (!ids.length) {
            return;
        }

        if (removeStorage) {
            ids.forEach(removeStoredDisappearingExpiry);
        }

        setDisappearingExpiries((prev) => {
            let changed = false;
            const next = { ...prev };

            ids.forEach((id) => {
                if (id in next) {
                    delete next[id];
                    changed = true;
                }
            });

            return changed ? next : prev;
        });
    };

    const deleteDisappearingSessionFromServer = async (session) => {
        if (isGuest || !session?.id || session.id.startsWith("local-")) {
            return false;
        }

        try {
            if (session.isDraft) {
                await api.delete(`/chat/sessions/${session.id}/draft`);
            } else {
                await api.delete(`/chat/sessions/${session.id}`);
            }

            removeStoredDisappearingExpiry(session.id);
            expiredDisappearingSessionIdsRef.current.delete(session.id);
            return true;
        } catch (err) {
            console.error("Failed to delete expired disappearing chat:", err);
            return false;
        }
    };

    const expireDisappearingSessions = (sessionIds) => {
        const ids = Array.isArray(sessionIds) ? sessionIds.filter(Boolean) : [];

        if (!ids.length) {
            return;
        }

        ids.forEach((id) => expiredDisappearingSessionIdsRef.current.add(id));
        const expiringSessions = sessions.filter((session) => ids.includes(session.id));
        const localExpiredIds = ids.filter((id) => id.startsWith("local-"));

        removeDisappearingExpiryState(ids, { removeStorage: false });
        localExpiredIds.forEach((id) => {
            removeStoredDisappearingExpiry(id);
            expiredDisappearingSessionIdsRef.current.delete(id);
        });
        setSessions((prev) => prev.filter((session) => !ids.includes(session.id)));
        setStarredChats((prev) => prev.filter((id) => !ids.includes(id)));
        ids.forEach(clearStoredDraft);
        clearPendingDraftSnapshot();
        setCountdownNow(Date.now());

        const activeSessionId = currentSessionId || (messages.length > 1 ? `local-${user?.id || "guest"}` : null);

        try {
            const rawBackup = localStorage.getItem(localChatBackupKey);
            const backup = rawBackup ? JSON.parse(rawBackup) : null;
            const backupSessionId = backup?.currentSessionId || `local-${user?.id || "guest"}`;

            if (backupSessionId && ids.includes(backupSessionId)) {
                localStorage.removeItem(localChatBackupKey);
            }
        } catch {
            localStorage.removeItem(localChatBackupKey);
        }

        if (activeSessionId && ids.includes(activeSessionId)) {
            resetChatSurface();
        }

        expiringSessions.forEach((session) => {
            deleteDisappearingSessionFromServer(session);
        });
    };

    const handleToggleDisappearingMode = () => {
        const nextMode = !isDisappearingMode;
        const now = Date.now();

        setCountdownNow(now);
        setIsDisappearingMode(nextMode);

        if (!nextMode) {
            clearStoredDisappearingExpiries();
            expiredDisappearingSessionIdsRef.current.clear();
            setDisappearingExpiries({});
            return;
        }

        const expiry = now + DISAPPEARING_TTL_MS;
        const nextSessions = getSessionsIncludingCurrentConversation();
        const nextExpiries = {};

        clearStoredDisappearingExpiries();
        expiredDisappearingSessionIdsRef.current.clear();

        nextSessions.forEach((session) => {
            if (!session?.id) {
                return;
            }

            nextExpiries[session.id] = expiry;
            writeStoredDisappearingExpiry(session.id, expiry);
        });

        setSessions(nextSessions);
        setDisappearingExpiries(nextExpiries);
    };

    const getDisappearingCountdownLabel = (sessionId) => {
        if (!isDisappearingMode || !sessionId) {
            return "";
        }

        return formatDisappearingCountdown(disappearingExpiries[sessionId], countdownNow);
    };

    const renderDisappearingCountdown = (sessionId) => {
        const label = getDisappearingCountdownLabel(sessionId);

        if (!label) {
            return null;
        }

        return (
            <span className="mt-1 block text-[11px] font-semibold text-orange-500 dark:text-orange-400">
                {label === "now" ? "Disappearing now" : `Disappears in ${label}`}
            </span>
        );
    };

    const navigateAfterSavingDraft = async (path) => {
        await saveCurrentConversationAsDraft();
        setIsSidebarOpen(false);
        navigate(path);
    };

    React.useEffect(() => {
        if (!draftMenuSessionId) {
            return undefined;
        }

        const handleOutsideClick = () => {
            setDraftMenuSessionId(null);
        };

        document.addEventListener("click", handleOutsideClick);

        return () => {
            document.removeEventListener("click", handleOutsideClick);
        };
    }, [draftMenuSessionId]);



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




    React.useEffect(() => {

        const initChat = async () => {

            try {

                const health = await refreshConnectionStatus();

                if (health.ai) {
                    await chatbotApi.clearHistory();
                }

            } catch (err) {

                console.error("Backend not available:", err);

                setIsConnected(false);
                setConnectionStatus(err.healthStatus || {
                    status: "offline",
                    message: "Backend not connected",
                    node: false,
                    ai: false,
                });

            } finally {

                setIsCheckingConnection(false);

            }



            if (!isGuest) {

                try {

                    const res = await api.get('/chat/sessions');
                    const fetchedSessions = Array.isArray(res.data) ? res.data : [];
                    const { activeExpiries, expiredIds } = isDisappearingMode
                        ? removeExpiredDisappearingExpiries(readStoredDisappearingExpiries())
                        : { activeExpiries: {}, expiredIds: [] };
                    const expiredSessionIds = [
                        ...new Set([
                            ...expiredIds,
                            ...Array.from(expiredDisappearingSessionIdsRef.current),
                        ]),
                    ];
                    const activeFetchedSessions = fetchedSessions.filter((session) => !expiredSessionIds.includes(session.id));

                    if (isDisappearingMode) {
                        setDisappearingExpiries(activeExpiries);
                    }

                    setSessions(activeFetchedSessions);

                    expiredSessionIds.forEach((sessionId) => {
                        const expiredSession = fetchedSessions.find((session) => session.id === sessionId);

                        if (expiredSession) {
                            deleteDisappearingSessionFromServer(expiredSession);
                        } else {
                            removeStoredDisappearingExpiry(sessionId);
                            expiredDisappearingSessionIdsRef.current.delete(sessionId);
                        }
                    });

                    const restoredDraft = await flushPendingDraftSnapshot(activeFetchedSessions);
                    const hydratedSessions = restoredDraft?.session
                        ? [restoredDraft.session, ...activeFetchedSessions.filter((session) => session.id !== restoredDraft.session.id)]
                        : activeFetchedSessions;

                    setSessions(hydratedSessions);

                    const storedDraft = getStoredActiveDraft();
                    const sessionId = searchParams.get("sessionId") || storedDraft?.sessionId || restoredDraft?.session?.id;
                    const sessionSource = searchParams.get("source")
                        || (storedDraft?.sessionId === sessionId ? storedDraft.source : null)
                        || restoredDraft?.source;
                    const initialSession = hydratedSessions.find((session) => session.id === sessionId);

                    if (initialSession) {
                        await loadConversation(initialSession, sessionSource);
                    } else if (sessionId) {
                        clearStoredDraft(sessionId);
                    }

                } catch (err) {

                    console.error("Failed to fetch sessions from DB:", err);

                }

            }

        };

        initChat();

    }, [isGuest, searchParams, activeDraftStorageKey]);

    React.useEffect(() => {
        let backupTimer;

        try {
            backupTimer = window.setTimeout(() => {
                if (skipLocalBackupRestoreRef.current) {
                    return;
                }

                if (messages.length > 1) {
                    return;
                }

                const rawBackup = localStorage.getItem(localChatBackupKey);
                if (!rawBackup) {
                    return;
                }

                const backup = JSON.parse(rawBackup);
                const savedMessages = Array.isArray(backup.messages) ? backup.messages : [];
                if (savedMessages.length <= 1) {
                    return;
                }

                const restoredMessages = savedMessages
                    .filter((message) => !(message.role === "assistant" && message.isStreaming && !message.content))
                    .map((message) => withMessageId({
                        ...message,
                        isStreaming: false,
                        autoReadAloud: false,
                    }));

                if (restoredMessages.length <= 1) {
                    return;
                }

                const fallbackSessionId = backup.currentSessionId || `local-${Date.now()}`;
                const fallbackSession = {
                    id: fallbackSessionId,
                    title: backup.title || getSessionTitle(restoredMessages),
                    messages: restoredMessages,
                    isDraft: false,
                    updatedAt: backup.updatedAt || new Date().toISOString(),
                    source: CHAT_SESSION_SOURCE.TODAY,
                };

                setMessages(restoredMessages);
                setCurrentSessionId(fallbackSessionId);
                setCurrentSessionSource(backup.currentSessionSource || CHAT_SESSION_SOURCE.TODAY);
                setSessions((prev) => {
                    if (prev.some((session) => session.id === fallbackSessionId)) {
                        return prev;
                    }

                    return [fallbackSession, ...prev];
                });
            }, 700);
        } catch (error) {
            console.error("Failed to restore local chat backup:", error);
        }

        return () => {
            if (backupTimer) {
                window.clearTimeout(backupTimer);
            }
        };
    }, [localChatBackupKey, messages.length]);

    React.useEffect(() => {
        if (messages.length <= 1) {
            return;
        }

        try {
            skipLocalBackupRestoreRef.current = false;
            localStorage.setItem(localChatBackupKey, JSON.stringify({
                messages,
                currentSessionId,
                currentSessionSource,
                title: getConversationTitle(messages, currentSessionId),
                updatedAt: new Date().toISOString(),
            }));
        } catch (error) {
            console.error("Failed to save local chat backup:", error);
        }
    }, [messages, currentSessionId, currentSessionSource, localChatBackupKey]);

    React.useEffect(() => {
        if (messages.length <= 1) {
            return;
        }

        const sessionId = currentSessionId || `local-${user?.id || "guest"}`;
        ensureDisappearingExpiryForSession(sessionId);
        setSessions((prev) => {
            if (prev.some((session) => session.id === sessionId)) {
                return prev;
            }

            return [{
                id: sessionId,
                title: getSessionTitle(messages),
                messages,
                isDraft: false,
                updatedAt: new Date().toISOString(),
                source: CHAT_SESSION_SOURCE.TODAY,
            }, ...prev];
        });
    }, [messages, currentSessionId, user?.id]);



    React.useEffect(() => {

        const prompt = searchParams.get("prompt");

        if (prompt && isConnected && messages.length === 1 && !isLoading) {

            handleSend(prompt);

            const newParams = new URLSearchParams(searchParams);

            newParams.delete("prompt");

            navigate({ search: newParams.toString() }, { replace: true });

        }

    }, [isConnected, searchParams, messages.length, isLoading]);



    React.useEffect(() => {
        const activeAssistantId = activeAssistantMessageIdRef.current;

        if (activeAssistantId) {
            const activeAssistantNode = document.getElementById(`chat-message-${activeAssistantId}`);

            if (activeAssistantNode) {
                activeAssistantNode.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }
        }

        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

    }, [messages.length]);

    React.useEffect(() => {
        return () => {
            stopVoicePlayback();
        };
    }, [stopVoicePlayback]);



    const handleDeleteSession = async (sessionId, e) => {
        if (e) e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this chat?")) return;
        try {
            if (!isGuest) {
                await api.delete(`/chat/sessions/${sessionId}`);
            }
            setSessions(prev => prev.filter(s => s.id !== sessionId));
            setStarredChats(prev => prev.filter(id => id !== sessionId));
            removeDisappearingExpiryState([sessionId]);
            clearStoredDraft(sessionId);
            clearPendingDraftSnapshot();
            if (currentSessionId === sessionId) {
                setMessages([INITIAL_MESSAGE]);
                setCurrentSessionId(null);
                setCurrentSessionSource(null);
                resetComposerState();
            }
            setError(null);
        } catch (err) {
            console.error("Failed to delete session:", err);
            setError("Failed to delete chat session");
        }
    };

    const handleRenameSubmit = async (sessionId) => {
        const trimmedTitle = renameValue.trim();
        const session = sessions.find((item) => item.id === sessionId);

        setRenamingSessionId(null);
        setActiveMenuId(null);
        setRenameValue("");

        if (!session || !trimmedTitle || trimmedTitle === session.title) {
            return;
        }

        setSessions((prev) => prev.map((item) => (
            item.id === sessionId
                ? { ...item, title: trimmedTitle, updatedAt: new Date().toISOString() }
                : item
        )));

        if (isGuest || isIncognito || sessionId.startsWith("local-")) {
            return;
        }

        try {
            await api.post('/chat/sessions', {
                sessionId,
                messages: session.messages || [],
                title: trimmedTitle,
                isDraft: session.isDraft === true,
            });
        } catch (err) {
            console.error("Failed to rename session:", err);
            setSessions((prev) => prev.map((item) => (
                item.id === sessionId ? { ...item, title: session.title } : item
            )));
            setError("Failed to rename chat session");
        }
    };

    const handleRenameKeyDown = (e, sessionId) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleRenameSubmit(sessionId);
            return;
        }

        if (e.key === "Escape") {
            e.preventDefault();
            setRenamingSessionId(null);
            setActiveMenuId(null);
            setRenameValue("");
        }
    };

    const handleDeleteDraft = async (sessionId, e) => {
        if (e) e.stopPropagation();
        if (!window.confirm("Delete this draft?")) return;

        try {
            if (!isGuest) {
                await api.delete(`/chat/sessions/${sessionId}/draft`);
            }

            setSessions((prev) => prev.filter((session) => session.id !== sessionId));
            setStarredChats((prev) => prev.filter((id) => id !== sessionId));
            removeDisappearingExpiryState([sessionId]);
            clearStoredDraft(sessionId);
            clearPendingDraftSnapshot();
            setDraftMenuSessionId(null);

            if (currentSessionId === sessionId) {
                setMessages([INITIAL_MESSAGE]);
                setCurrentSessionId(null);
                setCurrentSessionSource(null);
                resetComposerState();
            }

            setError(null);
        } catch (err) {
            console.error("Failed to delete draft:", err);
            setError("Failed to delete draft");
        }
    };

    const handleClearHistory = async () => {

        if (!window.confirm("Are you sure you want to clear all chat history?")) return;

        try {

            await chatbotApi.clearHistory();

            if (!isGuest) {

                await api.delete('/chat/sessions');

            }

            setMessages([INITIAL_MESSAGE]);

            setSessions([]);
            clearStoredDisappearingExpiries();
            setDisappearingExpiries({});

            setCurrentSessionId(null);
            setCurrentSessionSource(null);
            clearStoredDraft();
            clearPendingDraftSnapshot();
            setDraftMenuSessionId(null);
            resetComposerState();

            setError(null);

        } catch (err) {

            console.error("Failed to clear history:", err);

            setError("Failed to clear chat history");

        }

    };



    const handleNewChat = async () => {

        try {

            await chatbotApi.clearHistory();

        } catch (err) {

            console.error("Failed to clear AI memory:", err);

        }

        clearStoredDraft(currentSessionId);
        clearPendingDraftSnapshot();
        skipLocalBackupRestoreRef.current = true;
        localStorage.removeItem(localChatBackupKey);
        setMessages([INITIAL_MESSAGE]);
        setCurrentSessionId(null);
        setCurrentSessionSource(null);
        setError(null);
        setQuotedText(null);
        setFollowUpQuestions([]);
        setDraftMenuSessionId(null);
        resetComposerState();

        if (searchParams.has("sessionId")) {

            navigate("/chat", { replace: true });

        }

        setGreeting(prev => {

            const others = GREETING_SENTENCES.filter(g => g !== prev);

            return others[Math.floor(Math.random() * others.length)];

        });

        if (window.innerWidth < 1024) setIsSidebarOpen(false);

    };



    const handleSelectSession = async (sessionId, source) => {

        const session = sessions.find(s => s.id === sessionId);

        if (session) {

            await loadConversation(session, source);

        }

    };

    const beginEditingMessage = (messageIndex) => {

        const targetMessage = messages[messageIndex];

        if (targetMessage?.role !== "user") {

            return;

        }

        stopVoicePlayback();
        setEditingMessageId(getMessageDomId(targetMessage, messageIndex));
        setComposerValue(targetMessage.content || "");
        setQuotedText(null);
        setFollowUpQuestions([]);
        requestAnimationFrame(() => chatInputRef.current?.focus?.());

    };

    const syncConversationHistory = async (conversationMessages = messages) => {

        const history = buildBackendHistoryFromMessages(conversationMessages);

        if (history.length === 0) {

            await chatbotApi.clearHistory();
            return;

        }

        await chatbotApi.syncHistory(history);

    };



    const handleSend = async (text, options = {}) => {

        const normalizedText = typeof text === "string" ? text.trim() : "";

        if (!normalizedText) {

            return;

        }

        const now = Date.now();
        if (now - lastSendAtRef.current < 350) {
            return;
        }
        lastSendAtRef.current = now;

        const trimmedQuote = quotedText?.trim();

        const displayContent = trimmedQuote

            ? `Quoted text: "${trimmedQuote}"\n\n${normalizedText}`

            : normalizedText;

        const apiPayload = trimmedQuote

            ? `${normalizedText}\n\nQuoted text for context:\n"${trimmedQuote}"`

            : normalizedText;

        if (isGuest && messages.length >= 10) {

            setShowLimitModal(true);

            return;

        }
        const latestConnectionStatus = await getReadyConnectionStatus();

        if (!latestConnectionStatus.node) {
            setInlineSendError("Backend not connected");
            return;
        }

        if (latestConnectionStatus.node && !latestConnectionStatus.ai) {
            setInlineSendError(latestConnectionStatus.message || "AI service unavailable");
            const updatedWithErr = [...messages, withMessageId({
                role: "user",
                content: displayContent,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                requestMode: "default",
            }), withMessageId({
                role: "assistant",
                content: latestConnectionStatus.message || "AI service unavailable",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isError: true,
                retryText: normalizedText,
            })];
            setMessages(updatedWithErr);
            return;
        }

        const requestMode = options.source === "voice" ? "voice" : "default";

        const userMsg = withMessageId({

            role: "user",

            content: displayContent,

            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),

            requestMode,

        });
        const pendingMessages = [...messages, userMsg];
        setMessages(pendingMessages);
        setQuotedText(null);
        pendingAbandonedDraftIdRef.current = null;

        const keepDraftState = shouldKeepDraftState(currentSessionId);

        const pendingTitle = getConversationTitle(pendingMessages, currentSessionId);
        writePendingDraftSnapshot({
            sessionId: currentSessionId,
            nextMessages: pendingMessages,
            title: pendingTitle,
        });



        setIsLoading(true);
        isLoadingRef.current = true;
        const controller = startLLMRequest();
        const assistantId = createMessageId();
        const pendingAssistantMsg = withMessageId({
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            modelName: selectedModel.name,
            isStreaming: true,
            autoReadAloud: requestMode === "voice",
        });
        activeAssistantMessageIdRef.current = assistantId;
        setMessages([...pendingMessages, pendingAssistantMsg]);

        let persistedSessionId = currentSessionId;

        if (!isGuest && !isIncognito && keepDraftState) {
            try {
                const savedDraft = await persistSession({
                    sessionId: persistedSessionId,
                    nextMessages: pendingMessages,
                    title: pendingTitle,
                    isDraft: true,
                });

                if (savedDraft?.id) {
                    persistedSessionId = savedDraft.id;
                }
            } catch (draftErr) {
                console.error("Failed to save pending draft:", draftErr);
            }
        }

        try {
            let streamedText = "";
            let response = null;

            try {
                response = await chatbotApi.sendMessageStreaming({
                    question: apiPayload,
                    model: selectedModel.id,
                    useHistory: true,
                    signal: controller.signal,
                    onChunk: (delta) => {
                        streamedText += delta;
                        setMessages((currentMessages) => currentMessages.map((message) => (
                            message.id === assistantId
                                ? { ...message, content: `${message.content || ""}${delta}` }
                                : message
                        )));
                    },
                });
            } catch (streamErr) {
                if (streamErr?.name === 'AbortError') {
                    throw streamErr;
                }
                response = await chatbotApi.sendMessage(apiPayload, selectedModel.id, true, controller.signal);
            }

            const finalAssistantMsg = withMessageId({
                ...pendingAssistantMsg,
                content: response?.answer || streamedText,
                referenceLinks: response?.reference_links || [],
                isStreaming: false,
                autoReadAloud: requestMode === "voice",
            });

            const followUps = response?.follow_up_questions?.type_2_context_aware || response?.type_2_context_aware || response?.follow_ups || [];
            setFollowUpQuestions(followUps.slice(0, 3));

            const updatedMessages = [...pendingMessages, finalAssistantMsg];
            setMessages(updatedMessages);



            if (!isGuest && !isIncognito) {

                try {

                    await persistSession({
                        sessionId: persistedSessionId,
                        nextMessages: updatedMessages,
                        title: getConversationTitle(updatedMessages, persistedSessionId),
                        isDraft: keepDraftState
                    });

                } catch (dbErr) {

                    console.error("Failed to save history to DB:", dbErr);

                }

            }

        } catch (err) {

            // Silently discard aborted requests (user clicked Edit while loading)
            if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') {
                if (suppressAbortStoppedRef.current) {
                    suppressAbortStoppedRef.current = false;
                } else {
                    markLastAssistantStopped();
                }
                return;
            }

            console.error("API Error:", err);

            const errorMessage = err.response?.data?.detail || err.message || "Failed to get response";

            setError(errorMessage);

            const updatedWithErr = [...pendingMessages, {
                id: createMessageId(),

                role: "assistant",

                content: `Sorry, I encountered an error: ${errorMessage}. Please try again.`,

                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),

                isError: true,
                retryText: normalizedText,

            }];

            setMessages(updatedWithErr);



            if (!isGuest && !isIncognito) {

                persistSession({

                    sessionId: persistedSessionId,

                    nextMessages: updatedWithErr,
                    title: getConversationTitle(updatedWithErr, persistedSessionId),
                    isDraft: keepDraftState

                }).catch(() => { });

            }

        } finally {

            setIsLoading(false);
            isLoadingRef.current = false;
            finishLLMRequest();

        }

    };



    const handleVoiceMessage = async ({ transcription, answer, audioBase64, reference_links, isError = false, error = null }) => {
        if (!transcription && !answer && !isError) return;

        setIsLoading(false);
        isLoadingRef.current = false;

        const keepDraftState = shouldKeepDraftState(currentSessionId);

        const userMsg = withMessageId({
            role: "user",
            content: transcription || "(Voice message)",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            requestMode: "voice",
            voiceMode: "s2s",
        });

        const assistantMsg = withMessageId({
            role: "assistant",
            content: isError ? (error || "Speech processing failed.") : answer,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            modelName: selectedModel.name,
            audioBase64: audioBase64,
            referenceLinks: reference_links,
            isError,
            retryText: isError ? (transcription || "") : undefined,
            retryAsVoice: isError,
        });
        activeAssistantMessageIdRef.current = assistantMsg.id;

        const updatedMessages = [...messages, userMsg, assistantMsg];
        setMessages(updatedMessages);

        if (!isGuest && !isIncognito) {
            try {
                await persistSession({
                    sessionId: currentSessionId,
                    nextMessages: updatedMessages,
                    title: currentSessionId
                        ? sessions.find((session) => session.id === currentSessionId)?.title || getSessionTitle(updatedMessages)
                        : getSessionTitle(updatedMessages, "Voice Chat"),
                    isDraft: keepDraftState
                });
            } catch (dbErr) {
                console.error("Failed to save voice chat to DB:", dbErr);
            }
        }
    };

    // ── Text-to-Text (Multilingual) handler ──
    const handleTranslate = async (text, options = {}) => {
        if (!text || !text.trim()) return;
        if (isGuest && messages.length >= 10) { setShowLimitModal(true); return; }

        const latestConnectionStatus = await getReadyConnectionStatus();

        if (!latestConnectionStatus.node) {
            setInlineSendError("Backend not connected");
            return;
        }
        if (latestConnectionStatus.node && !latestConnectionStatus.ai) {
            setInlineSendError(latestConnectionStatus.message || "AI service unavailable");
            return;
        }
        setError(null);
        setFollowUpQuestions([]);
        const userMsg = withMessageId({
            role: "user",
            content: text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            requestMode: "translated",
            languageCode: selectedLanguage,
        });
        const pendingMessages = [...messages, userMsg];
        setMessages(pendingMessages);
        pendingAbandonedDraftIdRef.current = null;

        const keepDraftState = shouldKeepDraftState(currentSessionId);

        const pendingTitle = getConversationTitle(pendingMessages, currentSessionId);
        writePendingDraftSnapshot({
            sessionId: currentSessionId,
            nextMessages: pendingMessages,
            title: pendingTitle,
        });

        setIsLoading(true);
        isLoadingRef.current = true;
        const controller = startLLMRequest();
        const assistantId = createMessageId();
        const pendingAssistantMsg = withMessageId({
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            modelName: selectedModel.name,
            isStreaming: true,
            autoReadAloud: options.source === "voice",
        });
        activeAssistantMessageIdRef.current = assistantId;
        setMessages([...pendingMessages, pendingAssistantMsg]);

        let persistedSessionId = currentSessionId;

        if (!isGuest && !isIncognito && keepDraftState) {
            try {
                const savedDraft = await persistSession({
                    sessionId: persistedSessionId,
                    nextMessages: pendingMessages,
                    title: pendingTitle,
                    isDraft: true,
                });

                if (savedDraft?.id) {
                    persistedSessionId = savedDraft.id;
                }
            } catch (draftErr) {
                console.error("Failed to save pending translated draft:", draftErr);
            }
        }

        try {
            const response = await chatbotApi.textToText(text, selectedLanguage, selectedModel.id, true, controller.signal);
            const assistantMsg = withMessageId({
                ...pendingAssistantMsg,
                role: "assistant",
                content: response.answer,
                modelName: selectedModel.name,
                autoReadAloud: options.source === "voice",
                isStreaming: false,
            });
            const updatedMessages = [...pendingMessages, assistantMsg];
            setMessages(updatedMessages);
            if (!isGuest && !isIncognito) {
                try {
                    await persistSession({
                        sessionId: persistedSessionId,
                        nextMessages: updatedMessages,
                        title: getConversationTitle(updatedMessages, persistedSessionId),
                        isDraft: keepDraftState
                    });
                } catch (dbErr) { console.error("Failed to save translated chat to DB:", dbErr); }
            }
        } catch (err) {
            // Silently discard aborted requests
            if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') {
                if (suppressAbortStoppedRef.current) {
                    suppressAbortStoppedRef.current = false;
                } else {
                    markLastAssistantStopped();
                }
                return;
            }
            console.error("Text-to-Text API Error:", err);
            const errorMessage = err.response?.data?.detail || err.message || "Translation failed";
            setError(errorMessage);
            const updatedWithError = [...pendingMessages, withMessageId({ role: "assistant", content: `Sorry, translation failed: ${errorMessage}. Please try again.`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), isError: true, retryText: text })];
            setMessages(updatedWithError);
            finishLLMRequest();

            if (!isGuest && !isIncognito) {
                persistSession({
                    sessionId: persistedSessionId,
                    nextMessages: updatedWithError,
                    title: getConversationTitle(updatedWithError, persistedSessionId),
                    isDraft: keepDraftState
                }).catch(() => { });
            }
        } finally {
            setIsLoading(false);
            isLoadingRef.current = false;
            finishLLMRequest();
        }
    };

    const handleS2SRequestReady = async ({ audioBlob, mimeType, displayTranscript }) => {
        if (!audioBlob) {
            return;
        }

        const latestConnectionStatus = await getReadyConnectionStatus();

        if (!latestConnectionStatus.node) {
            setInlineSendError("Backend not connected");
            return;
        }
        if (latestConnectionStatus.node && !latestConnectionStatus.ai) {
            setInlineSendError(latestConnectionStatus.message || "AI service unavailable");
            return;
        }

        setError(null);
        setFollowUpQuestions([]);
        setIsLoading(true);
        isLoadingRef.current = true;
        const controller = startLLMRequest();
        const keepDraftState = shouldKeepDraftState(currentSessionId);
        const userMsg = withMessageId({
            role: "user",
            content: displayTranscript || "(Voice message)",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            requestMode: "voice",
            voiceMode: "s2s",
        });
        const assistantId = createMessageId();
        const pendingAssistantMsg = withMessageId({
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            modelName: selectedModel.name,
            isStreaming: true,
            autoReadAloud: true,
        });
        activeAssistantMessageIdRef.current = assistantId;
        const pendingMessages = [...messages, userMsg, pendingAssistantMsg];
        setMessages(pendingMessages);

        try {
            const audioBase64 = await blobToBase64(audioBlob);
            const response = await chatbotApi.speechToSpeech(
                audioBase64,
                mimeType || "audio/webm",
                selectedLanguage || "en-IN",
                true,
                selectedModel.id,
                controller.signal
            );

            const resolvedUserMsg = {
                ...userMsg,
                content: response.transcript || displayTranscript || "(Voice message)",
            };
            const finalAssistantMsg = withMessageId({
                ...pendingAssistantMsg,
                content: response.answer || "",
                audioBase64: response.audio_base64,
                referenceLinks: response.reference_links,
                isStreaming: false,
                autoReadAloud: true,
            });
            const updatedMessages = [...messages, resolvedUserMsg, finalAssistantMsg];
            setMessages(updatedMessages);

            if (!isGuest && !isIncognito) {
                try {
                    await persistSession({
                        sessionId: currentSessionId,
                        nextMessages: updatedMessages,
                        title: currentSessionId
                            ? sessions.find((session) => session.id === currentSessionId)?.title || getSessionTitle(updatedMessages)
                            : getSessionTitle(updatedMessages, "Voice Chat"),
                        isDraft: keepDraftState,
                    });
                } catch (dbErr) {
                    console.error("Failed to save voice chat to DB:", dbErr);
                }
            }

            setS2sResult({
                id: createMessageId(),
                ...response,
            });
        } catch (err) {
            if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') {
                markLastAssistantStopped();
                return;
            }

            const errorMessage = err.response?.data?.detail || err.response?.data?.message || err.message || "Speech processing failed.";
            const updatedWithError = [...messages, userMsg, withMessageId({
                ...pendingAssistantMsg,
                content: errorMessage,
                isStreaming: false,
                isError: true,
                retryText: displayTranscript || "",
                retryAsVoice: true,
            })];
            setMessages(updatedWithError);
            setS2sResult({ id: createMessageId() });
            finishLLMRequest();
        } finally {
            setIsLoading(false);
            isLoadingRef.current = false;
        }
    };

    const handleEditMessage = async (text, options = {}) => {
        if (!editingMessageId) {
            return;
        }

        const normalizedText = typeof text === "string" ? text.trim() : "";

        if (!normalizedText) {
            return;
        }

        const messageIndex = messages.findIndex((message, index) => getMessageDomId(message, index) === editingMessageId);
        const originalMessage = messages[messageIndex];

        if (originalMessage?.role !== "user") {
            resetComposerState();
            return;
        }

        if (isLoadingRef.current) {
            suppressAbortStoppedRef.current = true;
            currentAbortController.current?.abort();
            setIsLoading(false);
            isLoadingRef.current = false;
        }

        const previousMessages = messages.slice(0, messageIndex);
        const editedUserMessage = withMessageId({
            ...originalMessage,
            content: normalizedText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isEdited: true,
            requestMode: options.source === "voice" ? "voice" : originalMessage.requestMode,
        });

        const pendingMessages = [...previousMessages, editedUserMessage];
        const keepDraftState = shouldKeepDraftState(currentSessionId);
        const pendingTitle = getConversationTitle(pendingMessages, currentSessionId);
        const shouldTranslate = originalMessage?.requestMode === "translated";
        const shouldReturnSpeech = originalMessage?.voiceMode === "s2s";
        const shouldAutoRead = false;
        const editLanguageCode = shouldTranslate
            ? (originalMessage?.languageCode || selectedLanguage)
            : null;

        setMessages(pendingMessages);
        setError(null);
        setQuotedText(null);
        setFollowUpQuestions([]);
        resetComposerState();
        pendingAbandonedDraftIdRef.current = null;

        writePendingDraftSnapshot({
            sessionId: currentSessionId,
            nextMessages: pendingMessages,
            title: pendingTitle,
        });

        setIsLoading(true);
        isLoadingRef.current = true;
        const controller = startLLMRequest();
        const assistantId = createMessageId();
        const pendingAssistantMsg = withMessageId({
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            modelName: selectedModel.name,
            isStreaming: true,
            autoReadAloud: shouldAutoRead,
        });
        activeAssistantMessageIdRef.current = assistantId;
        setMessages([...pendingMessages, pendingAssistantMsg]);

        let persistedSessionId = currentSessionId;

        if (!isGuest && !isIncognito && keepDraftState) {
            try {
                const savedDraft = await persistSession({
                    sessionId: persistedSessionId,
                    nextMessages: pendingMessages,
                    title: pendingTitle,
                    isDraft: true,
                });

                if (savedDraft?.id) {
                    persistedSessionId = savedDraft.id;
                }
            } catch (draftErr) {
                console.error("Failed to save edited draft:", draftErr);
            }
        }

        try {
            await syncConversationHistory(previousMessages);

            const response = shouldReturnSpeech
                ? await chatbotApi.speechToSpeechText(normalizedText, selectedLanguage || "en-IN", true, selectedModel.id, controller.signal)
                : shouldTranslate
                    ? await chatbotApi.textToText(normalizedText, editLanguageCode, selectedModel.id, true, controller.signal)
                    : await chatbotApi.sendMessage(normalizedText, selectedModel.id, true, controller.signal);

            const assistantMsg = withMessageId({
                ...pendingAssistantMsg,
                role: "assistant",
                content: response.answer,
                modelName: selectedModel.name,
                referenceLinks: response.reference_links,
                audioBase64: response.audio_base64,
                autoReadAloud: shouldAutoRead,
                isStreaming: false,
            });

            const followUps = response?.follow_up_questions?.type_2_context_aware || response?.type_2_context_aware || response?.follow_ups || [];
            setFollowUpQuestions(followUps.slice(0, 3));

            const updatedMessages = [...pendingMessages, assistantMsg];
            setMessages(updatedMessages);

            if (shouldReturnSpeech && response.audio_base64) {
                setS2sResult({
                    id: createMessageId(),
                    ...response,
                });
            } else {
                finishLLMRequest();
            }

            if (!isGuest && !isIncognito) {
                try {
                    await persistSession({
                        sessionId: persistedSessionId,
                        nextMessages: updatedMessages,
                        title: getConversationTitle(updatedMessages, persistedSessionId),
                        isDraft: keepDraftState,
                    });
                } catch (dbErr) {
                    console.error("Failed to save edited chat to DB:", dbErr);
                }
            }
        } catch (err) {
            // Silently discard aborted requests
            if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') {
                if (suppressAbortStoppedRef.current) {
                    suppressAbortStoppedRef.current = false;
                } else {
                    markLastAssistantStopped();
                }
                return;
            }
            console.error("Edit regeneration error:", err);

            const errorMessage = err.response?.data?.detail || err.message || "Failed to regenerate response";
            setError(errorMessage);

            const updatedWithError = [...pendingMessages, withMessageId({
                role: "assistant",
                content: `Sorry, I encountered an error: ${errorMessage}. Please try again.`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isError: true,
                retryText: normalizedText,
                retryAsVoice: shouldReturnSpeech,
            })];

            setMessages(updatedWithError);
            finishLLMRequest();

            if (!isGuest && !isIncognito) {
                persistSession({
                    sessionId: persistedSessionId,
                    nextMessages: updatedWithError,
                    title: getConversationTitle(updatedWithError, persistedSessionId),
                    isDraft: keepDraftState,
                }).catch(() => { });
            }
        } finally {
            setIsLoading(false);
            isLoadingRef.current = false;
            if (!shouldReturnSpeech) {
                finishLLMRequest();
            }
        }
    };

    const handleComposerSend = (text, options = {}) => {
        if (editingMessageId !== null) {
            handleEditMessage(text, options);
            setComposerValue("");
            return;
        }

        if (selectedLanguage) {
            handleTranslate(text, options);
            setComposerValue("");
            return;
        }

        handleSend(text, options);
        setComposerValue("");
    };

    const handleRetryMessage = (message) => {
        const retryText = typeof message?.retryText === "string" ? message.retryText.trim() : "";
        if (!retryText) {
            return;
        }

        if (message.retryAsVoice) {
            setEditingMessageId(null);
            handleSend(retryText);
            return;
        }

        handleSend(retryText);
    };

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
    }, [refreshConnectionStatus]);

    React.useEffect(() => {
        if (isGuest || isIncognito) {
            return undefined;
        }

        const persistCurrentConversationDraft = () => {
            const snapshot = writePendingDraftSnapshot({
                sessionId: currentSessionId,
                nextMessages: messages,
                title: getConversationTitle(messages, currentSessionId),
                source: currentSessionSource,
            });

            if (snapshot && navigator.onLine) {
                sendKeepaliveDraftSnapshot(snapshot);
            }
        };

        const handlePageHide = () => {
            persistCurrentConversationDraft();
        };

        const handleOffline = () => {
            persistCurrentConversationDraft();
        };

        const handleOnline = () => {
            flushPendingDraftSnapshot();
        };

        window.addEventListener("pagehide", handlePageHide);
        window.addEventListener("beforeunload", handlePageHide);
        window.addEventListener("offline", handleOffline);
        window.addEventListener("online", handleOnline);

        return () => {
            window.removeEventListener("pagehide", handlePageHide);
            window.removeEventListener("beforeunload", handlePageHide);
            window.removeEventListener("offline", handleOffline);
            window.removeEventListener("online", handleOnline);
        };
    }, [
        currentSessionId,
        currentSessionSource,
        flushPendingDraftSnapshot,
        getConversationTitle,
        isGuest,
        isIncognito,
        messages,
        sendKeepaliveDraftSnapshot,
        writePendingDraftSnapshot,
    ]);

    React.useEffect(() => {
        if (!isDisappearingMode) {
            clearStoredDisappearingExpiries();
            expiredDisappearingSessionIdsRef.current.clear();
            setDisappearingExpiries({});
            return undefined;
        }

        const { expiredIds } = hydrateDisappearingExpiriesFromStorage();

        if (expiredIds.length) {
            expireDisappearingSessions(expiredIds);
        }

        return undefined;
    }, [isDisappearingMode]);

    React.useEffect(() => {
        if (!isDisappearingMode) {
            return undefined;
        }

        setCountdownNow(Date.now());
        const interval = window.setInterval(() => {
            setCountdownNow(Date.now());
        }, ONE_MINUTE_MS);

        return () => {
            window.clearInterval(interval);
        };
    }, [isDisappearingMode]);

    React.useEffect(() => {
        if (!isDisappearingMode) {
            return undefined;
        }

        const now = Date.now();
        const timers = [];
        const expiredIds = Object.entries(disappearingExpiries)
            .filter(([, expiry]) => parseDisappearingExpiry(expiry) <= now)
            .map(([sessionId]) => sessionId);

        if (expiredIds.length) {
            expireDisappearingSessions(expiredIds);
            return undefined;
        }

        Object.entries(disappearingExpiries).forEach(([sessionId, expiry]) => {
            const parsedExpiry = parseDisappearingExpiry(expiry);

            if (!parsedExpiry) {
                return;
            }

            const delay = parsedExpiry - now;

            if (delay <= 0) {
                expireDisappearingSessions([sessionId]);
                return;
            }

            timers.push(window.setTimeout(() => {
                expireDisappearingSessions([sessionId]);
            }, delay));
        });

        return () => {
            timers.forEach((timer) => window.clearTimeout(timer));
        };
    }, [disappearingExpiries, isDisappearingMode, sessions, currentSessionId, messages.length]);

    React.useEffect(() => {
        const handleStorage = (event) => {
            if (event.key === DISAPPEARING_MODE_STORAGE_KEY) {
                setIsDisappearingMode(event.newValue === "true");
                return;
            }

            if (event.key?.startsWith(DISAPPEARING_EXPIRY_STORAGE_PREFIX)) {
                hydrateDisappearingExpiriesFromStorage();
            }
        };

        window.addEventListener("storage", handleStorage);

        return () => {
            window.removeEventListener("storage", handleStorage);
        };
    }, []);

    React.useEffect(() => {
        if (isGuest) {
            return undefined;
        }

        const timers = [];
        const expireDraft = async (session) => {
            setSessions((prev) => prev.filter((item) => item.id !== session.id));
            setStarredChats((prev) => prev.filter((id) => id !== session.id));
            clearStoredDraft(session.id);

            if (currentSessionId === session.id) {
                resetChatSurface();
            }

            try {
                await api.delete(`/chat/sessions/${session.id}/draft`);
            } catch (err) {
                console.error("Failed to delete expired draft:", err);
            }
        };

        sessions
            .filter((session) => session.isDraft && session.draftExpiresAt)
            .forEach((session) => {
                const expiresAt = new Date(session.draftExpiresAt).getTime();

                if (Number.isNaN(expiresAt)) {
                    return;
                }

                const delay = expiresAt - Date.now();
                if (delay <= 0) {
                    expireDraft(session);
                    return;
                }

                timers.push(window.setTimeout(() => {
                    expireDraft(session);
                }, delay));
            });

        return () => {
            timers.forEach((timer) => window.clearTimeout(timer));
        };
    }, [sessions, isGuest, currentSessionId]);

    const draftSessions = sortSessionsForSidebar(
        sessions.filter((session) => session.isDraft),
        starredChats
    );

    const todaySessions = sortSessionsForSidebar(
        sessions,
        starredChats
    );

    const sidebarSessions = React.useMemo(
        () => sortSessionsForSidebar(sessions, starredChats),
        [sessions, starredChats]
    );

    const filteredSessions = React.useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        if (!query) {
            return sidebarSessions;
        }

        return sidebarSessions.filter((session) => {
            const title = session.title?.toLowerCase() || "";
            const firstUserMessage = session.messages
                ?.find((message) => message.role === "user")
                ?.content
                ?.toLowerCase() || "";

            return title.includes(query) || firstUserMessage.includes(query);
        });
    }, [sidebarSessions, searchQuery]);

    const starredSidebarSessions = filteredSessions.filter((session) => starredChats.includes(session.id));
    const recentSidebarSessions = filteredSessions.filter((session) => !starredChats.includes(session.id));

    const activeDisappearingSessionId = currentSessionId || (messages.length > 1 ? `local-${user?.id || "guest"}` : null);
    const activeDisappearingCountdownLabel = getDisappearingCountdownLabel(activeDisappearingSessionId);

    const isSessionActive = (session, source) => {
        if (currentSessionId !== session.id) {
            return false;
        }

        return resolveSessionSource(session, currentSessionSource) === source;
    };

    const renderSidebarSessionItem = (session) => {
        const active = currentSessionId === session.id;
        const isStarred = starredChats.includes(session.id);
        const draftExpiryLabel = session.isDraft ? formatDraftExpiryTime(session.draftExpiresAt) : "";
        const sessionSource = resolveSessionSource(session, currentSessionSource);

        return (
            <div key={session.id} className="relative group px-2">
                <button
                    onClick={() => {
                        if (renamingSessionId !== session.id) {
                            handleSelectSession(session.id, sessionSource);
                            if (window.innerWidth < 1024) setIsSidebarOpen(false);
                        }
                    }}
                    className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm transition-all duration-200 min-h-[48px]",
                        active
                            ? "bg-accent/10 text-accent font-medium ring-1 ring-accent/30"
                            : "text-zinc-700 dark:text-zinc-300 hover:bg-accent/5 hover:text-zinc-900 dark:hover:text-zinc-100 hover:ring-1 hover:ring-accent/20"
                    )}
                >
                    <MessageSquare className={cn("h-4 w-4 shrink-0 transition-colors duration-200", active ? "text-accent" : "text-zinc-400 group-hover:text-accent/70")} />

                    {renamingSessionId === session.id ? (
                        <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => handleRenameKeyDown(e, session.id)}
                            onBlur={() => handleRenameSubmit(session.id)}
                            className="flex-1 min-w-0 bg-white dark:bg-zinc-800 border border-accent/50 rounded px-1.5 py-1 text-sm focus:outline-none text-zinc-900 dark:text-zinc-100"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className="min-w-0 flex-1 text-left">
                            <span className="block truncate">{session.title || "Chat session"}</span>
                            {renderDisappearingCountdown(session.id)}
                            {session.isDraft && (
                                <span className="mt-1 block text-[11px] font-medium text-zinc-400">
                                    Draft{draftExpiryLabel ? ` until ${draftExpiryLabel}` : ""}
                                </span>
                            )}
                        </span>
                    )}

                    {renamingSessionId !== session.id && (
                        <span className="flex items-center max-sm:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0">
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(activeMenuId === session.id ? null : session.id);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setActiveMenuId(activeMenuId === session.id ? null : session.id);
                                    }
                                }}
                                className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 min-w-[36px] min-h-[36px] flex items-center justify-center"
                                aria-label="Chat actions"
                            >
                                <MoreVertical className="h-4 w-4" />
                            </span>
                        </span>
                    )}
                </button>

                <AnimatePresence>
                    {activeMenuId === session.id && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -5 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -5 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-4 top-10 z-[60] w-36 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden"
                        >
                            <div className="flex flex-col p-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleStar(session.id, e);
                                        setActiveMenuId(null);
                                    }}
                                    className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                                >
                                    <span>{isStarred ? "Unstar" : "Star Chat"}</span>
                                    <Star className={cn("h-3.5 w-3.5", isStarred && "fill-yellow-400 text-yellow-400")} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setRenameValue(session.title || "");
                                        setRenamingSessionId(session.id);
                                        setActiveMenuId(null);
                                    }}
                                    className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                                >
                                    <span>Rename</span>
                                </button>
                                <div className="h-px bg-zinc-200 dark:bg-white/10 my-1 mx-2" />
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        session.isDraft
                                            ? handleDeleteDraft(session.id, e)
                                            : handleDeleteSession(session.id, e);
                                        setActiveMenuId(null);
                                    }}
                                    className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                >
                                    <span>Delete</span>
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    const renderMobileLanguageDrawer = () => (
        <div className="sm:hidden w-full flex flex-col items-center mt-3 relative">
            <button
                type="button"
                onClick={() => setIsMobileFooterExpanded((expanded) => !expanded)}
                className="h-1.5 w-10 rounded-full bg-zinc-300 transition-all hover:bg-zinc-400 dark:bg-white/20 dark:hover:bg-white/30"
                aria-label="Toggle response language"
            />

            <AnimatePresence>
                {isMobileFooterExpanded && !isTyping && (
                    <motion.div
                        initial={{ opacity: 0, y: -15, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -15, height: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="flex w-full flex-col items-center justify-center overflow-visible pt-4"
                    >
                        <div className="relative" style={{ zIndex: 60 }}>
                            <button
                                type="button"
                                onClick={() => setIsLangDropdownOpen((open) => !open)}
                                className="flex min-h-[36px] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-4 py-1.5 text-[13px] font-medium text-slate-700 shadow-sm backdrop-blur-md transition-all hover:border-blue-400 hover:text-blue-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:border-blue-400 dark:hover:text-white"
                            >
                                <span className="text-[14px]">{TRANSLATE_LANGUAGES.find((language) => language.code === selectedLanguage)?.flag}</span>
                                <span>{TRANSLATE_LANGUAGES.find((language) => language.code === selectedLanguage)?.label || "English"}</span>
                                <ChevronDown className={cn("h-3.5 w-3.5 opacity-60 transition-transform", isLangDropdownOpen && "rotate-180")} />
                            </button>

                            <AnimatePresence>
                                {isLangDropdownOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95, x: "-50%" }}
                                        animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95, x: "-50%" }}
                                        transition={{ duration: 0.15 }}
                                        style={{ transformOrigin: "bottom center" }}
                                        className="absolute bottom-full left-1/2 z-[100] mb-3 w-[280px] rounded-2xl border border-slate-200/80 bg-white/95 p-2 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/95"
                                    >
                                        <div className="max-h-[300px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                            {TRANSLATE_LANGUAGES.map((language) => (
                                                <button
                                                    key={language.code || "en"}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedLanguage(language.code);
                                                        setIsLangDropdownOpen(false);
                                                    }}
                                                    className={cn(
                                                        "flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-[14px] font-medium transition-all",
                                                        selectedLanguage === language.code
                                                            ? "bg-blue-600 text-white shadow-md"
                                                            : "text-slate-600 hover:bg-slate-50 hover:text-blue-600 active:bg-slate-100 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white dark:active:bg-white/10"
                                                    )}
                                                >
                                                    <span className="text-xl">{language.flag}</span>
                                                    <span className="flex-1 text-left">{language.label}</span>
                                                    {selectedLanguage === language.code && <Check className="h-4 w-4 shrink-0" />}
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <p className="mb-1 mt-3 max-w-[280px] text-center text-[11px] leading-relaxed tracking-wide text-zinc-400/80 dark:text-zinc-500">
                            {t('chat.disclaimer') || "DigiLab Learning Assistant can make mistakes. Verify important information."}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );

    return (

        <PageTransition className="relative flex h-screen w-full overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">



            {/* Ask DigiLab Tooltip */}

            <AnimatePresence>

                {selectionData.visible && (

                    <div

                        id="selection-tooltip"

                        className="fixed z-[9999] -translate-x-1/2 -translate-y-full pb-2 pointer-events-auto drop-shadow-2xl"

                        style={{ left: selectionData.x, top: selectionData.y }}

                    >

                        <motion.button

                            initial={{ opacity: 0, y: 10, scale: 0.9 }}

                            animate={{ opacity: 1, y: 0, scale: 1 }}

                            exit={{ opacity: 0, y: 10, scale: 0.9 }}

                            transition={{ duration: 0.15, ease: "easeOut" }}

                            onClick={() => {

                                setQuotedText(selectionData.text);

                                setSelectionData(prev => ({ ...prev, visible: false }));

                                window.getSelection().removeAllRanges();

                            }}

                            className="flex items-center gap-2 rounded-xl bg-zinc-900 dark:bg-zinc-800 px-3 py-2 text-sm font-medium text-white shadow-xl border border-white/10 hover:bg-zinc-800 dark:hover:bg-zinc-700 transition-colors"

                        >

                            <QuoteIcon className="h-3 w-3" />

                            Ask DigiLab

                        </motion.button>

                    </div>

                )}

            </AnimatePresence>



            {/* Sidebar - Context / History */}
            <>
                {/* Mobile Overlay */}
                <AnimatePresence>
                    {isSidebarOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsSidebarOpen(false)}
                            className={cn("fixed inset-0 z-[55] bg-black/50", !isIncognito && "lg:hidden")}
                        />
                    )}
                </AnimatePresence>

                {/* Sidebar Container */}
                <div
                    className={cn(
                        "fixed inset-y-0 left-0 z-[60] flex flex-col border-r border-slate-200/80 dark:border-white/5 bg-white dark:bg-zinc-950 h-full transition-[width,transform] duration-300 ease-in-out lg:relative shadow-[2px_0_20px_rgba(0,0,0,0.04)] dark:shadow-none",
                        isSidebarOpen
                            ? "w-[85vw] min-w-[280px] max-w-[320px] translate-x-0 lg:w-80 lg:min-w-[320px]"
                            : "-translate-x-full lg:translate-x-0 lg:w-[72px] lg:min-w-[72px]"
                    )}
                >
                    {/* Expanded Sidebar (Visible when open, hidden on desktop when closed) */}
                    <div className={cn("flex flex-col h-full w-full overflow-hidden whitespace-nowrap", !isSidebarOpen && "lg:hidden")}>

                        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 dark:border-white/5 px-4 bg-white/90 dark:bg-zinc-950/80 sticky top-0 z-10 backdrop-blur-md">
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
                                className="h-11 w-11 p-0 text-foreground-muted hover:text-accent hover:bg-accent/10 transition-all duration-300 rounded-xl flex items-center justify-center shrink-0"
                                title="Close sidebar"
                            >
                                <Menu className="h-5 w-5 transform rotate-90 transition-transform duration-300" />
                            </button>
                        </div>

                        <div className="flex flex-col flex-1 overflow-hidden">
                            <div className="p-4 space-y-4 shrink-0 border-b border-zinc-200 dark:border-white/5">
                                {/* Disappearing Messages Toggle */}
                                <div className="flex items-center justify-between px-3 py-3 bg-slate-50 dark:bg-zinc-800/50 rounded-xl border border-slate-200/80 dark:border-white/5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("p-1.5 rounded-lg", isDisappearingMode ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400")}>
                                            <Loader2 className={cn("h-4 w-4", isDisappearingMode && "animate-spin")} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Disappearing</p>
                                            <p className="text-[10px] text-zinc-500 font-medium">Auto-delete after 24h</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleToggleDisappearingMode}
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

                                <button
                                    onClick={() => {
                                        handleNewChat();
                                        if (window.innerWidth < 1024) setIsSidebarOpen(false);
                                    }}
                                    className="w-full flex items-center justify-start gap-2 bg-gradient-to-r from-blue-50 to-indigo-50/50 dark:from-white/5 dark:to-white/5 dark:bg-none text-blue-600 dark:text-white hover:from-blue-100 hover:to-indigo-100/50 dark:hover:from-white/10 dark:hover:to-white/10 border border-blue-200/80 dark:border-white/10 rounded-lg px-4 py-2 font-medium transition-all duration-200 min-h-[44px] shadow-sm hover:shadow-md"
                                >
                                    <Plus className="h-4 w-4" />
                                    New Chat
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4">
                                {isIncognito ? (
                                    <div className="px-4 py-8 mt-4 text-center flex flex-col items-center justify-center">
                                        <div className="h-12 w-12 rounded-full bg-zinc-100 dark:bg-zinc-800/50 flex items-center justify-center mb-3">
                                            <IncognitoIcon className="h-6 w-6 text-zinc-400" />
                                        </div>
                                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                                            Incognito Mode Active
                                        </p>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-[200px] leading-relaxed">
                                            Chats are temporary and not saved to history.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-5 pt-2">
                                        <section className="space-y-2">
                                            <div className="flex items-center justify-between px-2">
                                                <div className="min-w-0">
                                                    <h3 className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                                        <Star className="h-3.5 w-3.5 text-yellow-400" />
                                                        Starred Chats
                                                        <span className="text-zinc-400">({starredSidebarSessions.length})</span>
                                                    </h3>
                                                    {starredSidebarSessions.length > 0 && (
                                                        <p className="mt-0.5 text-[11px] text-zinc-400">
                                                            {starredSidebarSessions.length} pinned conversation{starredSidebarSessions.length === 1 ? "" : "s"}
                                                        </p>
                                                    )}
                                                </div>
                                                <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
                                            </div>

                                            {starredSidebarSessions.length > 0 && (
                                                <div className="space-y-2">
                                                    {starredSidebarSessions.map(renderSidebarSessionItem)}
                                                </div>
                                            )}
                                        </section>

                                        <div className="relative px-2">
                                            <div className="relative flex items-center">
                                                <MdSearch className="absolute left-4 text-zinc-400 h-4 w-4" />
                                                <input
                                                    id="sidebar-search"
                                                    type="text"
                                                    placeholder="Search chats..."
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/5 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 transition-all"
                                                />
                                            </div>
                                        </div>

                                        <section className="space-y-2">
                                            <div className="flex items-center justify-between px-2">
                                                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Recent Chats</h3>
                                                <button
                                                    onClick={handleClearHistory}
                                                    className="text-zinc-400 hover:text-red-500 transition-colors p-1 rounded"
                                                    title="Clear all history"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>

                                            {recentSidebarSessions.length > 0 && (
                                                <div className="space-y-2">
                                                    {recentSidebarSessions.map(renderSidebarSessionItem)}
                                                </div>
                                            )}
                                        </section>

                                        {filteredSessions.length === 0 && (
                                            <div className="px-4 py-8 mt-4 text-center flex flex-col items-center justify-center">
                                                <div className="h-12 w-12 rounded-full bg-zinc-100 dark:bg-zinc-800/50 flex items-center justify-center mb-3">
                                                    <MessageSquareDashed className="h-6 w-6 text-zinc-400" />
                                                </div>
                                                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                                                    {searchQuery ? "No matching chats found" : "No conversations yet"}
                                                </p>
                                                {!searchQuery && (
                                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-[200px] leading-relaxed">
                                                        Start a new chat to begin learning.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-auto border-t border-slate-200/80 dark:border-white/5 p-4 bg-slate-50/80 dark:bg-zinc-950/50 shrink-0">
                            <Link
                                to="/profile"
                                onClick={() => setIsSidebarOpen(false)}
                                className="flex w-full items-center gap-3 rounded-xl p-3 transition-all hover:bg-blue-50/60 dark:hover:bg-white/5 group bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-white/5 shadow-sm hover:shadow-md hover:border-blue-200/60 duration-200"
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
                                <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                            </Link>
                        </div>
                    </div>

                    {/* Collapsed Rail (Visible on desktop when closed) */}
                    <div className={cn(
                        "hidden flex-col h-full w-full items-center py-4 opacity-0 transition-all duration-300",
                        !isSidebarOpen && "lg:flex opacity-100",
                        isIncognito
                            ? "border-r"
                            : "bg-slate-50/50 dark:bg-transparent border-r border-slate-200/60 dark:border-transparent"
                    )}
                        style={isIncognito ? {
                            background: 'linear-gradient(180deg, #131e2b 0%, #111928 100%)',
                            borderColor: 'rgba(255,255,255,0.06)'
                        } : undefined}>
                        {/* Toggle Sidebar Button */}
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className={cn(
                                "h-10 w-10 transition-all duration-200 rounded-xl flex items-center justify-center shrink-0 mb-6",
                                isIncognito
                                    ? "text-slate-400 hover:text-slate-200 hover:bg-white/6"
                                    : "text-slate-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-white/5 hover:shadow-sm"
                            )}
                            title="Expand sidebar"
                        >
                            <Menu className="h-5 w-5" />
                        </button>

                        {/* Disappearing Messages Toggle */}
                        <button
                            onClick={handleToggleDisappearingMode}
                            className={cn(
                                "h-10 w-10 flex items-center justify-center rounded-xl transition-all duration-200 shrink-0 mb-4",
                                isDisappearingMode
                                    ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 shadow-sm"
                                    : isIncognito
                                        ? "text-slate-400 hover:text-slate-200 hover:bg-white/6"
                                        : "text-slate-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-white/5 hover:shadow-sm"
                            )}
                            title={isDisappearingMode ? "Disappearing Mode: ON" : "Disappearing Mode: OFF"}
                        >
                            <Loader2 className={cn("h-5 w-5", isDisappearingMode && "animate-spin")} />
                        </button>

                        {/* New Chat Button */}
                        <button
                            onClick={() => handleNewChat()}
                            className={cn(
                                "h-10 w-10 flex items-center justify-center rounded-xl transition-all duration-200 shrink-0 shadow-sm hover:shadow-md",
                                isIncognito
                                    ? "bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 border border-indigo-500/20"
                                    : "bg-gradient-to-br from-blue-50 to-indigo-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:from-blue-100 hover:to-indigo-100 dark:hover:bg-blue-900/40 border border-blue-200/80 dark:border-blue-900/50"
                            )}
                            title="New Chat"
                        >
                            <Plus className="h-5 w-5" />
                        </button>

                        {/* Search Icon */}
                        <button
                            onClick={() => { setIsSidebarOpen(true); setTimeout(() => document.getElementById("sidebar-search")?.focus(), 300); }}
                            className={cn(
                                "h-10 w-10 flex items-center justify-center rounded-xl transition-all duration-200 shrink-0 mt-4",
                                isIncognito
                                    ? "text-slate-400 hover:text-slate-200 hover:bg-white/6"
                                    : "text-slate-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-white/5 hover:shadow-sm"
                            )}
                            title="Search chats"
                        >
                            <MdSearch className="h-5 w-5" />
                        </button>

                        {/* User Avatar */}
                        <div className="mt-auto">
                            <Link
                                to="/profile"
                                className={cn(
                                    "h-10 w-10 flex items-center justify-center rounded-full ring-2 transition-all overflow-hidden",
                                    isIncognito
                                        ? "bg-slate-700/50 text-slate-300 ring-slate-700/50 hover:ring-slate-600"
                                        : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 ring-blue-100 dark:ring-blue-900/30 hover:ring-blue-200 dark:hover:ring-blue-900/50"
                                )}
                                title="Profile"
                            >
                                {user?.profilePhoto ? (
                                    <img src={user.profilePhoto} alt="Avatar" className="h-full w-full object-cover" />
                                ) : (
                                    <UserIcon className="h-5 w-5" />
                                )}
                            </Link>
                        </div>
                    </div>

                </div>
            </>



            {/* Main Chat Area */}

            <div className="flex flex-1 flex-col relative">
                <ConversationNavigator messages={messages} />

                <div className={cn(
                    "flex h-16 items-center px-4 sm:px-6 transition-all duration-300 z-50 sticky top-0 backdrop-blur-md border-b",
                    isIncognito ? "bg-zinc-900 justify-between border-white/5" : "bg-white/50 dark:bg-zinc-950/50 border-transparent justify-between"
                )}>
                    {isIncognito ? (
                        <div className="flex items-center gap-2">
                            <IncognitoIcon className="h-5 w-5 text-zinc-300" />
                            <span className="text-sm font-semibold text-zinc-200 tracking-tight">Incognito chat</span>
                        </div>
                    ) : (
                        <div className="flex min-w-0 items-center gap-2">
                            {!isSidebarOpen && (
                                <button
                                    onClick={() => setIsSidebarOpen(true)}
                                    aria-label="Open sidebar"
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-600 transition-all hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white lg:hidden"
                                >
                                    <Menu className="h-5 w-5" />
                                </button>
                            )}

                            <div className="relative min-w-0">
                                <button
                                    onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                                    className="flex min-w-0 items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 transition-all text-zinc-700 dark:text-zinc-200 group"
                                >
                                    <span className="truncate text-lg font-bold tracking-tight">
                                        {selectedModel.name}
                                    </span>
                                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-transform", isModelDropdownOpen && "rotate-180")} />
                                </button>

                                {activeDisappearingCountdownLabel && (
                                    <div className="px-3 text-[11px] font-semibold text-orange-500 dark:text-orange-400">
                                        {activeDisappearingCountdownLabel === "now"
                                            ? "Disappearing now"
                                            : `Disappears in ${activeDisappearingCountdownLabel}`}
                                    </div>
                                )}

                                <AnimatePresence>
                                    {isModelDropdownOpen && (
                                        <>
                                            <div
                                                className="fixed inset-0 z-10"
                                                onClick={() => setIsModelDropdownOpen(false)}
                                            />
                                            <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                className="absolute top-full left-0 mt-2 w-72 p-2 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-2xl z-20 backdrop-blur-xl"
                                            >
                                                <div className="space-y-1">
                                                    {MODELS.map((model) => (
                                                        <button
                                                            key={model.id}
                                                            onClick={() => {
                                                                setSelectedModel(model);
                                                                setIsModelDropdownOpen(false);
                                                            }}
                                                            className={cn(
                                                                "w-full flex items-start gap-3 p-3 rounded-xl transition-all text-left",
                                                                selectedModel.id === model.id
                                                                    ? "bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20"
                                                                    : "hover:bg-zinc-50 dark:hover:bg-white/5 border border-transparent"
                                                            )}
                                                        >
                                                            <div className={cn("mt-0.5", model.color)}>
                                                                <model.icon className="h-4 w-4" />
                                                            </div>
                                                            <div>
                                                                <p className={cn("text-xs font-bold leading-none mb-1", selectedModel.id === model.id ? "text-blue-600 dark:text-blue-400" : "text-zinc-800 dark:text-zinc-200")}>
                                                                    {model.name}
                                                                </p>
                                                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
                                                                    {model.description}
                                                                </p>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={async () => {
                            const nextIncognito = !isIncognito;
                            if (nextIncognito) {
                                await saveCurrentConversationAsDraft();
                                resetChatSurface();
                            } else {
                                pendingAbandonedDraftIdRef.current = null;
                                resetChatSurface();
                            }
                            setIsIncognito(nextIncognito);
                            if (nextIncognito) {
                                setIsSidebarOpen(false);
                                setIsModelDropdownOpen(false);
                            }
                        }}
                        title={isIncognito ? "Turn off incognito" : "Turn on incognito"}
                        className={cn(
                            "transition-all duration-200 p-2 rounded-full outline-none focus:outline-none",
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

                                            ref={chatInputRef}

                                            onSend={handleComposerSend}
                                            value={composerValue}
                                            onValueChange={setComposerValue}

                                            placeholder={chatInputPlaceholder}

                                            isLLMActive={isLLMActive}
                                            onStop={handleStopLLM}
                                            voiceControlRef={voiceInputRef}
                                            responseLanguage={selectedLanguage}
                                            isIncognito={isIncognito}

                                        />

                                        {inlineSendError && (
                                            <p className="mt-2 text-center text-xs text-red-500 dark:text-red-300">
                                                {inlineSendError}
                                            </p>
                                        )}

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
                                        <div className="mx-auto w-[95%] sm:w-[85%] lg:w-[80%] max-w-none space-y-6">

                                            {messages.map((msg, idx) => {

                                                const messageDomId = getMessageDomId(msg, idx);

                                                return (

                                                    <div key={messageDomId} id={`chat-message-${messageDomId}`} data-message-index={idx}>

                                                        <MessageBubble

                                                            message={msg}
                                                            isIncognito={isIncognito}

                                                            onEdit={msg.role === "user" ? () => beginEditingMessage(idx) : undefined}

                                                            isEditing={false}

                                                            onRetry={msg.isError ? () => handleRetryMessage(msg) : undefined}

                                                        />

                                                    </div>

                                                );

                                            })}

                                            {/* Follow-up Question Chips */}
                                            <AnimatePresence>
                                                {followUpQuestions.length > 0 && !isLoading && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 15 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        transition={{ duration: 0.3, delay: 0.2 }}
                                                        className="flex flex-wrap gap-2 px-4 pt-2"
                                                    >
                                                        {followUpQuestions.map((q, i) => (
                                                            <motion.button
                                                                key={i}
                                                                initial={{ opacity: 0, scale: 0.9 }}
                                                                animate={{ opacity: 1, scale: 1 }}
                                                                transition={{ delay: 0.3 + i * 0.1 }}
                                                                onClick={() => {
                                                                    setFollowUpQuestions([]);
                                                                    resetComposerState();
                                                                    handleSend(q);
                                                                }}
                                                                className="text-xs px-3 py-2 rounded-xl border border-accent/20 bg-accent/5 hover:bg-accent/15 text-accent hover:border-accent/40 transition-all duration-200 text-left leading-snug max-w-[280px] cursor-pointer"
                                                            >
                                                                {q}
                                                            </motion.button>
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            <div ref={messagesEndRef} className="h-24"></div>

                                        </div>

                                    </div>



                                    <div className="w-full pb-4 sm:pb-6 pt-4 z-40 bg-gradient-to-t from-zinc-900 to-transparent">

                                        <div className="mx-auto max-w-4xl px-4 relative text-center">

                                            <QuotedTextPreview

                                                quotedText={quotedText}

                                                onClear={() => setQuotedText(null)}

                                            />

                                            <ChatInput

                                                ref={chatInputRef}

                                                onSend={handleComposerSend}
                                                value={composerValue}
                                                onValueChange={setComposerValue}

                                                placeholder={chatInputPlaceholder}

                                                isLLMActive={isLLMActive}
                                                onStop={handleStopLLM}
                                                voiceControlRef={voiceInputRef}
                                                responseLanguage={selectedLanguage}
                                                isIncognito={isIncognito}

                                            />

                                            {inlineSendError && (
                                                <p className="mt-2 text-center text-xs text-red-500 dark:text-red-300">
                                                    {inlineSendError}
                                                </p>
                                            )}

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
                                        aria-label="Open sidebar"

                                        className="fixed bottom-6 left-6 z-50 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-500/40 transition-all active:scale-90 hover:scale-105"

                                    >

                                        <Menu className="h-6 w-6 sm:h-7 sm:w-7" />

                                    </motion.button>

                                )}

                            </AnimatePresence>



                            {currentTopic && (

                                <div className="border-b border-zinc-200 dark:border-white/5 bg-blue-50/50 dark:bg-blue-900/10 px-4 sm:px-6 py-3 sm:py-4">

                                    <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">

                                        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">

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

                                    <div className="text-center mb-10">



                                        <h1 className="text-4xl font-bold tracking-tight mb-3 text-zinc-900 dark:text-white">{greeting}</h1>

                                    </div>



                                    <div className="w-full relative px-4">

                                        <QuotedTextPreview

                                            quotedText={quotedText}

                                            onClear={() => setQuotedText(null)}

                                        />

                                        <ChatInput

                                            ref={chatInputRef}

                                            onSend={handleComposerSend}
                                            value={composerValue}
                                            onValueChange={setComposerValue}

                                            placeholder={chatInputPlaceholder}

                                            isLLMActive={isLLMActive}
                                            onStop={handleStopLLM}
                                            voiceControlRef={voiceInputRef}
                                            responseLanguage={selectedLanguage}
                                            isIncognito={isIncognito}

                                        />

                                        {inlineSendError && (
                                            <p className="mt-2 text-center text-xs text-red-500 dark:text-red-300">
                                                {inlineSendError}
                                            </p>
                                        )}

                                        {/* Compact Language Dropdown */}
                                        <div className="mt-3 flex items-center gap-2 relative max-sm:hidden" style={{ zIndex: 50 }}>
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 shrink-0">Respond in:</span>
                                            <div className="relative">
                                                <button
                                                    onClick={() => setIsLangDropdownOpen(o => !o)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 bg-white/5 text-zinc-300 hover:border-accent/50 hover:text-white transition-all"
                                                >
                                                    <span>{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.flag}</span>
                                                    <span>{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label || 'English'}</span>
                                                    <ChevronDown className={cn("h-3 w-3 transition-transform", isLangDropdownOpen && "rotate-180")} />
                                                </button>
                                                {isLangDropdownOpen && (
                                                    <div className="absolute left-0 top-full mt-1 w-40 rounded-xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-xl p-1 z-50">
                                                        {TRANSLATE_LANGUAGES.map(lang => (
                                                            <button
                                                                key={lang.code || 'en'}
                                                                onClick={() => { setSelectedLanguage(lang.code); setIsLangDropdownOpen(false); }}
                                                                className={cn(
                                                                    "flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                                                    selectedLanguage === lang.code
                                                                        ? "bg-accent text-white"
                                                                        : "text-zinc-400 hover:bg-white/5 hover:text-white"
                                                                )}
                                                            >
                                                                <span>{lang.flag}</span>
                                                                <span>{lang.label}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {renderMobileLanguageDrawer()}

                                    </div>

                                </motion.div>

                            ) : (

                                <div className="flex-1 flex flex-col overflow-hidden">

                                    <div className="flex-1 overflow-y-auto p-4 sm:p-8">

                                        <div className="mx-auto w-[95%] sm:w-[85%] lg:w-[80%] max-w-none space-y-6">

                                            {messages.map((msg, idx) => {

                                                const messageDomId = getMessageDomId(msg, idx);

                                                return (

                                                    <div key={messageDomId} id={`chat-message-${messageDomId}`} data-message-index={idx}>

                                                        <MessageBubble

                                                            message={msg}
                                                            isIncognito={isIncognito}

                                                            onEdit={msg.role === "user" ? () => beginEditingMessage(idx) : undefined}

                                                            isEditing={false}

                                                            onRetry={msg.isError ? () => handleRetryMessage(msg) : undefined}

                                                        />

                                                    </div>

                                                );

                                            })}



                                            {/* Follow-up Question Chips */}
                                            <AnimatePresence>
                                                {followUpQuestions.length > 0 && !isLoading && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 15 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        transition={{ duration: 0.3, delay: 0.2 }}
                                                        className="flex flex-wrap gap-2 px-4 pt-2"
                                                    >
                                                        {followUpQuestions.map((q, i) => (
                                                            <motion.button
                                                                key={i}
                                                                initial={{ opacity: 0, scale: 0.9 }}
                                                                animate={{ opacity: 1, scale: 1 }}
                                                                transition={{ delay: 0.3 + i * 0.1 }}
                                                                onClick={() => {
                                                                    setFollowUpQuestions([]);
                                                                    resetComposerState();
                                                                    handleSend(q);
                                                                }}
                                                                className="text-xs px-3 py-2 rounded-xl border border-accent/20 bg-accent/5 hover:bg-accent/15 text-accent hover:border-accent/40 transition-all duration-200 text-left leading-snug max-w-[280px] cursor-pointer"
                                                            >
                                                                {q}
                                                            </motion.button>
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

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

                                                ref={chatInputRef}

                                                onSend={handleComposerSend}
                                                value={composerValue}
                                                onValueChange={setComposerValue}

                                                placeholder={chatInputPlaceholder}

                                                isLLMActive={isLLMActive}
                                                onStop={handleStopLLM}
                                                voiceControlRef={voiceInputRef}
                                                responseLanguage={selectedLanguage}
                                                isIncognito={isIncognito}

                                            />

                                            {inlineSendError && (
                                                <p className="mt-2 text-center text-xs text-red-500 dark:text-red-300">
                                                    {inlineSendError}
                                                </p>
                                            )}

                                            {/* Desktop/tablet Language Dropdown */}
                                            <div className="mt-2 flex items-center gap-2 relative max-sm:hidden" style={{ zIndex: 50 }}>
                                                <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/60 shrink-0">Respond in:</span>
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setIsLangDropdownOpen(o => !o)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 bg-white/5 text-zinc-300 hover:border-accent/50 hover:text-white transition-all"
                                                    >
                                                        <span>{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.flag}</span>
                                                        <span>{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label || 'English'}</span>
                                                        <ChevronDown className={cn("h-3 w-3 transition-transform", isLangDropdownOpen && "rotate-180")} />
                                                    </button>
                                                    {isLangDropdownOpen && (
                                                        <div className="absolute left-0 bottom-full mb-1 w-40 rounded-xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-xl p-1 z-50">
                                                            {TRANSLATE_LANGUAGES.map(lang => (
                                                                <button
                                                                    key={lang.code || 'en'}
                                                                    onClick={() => { setSelectedLanguage(lang.code); setIsLangDropdownOpen(false); }}
                                                                    className={cn(
                                                                        "flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                                                        selectedLanguage === lang.code
                                                                            ? "bg-accent text-white"
                                                                            : "text-zinc-400 hover:bg-white/5 hover:text-white"
                                                                    )}
                                                                >
                                                                    <span>{lang.flag}</span>
                                                                    <span>{lang.label}</span>
                                                                    {selectedLanguage === lang.code && <Check className="ml-auto h-3 w-3 shrink-0" />}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <p className="mt-2 text-center text-[10px] text-zinc-400 dark:text-zinc-500 max-sm:hidden">

                                                {t('chat.disclaimer') || "Content generated by AI may contain errors."}

                                            </p>

                                            {/* Mobile bottom Language Drawer */}
                                            {renderMobileLanguageDrawer()}

                                        </div>

                                    </div>

                                </div>

                            )}

                        </motion.div>

                    )}

                </AnimatePresence>



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

            </div>

        </PageTransition>

    );

}
