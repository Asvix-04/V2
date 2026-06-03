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
    ArrowLeft, BookOpen, ChevronRight, FileText, Layout, Lightbulb, 
    MessageSquare, MoreHorizontal, Settings, Share, CheckCircle, Map, 
    Trash2, AlertCircle, Loader2, Wifi, WifiOff, Plus, User as UserIcon, X,
    CornerDownRight, Sparkles, Zap, ChevronDown, Star
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
    const dashboardPath = isGuest ? "/home" : (isTeacher ? "/dashboard?mode=teacher" : "/dashboard");



    const [messages, setMessages] = React.useState([INITIAL_MESSAGE]);

    const [sessions, setSessions] = React.useState([]);

    const [currentSessionId, setCurrentSessionId] = React.useState(null);
    const [currentSessionSource, setCurrentSessionSource] = React.useState(null);
    const [draftMenuSessionId, setDraftMenuSessionId] = React.useState(null);



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
    const [isIncognito, setIsIncognito] = React.useState(false);
    const [selectedModel, setSelectedModel] = React.useState(() => {
        const saved = localStorage.getItem("selectedModelId");
        return MODELS.find(m => m.id === saved) || MODELS[0];
    });
    const [isModelDropdownOpen, setIsModelDropdownOpen] = React.useState(false);
    const [selectedLanguage, setSelectedLanguage] = React.useState(null); // null = English (default)
    const [isTranslating, setIsTranslating] = React.useState(false);
    const [isLangDropdownOpen, setIsLangDropdownOpen] = React.useState(false);
    const [composerValue, setComposerValue] = React.useState("");
    const [editingMessageId, setEditingMessageId] = React.useState(null);
    const lastSendAtRef = React.useRef(0);

    const TRANSLATE_LANGUAGES = [
        { code: null,    label: "English",    flag: "🇬🇧" },
        { code: "hi-IN", label: "Hindi",      flag: "🇮🇳" },
        { code: "bn-IN", label: "Bengali",    flag: "🇧🇩" },
        { code: "gu-IN", label: "Gujarati",   flag: "🇮🇳" },
        { code: "kn-IN", label: "Kannada",    flag: "🇮🇳" },
        { code: "ml-IN", label: "Malayalam",  flag: "🇮🇳" },
        { code: "mr-IN", label: "Marathi",    flag: "🇮🇳" },
        { code: "od-IN", label: "Odia",       flag: "🇮🇳" },
        { code: "pa-IN", label: "Punjabi",    flag: "🇮🇳" },
        { code: "ta-IN", label: "Tamil",      flag: "🇮🇳" },
        { code: "te-IN", label: "Telugu",     flag: "🇮🇳" },
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
    const [followUpQuestions, setFollowUpQuestions] = React.useState([]);

    // ── Star & Disappearing Messages (Sagar's features) ──────────────
    const [starredChats, setStarredChats] = React.useState(() => {
        try { return JSON.parse(localStorage.getItem('starredChats') || '[]'); } catch { return []; }
    });
    const [isDisappearingMode, setIsDisappearingMode] = React.useState(() => {
        try { return localStorage.getItem('disappearingMode') === 'true'; } catch { return false; }
    });

    React.useEffect(() => {
        localStorage.setItem('starredChats', JSON.stringify(starredChats));
    }, [starredChats]);

    React.useEffect(() => {
        localStorage.setItem('disappearingMode', String(isDisappearingMode));
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
    const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:5001/api";

    const resetComposerState = () => {
        setComposerValue("");
        setEditingMessageId(null);
    };

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

            upsertSessionInState(savedSession);

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

                const health = await chatbotApi.checkHealth();
                setConnectionStatus(health);
                setIsConnected(Boolean(health.node));

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
                    setSessions(fetchedSessions);

                    const restoredDraft = await flushPendingDraftSnapshot(fetchedSessions);
                    const hydratedSessions = restoredDraft?.session
                        ? [restoredDraft.session, ...fetchedSessions.filter((session) => session.id !== restoredDraft.session.id)]
                        : fetchedSessions;

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

        const prompt = searchParams.get("prompt");

        if (prompt && isConnected && messages.length === 1 && !isLoading) {

            handleSend(prompt);

            const newParams = new URLSearchParams(searchParams);

            newParams.delete("prompt");

            navigate({ search: newParams.toString() }, { replace: true });

        }

    }, [isConnected, searchParams, messages.length, isLoading]);



    React.useEffect(() => {

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

    const handleDeleteDraft = async (sessionId, e) => {
        if (e) e.stopPropagation();
        if (!window.confirm("Delete this draft?")) return;

        try {
            if (!isGuest) {
                await api.delete(`/chat/sessions/${sessionId}/draft`);
            }

            setSessions((prev) => prev.filter((session) => session.id !== sessionId));
            setStarredChats((prev) => prev.filter((id) => id !== sessionId));
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
        if (!connectionStatus.node) {
            setInlineSendError("Backend not connected");
            return;
        }

        if (connectionStatus.node && !connectionStatus.ai) {
            setInlineSendError(connectionStatus.message || "AI service unavailable");
            const updatedWithErr = [...messages, withMessageId({
                role: "user",
                content: displayContent,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                requestMode: "default",
            }), withMessageId({
                role: "assistant",
                content: connectionStatus.message || "AI service unavailable",
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

            requestMode: "default",

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

            const assistantId = createMessageId();
            const assistantMsg = withMessageId({
                id: assistantId,
                role: "assistant",
                content: "",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                modelName: selectedModel.name,
                isStreaming: true,
                autoReadAloud: requestMode === "voice",
            });
            activeAssistantMessageIdRef.current = assistantId;
            setMessages([...pendingMessages, assistantMsg]);

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
                ...assistantMsg,
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
            requestMode,
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
        if (!connectionStatus.node) {
            setInlineSendError("Backend not connected");
            return;
        }
        if (connectionStatus.node && !connectionStatus.ai) {
            setInlineSendError(connectionStatus.message || "AI service unavailable");
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
                role: "assistant",
                content: response.answer,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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

        if (!connectionStatus.node) {
            setInlineSendError("Backend not connected");
            return;
        }
        if (connectionStatus.node && !connectionStatus.ai) {
            setInlineSendError(connectionStatus.message || "AI service unavailable");
            return;
        }

        setError(null);
        setFollowUpQuestions([]);
        setIsLoading(true);
        isLoadingRef.current = true;
        const controller = startLLMRequest();

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

            await handleVoiceMessage({
                transcription: response.transcript || displayTranscript || "(Voice message)",
                answer: response.answer || "",
                audioBase64: response.audio_base64,
                reference_links: response.reference_links,
            });

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
            await handleVoiceMessage({
                transcription: displayTranscript || "(Voice message)",
                answer: "",
                isError: true,
                error: errorMessage,
            });
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
        const shouldAutoRead = options.source === "voice" || originalMessage?.requestMode === "voice";
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
                role: "assistant",
                content: response.answer,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                modelName: selectedModel.name,
                referenceLinks: response.reference_links,
                audioBase64: response.audio_base64,
                autoReadAloud: shouldAutoRead,
                isStreaming: false,
            });
            activeAssistantMessageIdRef.current = assistantMsg.id;

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
    }, []);

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

    const isSessionActive = (session, source) => {
        if (currentSessionId !== session.id) {
            return false;
        }

        return resolveSessionSource(session, currentSessionSource) === source;
    };

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

            <AnimatePresence>

                {!isIncognito && isSidebarOpen && (

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

                            className="fixed inset-y-0 left-0 z-[60] flex w-80 flex-col border-r border-zinc-200 dark:border-white/5 bg-white dark:bg-zinc-950 backdrop-blur-xl lg:relative lg:flex h-full"

                        >

                            <div className="flex h-16 items-center justify-between border-b border-zinc-200 dark:border-white/5 px-4 bg-white/80 dark:bg-zinc-950/80 sticky top-0 z-10">

                                <Link

                                    to={dashboardPath}

                                    onClick={async (event) => {
                                        event.preventDefault();
                                        await navigateAfterSavingDraft(dashboardPath);
                                    }}

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

                                {/* Disappearing Messages Toggle */}
                                <div className="flex items-center justify-between px-3 py-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-white/5 shadow-sm">
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


                                <button

                                    onClick={handleNewChat}

                                    className="w-full flex items-center justify-start gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-900/50 rounded-lg px-4 py-2 font-medium transition-colors"

                                >

                                    <Plus className="h-4 w-4" />

                                    New Chat

                                </button>



                                <div className="space-y-2 pt-2">

                                    <div className="flex items-center justify-between px-2">
                                        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('chat.drafts')}</h3>
                                    </div>

                                    {draftSessions.length > 0 ? (
                                        draftSessions.map((session) => (
                                            <div
                                                key={session.id}
                                                className={cn(
                                                    "relative flex w-full items-start gap-3 rounded-lg px-2 py-2 text-sm transition-all group",
                                                    isSessionActive(session, CHAT_SESSION_SOURCE.DRAFTS)
                                                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium ring-1 ring-blue-200 dark:ring-blue-900/50"
                                                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5"
                                                )}
                                            >
                                                <button
                                                    onClick={() => handleSelectSession(session.id, CHAT_SESSION_SOURCE.DRAFTS)}
                                                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                                                >
                                                    <MessageSquare className={cn("mt-0.5 h-4 w-4 shrink-0", isSessionActive(session, CHAT_SESSION_SOURCE.DRAFTS) ? "text-blue-600 dark:text-blue-400" : "text-zinc-400")} />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate">{session.title || "Chat session"}</span>
                                                        <span className="mt-1 block text-[11px] font-medium text-zinc-400">
                                                            {t('chat.expiresAt')} {formatDraftExpiryTime(session.draftExpiresAt)}
                                                        </span>
                                                    </span>
                                                </button>

                                                <div className="relative shrink-0">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDraftMenuSessionId((prev) => prev === session.id ? null : session.id);
                                                        }}
                                                        className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                                                        title="Draft options"
                                                    >
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </button>

                                                    {draftMenuSessionId === session.id && (
                                                        <div
                                                            className="absolute right-0 top-8 z-20 min-w-36 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-zinc-900"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <button
                                                                onClick={(e) => handleDeleteDraft(session.id, e)}
                                                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                <span>{t('chat.deleteDraft')}</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="px-2 py-4 text-center rounded-lg border border-dashed border-zinc-200 dark:border-white/5">
                                            <p className="text-xs text-zinc-400">{t('chat.noDrafts')}</p>
                                        </div>
                                    )}

                                </div>



                                <div className="space-y-2 pt-2">

                                    <div className="flex items-center justify-between px-2">
                                        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('chat.today')}</h3>
                                        <button
                                            onClick={handleClearHistory}
                                            className="text-zinc-400 hover:text-red-500 transition-colors p-1 rounded"
                                            title="Clear all history"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>

                                    {todaySessions.length > 0 ? (
                                        todaySessions.map((session) => (
                                            <button
                                                key={session.id}
                                                onClick={() => handleSelectSession(session.id, CHAT_SESSION_SOURCE.TODAY)}
                                                className={cn(
                                                    "flex w-full items-center space-x-3 rounded-lg px-2 py-2 text-sm transition-all group",
                                                    isSessionActive(session, CHAT_SESSION_SOURCE.TODAY)
                                                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium ring-1 ring-blue-200 dark:ring-blue-900/50"
                                                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5"
                                                )}
                                            >
                                                <MessageSquare className={cn("h-4 w-4 shrink-0", isSessionActive(session, CHAT_SESSION_SOURCE.TODAY) ? "text-blue-600 dark:text-blue-400" : "text-zinc-400")} />
                                                <span className="truncate flex-1 text-left">{session.title || "Chat session"}</span>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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



                            <div className="mt-auto border-t border-zinc-200 dark:border-white/5 p-4 bg-zinc-50 dark:bg-zinc-950/50">

                                <Link

                                    to="/profile"

                                    onClick={async (event) => {
                                        event.preventDefault();
                                        await navigateAfterSavingDraft("/profile");
                                    }}

                                    className="flex w-full items-center gap-3 rounded-xl p-3 transition-all hover:bg-zinc-100 dark:hover:bg-white/5 group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/5"

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
                    isIncognito ? "bg-zinc-900 justify-between border-white/5" : "bg-white/50 dark:bg-zinc-950/50 border-transparent justify-between"
                )}>
                    {isIncognito ? (
                        <div className="flex items-center gap-2">
                            <IncognitoIcon className="h-5 w-5 text-zinc-300" />
                            <span className="text-sm font-semibold text-zinc-200 tracking-tight">Incognito chat</span>
                        </div>
                    ) : (
                        <div className="relative">
                            <button
                                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 transition-all text-zinc-700 dark:text-zinc-200 group"
                            >
                                <span className="text-lg font-bold tracking-tight">
                                    {selectedModel.name}
                                </span>
                                <ChevronDown className={cn("h-4 w-4 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-transform", isModelDropdownOpen && "rotate-180")} />
                            </button>

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

                                            {messages.map((msg, idx) => (

                                                <MessageBubble

                                                    key={getMessageDomId(msg, idx)}

                                                    message={msg}

                                                    onEdit={msg.role === "user" ? () => beginEditingMessage(idx) : undefined}

                                                    isEditing={false}

                                                    onRetry={msg.isError ? () => handleRetryMessage(msg) : undefined}

                                                    onStopAudio={msg.audioBase64 || msg.audio_base64 ? stopVoicePlayback : undefined}

                                                />

                                            ))}

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

                                        className="fixed bottom-6 left-6 z-50 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-500/40 transition-all active:scale-90 hover:scale-105"

                                    >

                                        <Plus className="h-6 w-6 sm:h-7 sm:w-7" />

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

                                        />

                                        {inlineSendError && (
                                            <p className="mt-2 text-center text-xs text-red-500 dark:text-red-300">
                                                {inlineSendError}
                                            </p>
                                        )}

                                        {/* Compact Language Dropdown */}
                                        <div className="mt-3 flex items-center gap-2 relative" style={{zIndex:50}}>
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

                                    </div>

                                </motion.div>

                            ) : (

                                <div className="flex-1 flex flex-col overflow-hidden">

                                    <div className="flex-1 overflow-y-auto p-4 sm:p-8">

                                        <div className="mx-auto w-[95%] sm:w-[85%] lg:w-[80%] max-w-none space-y-6">

                                            {messages.map((msg, idx) => (

                                                <MessageBubble

                                                    key={getMessageDomId(msg, idx)}

                                                    message={msg}

                                                    onEdit={msg.role === "user" ? () => beginEditingMessage(idx) : undefined}

                                                    isEditing={false}

                                                    onRetry={msg.isError ? () => handleRetryMessage(msg) : undefined}

                                                    onStopAudio={msg.audioBase64 || msg.audio_base64 ? stopVoicePlayback : undefined}

                                                />

                                            ))}



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

                                            />

                                            {inlineSendError && (
                                                <p className="mt-2 text-center text-xs text-red-500 dark:text-red-300">
                                                    {inlineSendError}
                                                </p>
                                            )}

                                            {/* Compact Language Dropdown */}
                                            <div className="mt-2 flex items-center gap-2 relative" style={{zIndex:50}}>
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
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <p className="mt-2 text-center text-[10px] text-zinc-400 dark:text-zinc-500">

                                                {t('chat.disclaimer') || "Content generated by AI may contain errors."}

                                            </p>

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
