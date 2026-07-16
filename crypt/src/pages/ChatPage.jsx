import * as React from "react";
import ReactDOM from "react-dom";

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
import { DeepResearchLogo } from "../components/ui/DeepResearchLogo";
import GlobeChatIcon from "../components/icons/GlobeChatIcon";
import { Sidebar } from "../components/layout/Sidebar";
import {
    ArrowLeft, BookOpen, ChevronLeft, ChevronRight, FileText, Layout, Lightbulb,
    MessageSquare, MoreHorizontal, Settings, Share, CheckCircle, Map,
    Trash2, AlertCircle, Loader2, Wifi, WifiOff, Plus, User as UserIcon, X,
    CornerDownRight, Sparkles, Zap, ChevronDown, Star, Menu,
    MoreVertical, MessageSquareDashed, Check, Globe
} from "lucide-react";
import { MdSearch } from "react-icons/md";

import chatbotApi from "../lib/chatbotApi";
import api from "../lib/api";

const MODELS = [
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



const ConversationNavigator = ({ messages }) => {
    const [activeIndex, setActiveIndex] = React.useState(0);
    const [isHovered, setIsHovered] = React.useState(false);
    const [isMobilePanelOpen, setIsMobilePanelOpen] = React.useState(false);
    const [tooltipData, setTooltipData] = React.useState({ text: null, x: 0, y: 0 });

    // Extract user messages with original indices
    const userMessages = React.useMemo(() => {
        return messages
            .map((msg, idx) => ({ ...msg, originalIdx: idx }))
            .filter(msg => msg.role === 'user' && msg.content && msg.content.trim() !== '');
    }, [messages]);

    React.useEffect(() => {
        if (messages.length < 20) return;

        const observer = new IntersectionObserver(
            (entries) => {
                let maxRatio = 0;
                let activeId = null;
                entries.forEach((entry) => {
                    if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
                        maxRatio = entry.intersectionRatio;
                        activeId = entry.target.getAttribute('data-message-index');
                    }
                });

                if (activeId !== null) {
                    setActiveIndex(parseInt(activeId, 10));
                }
            },
            {
                root: null,
                rootMargin: "-20% 0px -60% 0px",
                threshold: [0, 0.25, 0.5, 0.75, 1.0],
            }
        );

        const elements = document.querySelectorAll('[data-message-index]');
        elements.forEach((el) => observer.observe(el));

        return () => observer.disconnect();
    }, [messages.length]);

    if (messages.length < 20 || userMessages.length === 0) return null;

    // Find the active user marker
    let activeUserMarkerIdx = 0;
    for (let i = userMessages.length - 1; i >= 0; i--) {
        if (userMessages[i].originalIdx <= activeIndex) {
            activeUserMarkerIdx = i;
            break;
        }
    }



    const handleMouseMove = (e, text) => {
        setTooltipData({ text, x: e.clientX, y: e.clientY });
    };

    const handleMouseLeaveTooltip = () => {
        setTooltipData({ text: null, x: 0, y: 0 });
    };

    const handleNavigate = (originalIdx) => {
        const el = document.getElementById(`chat-message-${originalIdx}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Temporary highlight effect
            el.style.transition = 'background-color 0.3s ease';
            el.classList.add('bg-zinc-100', 'dark:bg-white/5', 'rounded-2xl');

            setTimeout(() => {
                el.classList.remove('bg-zinc-100', 'dark:bg-white/5', 'rounded-2xl');
            }, 1500);
        }
        setIsHovered(false);
        setIsMobilePanelOpen(false);
        handleMouseLeaveTooltip();
    };

    return (
        <>
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed right-4 lg:right-6 top-1/2 -translate-y-1/2 z-50 hidden lg:flex items-center"
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => { setIsHovered(false); handleMouseLeaveTooltip(); }}
                >
                    {/* Custom Tooltip */}
                    {tooltipData.text && (
                        <div
                            className="fixed z-[100] bg-zinc-900 dark:bg-black text-white text-xs px-2.5 py-1.5 rounded-lg shadow-xl border border-black/10 dark:border-white/10 max-w-[280px] pointer-events-none backdrop-blur-sm"
                            style={{ left: tooltipData.x - 16, top: tooltipData.y + 16, transform: 'translateX(-100%)' }}
                        >
                            {tooltipData.text}
                        </div>
                    )}

                    {/* Preview Panel */}
                    <AnimatePresence>
                        {isHovered && (
                            <motion.div
                                initial={{ opacity: 0, x: 10, filter: 'blur(4px)' }}
                                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, x: 10, filter: 'blur(4px)' }}
                                transition={{ duration: 0.15 }}
                                className="absolute right-8 mr-4 w-[240px] rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-white/5 shadow-sm overflow-hidden"
                            >
                                {/* Top Fade Indicator */}
                                <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-white dark:from-zinc-900 to-transparent z-10 pointer-events-none" />

                                <div className="max-h-[350px] overflow-y-auto overflow-x-hidden p-1.5 overscroll-contain [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-black/10 dark:hover:[&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full transition-colors relative z-0">
                                    <div className="flex flex-col gap-0.5">
                                        {userMessages.map((msg, i) => (
                                            <button
                                                key={msg.originalIdx}
                                                onClick={() => handleNavigate(msg.originalIdx)}
                                                onMouseMove={(e) => handleMouseMove(e, msg.content)}
                                                onMouseLeave={handleMouseLeaveTooltip}
                                                className={cn(
                                                    "text-left px-3 h-8 flex items-center rounded-lg text-xs font-medium transition-all duration-150 ease-in-out hover:scale-[1.02] overflow-hidden shrink-0",
                                                    activeUserMarkerIdx === i
                                                        ? "bg-zinc-50 dark:bg-white/5 border border-zinc-200/50 dark:border-white/5 text-zinc-800 dark:text-zinc-200"
                                                        : "border border-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5 hover:text-zinc-700 dark:hover:text-zinc-200"
                                                )}
                                            >
                                                <span className="whitespace-nowrap overflow-hidden text-ellipsis block w-full">
                                                    {msg.content}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Bottom Fade Indicator */}
                                <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white dark:from-zinc-900 to-transparent z-10 pointer-events-none" />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Vertical Rail */}
                    <div className="flex flex-col gap-1.5 items-center py-4 px-2 w-8 cursor-pointer">
                        {userMessages.map((msg, i) => (
                            <button
                                key={msg.originalIdx}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleNavigate(msg.originalIdx);
                                }}
                                className={cn(
                                    "rounded-full transition-all duration-300 shrink-0",
                                    activeUserMarkerIdx === i
                                        ? "w-2 h-4 bg-zinc-600 dark:bg-zinc-400"
                                        : "w-1 h-2.5 bg-zinc-300 dark:bg-white/20 hover:bg-zinc-400 dark:hover:bg-white/40 hover:h-3.5"
                                )}
                                aria-label="Jump to question"
                            />
                        ))}
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Mobile UI */}
            <div className="lg:hidden">
                {!isMobilePanelOpen && (
                    <button
                        onClick={() => setIsMobilePanelOpen(true)}
                        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 min-w-[44px] min-h-[44px] flex items-center justify-center transition-opacity"
                        aria-label="Open chat navigator"
                    >
                        <ChevronLeft className="h-5 w-5 text-zinc-500 dark:text-zinc-400 drop-shadow-md" />
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
                                className="fixed left-1/2 top-1/2 z-50 w-[240px] max-h-[60vh] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-white/5 shadow-2xl rounded-xl overflow-hidden flex flex-col"
                            >
                                <div className="flex-1 overflow-y-auto overscroll-contain p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    <div className="flex flex-col gap-1">
                                        {userMessages.map((msg, i) => (
                                            <button
                                                key={msg.originalIdx}
                                                onClick={() => handleNavigate(msg.originalIdx)}
                                                className={cn(
                                                    "text-left px-4 min-h-[44px] flex items-center rounded-xl text-sm font-medium transition-colors overflow-hidden shrink-0",
                                                    activeUserMarkerIdx === i
                                                        ? "bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-zinc-100"
                                                        : "bg-transparent text-zinc-600 dark:text-zinc-400"
                                                )}
                                            >
                                                <span className="whitespace-nowrap overflow-hidden text-ellipsis block w-full">
                                                    {msg.content}
                                                </span>
                                            </button>
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



    const [messages, setMessages] = React.useState([INITIAL_MESSAGE]);

    const [sessions, setSessions] = React.useState([]);

    const [deepResearchChats, setDeepResearchChats] = React.useState(() => {
        try {
            return JSON.parse(localStorage.getItem("deep_research_chats") || "[]");
        } catch {
            return [];
        }
    });
    const [isDeepResearchOpen, setIsDeepResearchOpen] = React.useState(true);

    React.useEffect(() => {
        const handleStorageChange = () => {
            try {
                setDeepResearchChats(JSON.parse(localStorage.getItem("deep_research_chats") || "[]"));
            } catch { }
        };
        window.addEventListener("storage", handleStorageChange);
        window.addEventListener("focus", handleStorageChange);
        return () => {
            window.removeEventListener("storage", handleStorageChange);
            window.removeEventListener("focus", handleStorageChange);
        };
    }, []);

    const [currentSessionId, setCurrentSessionId] = React.useState(null);



    const [teacherView, setTeacherView] = React.useState(

        urlMode === "classroom-plan" ? "classroom_plan" :

            urlMode === "deep-dive" ? "deep_dive" :

                "overview"

    );

    const [isModeOpen, setIsModeOpen] = React.useState(false);



    const [showLimitModal, setShowLimitModal] = React.useState(false);

    const [isVoiceMode, setIsVoiceMode] = React.useState(false);



    const [isLoading, setIsLoading] = React.useState(false);

    const [error, setError] = React.useState(null);

    const [isConnected, setIsConnected] = React.useState(false);

    const [isCheckingConnection, setIsCheckingConnection] = React.useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(window.innerWidth >= 1024);
    const [isStarredOpen, setIsStarredOpen] = React.useState(true);

    // UI Polish & Sidebar states
    const [searchQuery, setSearchQuery] = React.useState("");
    const [activeMenuId, setActiveMenuId] = React.useState(null);
    const [renamingSessionId, setRenamingSessionId] = React.useState(null);
    const [renameValue, setRenameValue] = React.useState("");

    // Portal-based dropdown positioning for starred chats menu
    const starredMenuTriggerRefs = React.useRef({});
    const [starredMenuPos, setStarredMenuPos] = React.useState({ top: 0, left: 0, width: 0 });
    const starredMenuPortalRef = React.useRef(null);

    // Close starred menu on outside click
    React.useEffect(() => {
        if (!activeMenuId) return;
        const handleOutsideClick = (e) => {
            const portal = starredMenuPortalRef.current;
            const trigger = starredMenuTriggerRefs.current[activeMenuId];
            if (
                portal && !portal.contains(e.target) &&
                trigger && !trigger.contains(e.target)
            ) {
                setActiveMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [activeMenuId]);

    // Close starred menu when section collapses
    React.useEffect(() => {
        if (!isStarredOpen) setActiveMenuId(null);
    }, [isStarredOpen]);

    const [isIncognito, setIsIncognito] = React.useState(() => {
        try { return sessionStorage.getItem('isIncognito') === 'true'; } catch { return false; }
    });
    const [selectedModel, setSelectedModel] = React.useState(() => {
        const saved = localStorage.getItem("selectedModelId");
        return MODELS.find(m => m.id === saved) || MODELS[0];
    });
    const [isModelDropdownOpen, setIsModelDropdownOpen] = React.useState(false);
    const [selectedLanguage, setSelectedLanguage] = React.useState(null); // null = English (default)
    const [isTranslating, setIsTranslating] = React.useState(false);
    const [isLangDropdownOpen, setIsLangDropdownOpen] = React.useState(false);

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

    React.useEffect(() => {
        localStorage.setItem("selectedModelId", selectedModel.id);
    }, [selectedModel]);

    const messagesEndRef = React.useRef(null);
    const [followUpQuestions, setFollowUpQuestions] = React.useState([]);

    // ── Star & Disappearing Messages (Sagar's features) ──────────────
    const [starredChats, setStarredChats] = React.useState(() => {
        try { return JSON.parse(localStorage.getItem('starredChats') || '[]'); } catch { return []; }
    });
    const [isDisappearingMode, setIsDisappearingMode] = React.useState(() => {
        try { return localStorage.getItem('disappearingMode') === 'true'; } catch { return false; }
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

    // --- Mobile Footer Visibility State ---
    const [isMobileFooterExpanded, setIsMobileFooterExpanded] = React.useState(false);
    const [isTyping, setIsTyping] = React.useState(false);

    React.useEffect(() => {
        let typingTimeout;
        const handleFocusIn = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                setIsTyping(true);
                setIsMobileFooterExpanded(false); // Collapse immediately when focusing input
                clearTimeout(typingTimeout);
            }
        };
        const handleFocusOut = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                typingTimeout = setTimeout(() => {
                    setIsTyping(false);
                }, 1500);
            }
        };

        document.addEventListener('focusin', handleFocusIn);
        document.addEventListener('focusout', handleFocusOut);
        return () => {
            document.removeEventListener('focusin', handleFocusIn);
            document.removeEventListener('focusout', handleFocusOut);
            clearTimeout(typingTimeout);
        };
    }, []);

    React.useEffect(() => {
        localStorage.setItem('starredChats', JSON.stringify(starredChats));
    }, [starredChats]);

    React.useEffect(() => {
        localStorage.setItem('disappearingMode', String(isDisappearingMode));
    }, [isDisappearingMode]);

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



    const [greeting, setGreeting] = React.useState(() => {

        return GREETING_SENTENCES[Math.floor(Math.random() * GREETING_SENTENCES.length)];

    });



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
        const checkHealth = async () => {
            try {
                await chatbotApi.checkHealth();
                setIsConnected(true);
            } catch (err) {
                console.error("Backend not available:", err);
                setIsConnected(false);
            } finally {
                setIsCheckingConnection(false);
            }
        };

        const loadSessions = async () => {
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
                            } else {
                                const newParams = new URLSearchParams(searchParams);
                                newParams.delete("sessionId");
                                navigate({ search: newParams.toString() }, { replace: true });
                            }
                        }
                    } else {
                        const sessionId = searchParams.get("sessionId");
                        if (sessionId) {
                            const newParams = new URLSearchParams(searchParams);
                            newParams.delete("sessionId");
                            navigate({ search: newParams.toString() }, { replace: true });
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch sessions from DB:", err);
                }
            }
            setIsRestoringSession(false);
        };

        checkHealth();
        loadSessions();
    }, [isGuest]);



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

    }, [messages]);



    const handleDeleteSession = async (sessionId, e) => {
        if (e) e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this chat?")) return;
        try {
            if (!isGuest) {
                await api.delete(`/chat/sessions/${sessionId}`);
            }
            setSessions(prev => prev.filter(s => s.id !== sessionId));
            setStarredChats(prev => prev.filter(id => id !== sessionId));
            if (currentSessionId === sessionId) {
                setMessages([INITIAL_MESSAGE]);
                setCurrentSessionId(null);

                const newParams = new URLSearchParams(searchParams);
                newParams.delete("sessionId");
                navigate({ search: newParams.toString() }, { replace: true });
            }
            setError(null);
        } catch (err) {
            console.error("Failed to delete session:", err);
            setError("Failed to delete chat session");
        }
    };

    const handleRenameSubmit = async (sessionId) => {
        const trimmedTitle = renameValue.trim();
        const session = sessions.find(s => s.id === sessionId);

        setRenamingSessionId(null);
        setActiveMenuId(null);

        if (!trimmedTitle || trimmedTitle === session.title) return;

        // Optimistic UI update
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: trimmedTitle } : s));

        if (!isGuest && !isIncognito) {
            try {
                await api.post('/chat/sessions', {
                    sessionId: session.id,
                    messages: session.messages,
                    title: trimmedTitle
                });
            } catch (err) {
                console.error("Failed to rename session:", err);
                // Revert on failure
                setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: session.title } : s));
                setError("Failed to rename chat session");
            }
        }
    };

    const handleRenameKeyDown = (e, sessionId) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleRenameSubmit(sessionId);
        } else if (e.key === 'Escape') {
            setRenamingSessionId(null);
            setActiveMenuId(null);
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



        if (messages.length > 1) {

            const lastSession = {

                id: currentSessionId || `temp-${Date.now()}`,

                title: messages[1]?.content?.substring(0, 30) + "..." || "Chat session",

                messages: [...messages],

                timestamp: new Date().toISOString()

            };



            setSessions(prev => {

                const filtered = prev.filter(s => s.id !== lastSession.id);

                return [lastSession, ...filtered];

            });

        }



        setMessages([INITIAL_MESSAGE]);

        setCurrentSessionId(null);

        setError(null);

        setQuotedText(null);
        setFollowUpQuestions([]);


        if (searchParams.has("sessionId")) {

            const newParams = new URLSearchParams(searchParams);
            newParams.delete("sessionId");
            navigate({ search: newParams.toString() }, { replace: true });

        }



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

            const newParams = new URLSearchParams(searchParams);
            newParams.set("sessionId", session.id);
            navigate({ search: newParams.toString() }, { replace: true });

            await chatbotApi.clearHistory();

        }

    };



    const handleSend = async (text) => {

        if (isGuest && messages.length >= 10) {

            setShowLimitModal(true);

            return;

        }



        setError(null);
        setFollowUpQuestions([]);



        let displayContent = text;

        let apiPayload = text;



        if (quotedText) {

            displayContent = `> "${quotedText}"\n\n${text}`;

            apiPayload = `The user has highlighted the following specific text:\n"""\n${quotedText}\n"""\n\nUser's prompt: "${text}"\n\nINSTRUCTION: Please focus your response strictly on explaining, elaborating, or answering the user's prompt entirely within the context of the highlighted text. Do not provide a general overview of the broader topic.`;

            setQuotedText(null);

        }



        const userMsg = {

            role: "user",

            content: displayContent,

            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),

        };

        setMessages((prev) => [...prev, userMsg]);



        setIsLoading(true);

        try {

            const response = await chatbotApi.sendMessage(apiPayload, selectedModel.id);

            const assistantMsg = {
                role: "assistant",
                content: response.answer,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                modelName: selectedModel.name,
                referenceLinks: response.reference_links
            };

            // Extract follow-up questions from backend response
            const followUps = response?.follow_up_questions?.type_2_context_aware || response?.type_2_context_aware || response?.follow_ups || [];
            setFollowUpQuestions(followUps.slice(0, 3));



            const updatedMessages = [...messages, userMsg, assistantMsg];

            setMessages(updatedMessages);



            if (!isGuest && !isIncognito) {

                try {

                    let sessionTitle = currentSessionId
                        ? sessions.find(s => s.id === currentSessionId)?.title
                        : "New Chat";

                    if (!currentSessionId) {
                        const meaningless = ["hi", "hello", "ok", "thanks", "test", "hey"];
                        const cleanedText = text.trim();
                        if (!meaningless.includes(cleanedText.toLowerCase())) {
                            sessionTitle = cleanedText.length > 40 ? cleanedText.substring(0, 40) + "..." : cleanedText;
                        }
                    }



                    const res = await api.post('/chat/sessions', {

                        sessionId: currentSessionId,

                        messages: updatedMessages,

                        title: sessionTitle

                    });



                    if (res.data) {

                        setSessions(prev => {

                            const filtered = prev.filter(s => s.id !== res.data.id);

                            return [res.data, ...filtered];

                        });



                        if (!currentSessionId) {

                            setCurrentSessionId(res.data.id);

                            const newParams = new URLSearchParams(searchParams);
                            newParams.set("sessionId", res.data.id);
                            navigate({ search: newParams.toString() }, { replace: true });

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



    const handleVoiceMessage = async ({ transcription, answer, audioBase64, reference_links }) => {
        if (!transcription && !answer) return;

        const userMsg = {
            role: "user",
            content: transcription || "(Voice message)",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        const assistantMsg = {
            role: "assistant",
            content: answer,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            modelName: selectedModel.name,
            audioBase64: audioBase64
        };

        setMessages((prev) => [...prev, userMsg, assistantMsg]);

        if (!isGuest && !isIncognito) {
            try {
                const sessionTitle = currentSessionId
                    ? sessions.find(s => s.id === currentSessionId)?.title
                    : (transcription || "Voice Chat").substring(0, 30) + "...";

                const res = await api.post('/chat/sessions', {
                    sessionId: currentSessionId,
                    messages: [...messages, userMsg, assistantMsg],
                    title: sessionTitle
                });

                if (res.data) {
                    setSessions(prev => {
                        const filtered = prev.filter(s => s.id !== res.data.id);
                        return [res.data, ...filtered];
                    });
                    if (!currentSessionId) setCurrentSessionId(res.data.id);
                }
            } catch (dbErr) {
                console.error("Failed to save voice chat to DB:", dbErr);
            }
        }
    };

    // ── Text-to-Text (Multilingual) handler ──
    const handleTranslate = async (text) => {
        if (!text || !text.trim()) return;
        if (isGuest && messages.length >= 10) { setShowLimitModal(true); return; }
        setError(null);
        setFollowUpQuestions([]);
        const userMsg = {
            role: "user",
            content: text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);
        try {
            const response = await chatbotApi.textToText(text, selectedLanguage);
            const assistantMsg = {
                role: "assistant",
                content: response.answer,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                modelName: selectedModel.name,
            };
            const updatedMessages = [...messages, userMsg, assistantMsg];
            setMessages(updatedMessages);
            if (!isGuest && !isIncognito) {
                try {
                    const sessionTitle = currentSessionId
                        ? sessions.find(s => s.id === currentSessionId)?.title
                        : text.substring(0, 30) + "...";
                    const res = await api.post('/chat/sessions', { sessionId: currentSessionId, messages: updatedMessages, title: sessionTitle });
                    if (res.data) {
                        setSessions(prev => { const filtered = prev.filter(s => s.id !== res.data.id); return [res.data, ...filtered]; });
                        if (!currentSessionId) setCurrentSessionId(res.data.id);
                    }
                } catch (dbErr) { console.error("Failed to save translated chat to DB:", dbErr); }
            }
        } catch (err) {
            console.error("Text-to-Text API Error:", err);
            const errorMessage = err.response?.data?.detail || err.message || "Translation failed";
            setError(errorMessage);
            setMessages(prev => [...prev, { role: "assistant", content: `Sorry, translation failed: ${errorMessage}. Please try again.`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), isError: true }]);
        } finally {
            setIsLoading(false);
        }
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
            if (e.key === 'Escape' && window.innerWidth < 1024) {
                setIsSidebarOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const filteredSessions = React.useMemo(() => {
        if (!searchQuery.trim()) return sessions;
        const query = searchQuery.toLowerCase();
        return sessions.filter(session => {
            const matchesTitle = session.title?.toLowerCase().includes(query);
            const firstUserMsg = session.messages?.find(m => m.role === 'user')?.content?.toLowerCase() || "";
            return matchesTitle || firstUserMsg.includes(query);
        });
    }, [sessions, searchQuery]);

    return (

        <PageTransition className="relative flex h-screen w-full overflow-hidden bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">



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

                            className="flex items-center gap-2 rounded-xl bg-zinc-900 dark:bg-zinc-800 max-sm:px-4 max-sm:min-h-[44px] px-3 py-2 text-sm font-medium text-white shadow-xl border border-white/10 hover:bg-zinc-800 dark:hover:bg-zinc-700 transition-colors"

                        >

                            <QuoteIcon className="h-3 w-3" />

                            Ask DigiLab

                        </motion.button>

                    </div>

                )}

            </AnimatePresence>



            {/* Sidebar - Context / History */}
            <Sidebar
                mode="chat"
                isSidebarOpen={isSidebarOpen}
                setIsSidebarOpen={setIsSidebarOpen}
                user={user}
                isGuest={isGuest}
                isTeacher={isTeacher}
                sessions={sessions}
                starredChats={starredChats}
                deepResearchChats={deepResearchChats}
                currentSessionId={currentSessionId}
                onNewSession={handleNewChat}
                onSelectSession={handleSelectSession}
                onDeleteSession={handleDeleteSession}
                onToggleStar={toggleStar}
                onRenameSubmit={handleRenameSubmit}
                onClearHistory={handleClearHistory}
                isIncognito={isIncognito}
                isDisappearingMode={isDisappearingMode}
                setIsDisappearingMode={setIsDisappearingMode}
                t={t}
            />



            {/* Main Chat Area */}
            <div className="flex flex-1 flex-col relative">
                <ConversationNavigator messages={messages} />

                <div className={cn(
                    "grid grid-cols-[1fr_auto_1fr] h-[56px] sm:h-16 items-center px-3 sm:px-6 transition-all duration-300 z-50 sticky top-0 border-b",
                    isIncognito
                        ? ""
                        : "backdrop-blur-md bg-white/70 dark:bg-zinc-950/50 border-slate-200/60 dark:border-transparent"
                )}
                    style={isIncognito ? {
                        background: 'rgba(17,25,40,0.97)',
                        borderColor: 'rgba(255,255,255,0.06)',
                        backdropFilter: 'blur(12px)',
                    } : undefined}>

                    {/* LEFT column — Model Selector (and menu toggle) */}
                    <div className="flex items-center gap-2 min-w-0">
                        {!isSidebarOpen && (
                            <button
                                onClick={() => setIsSidebarOpen(true)}
                                aria-label="Open sidebar"
                                className={cn(
                                    "flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl transition-all lg:hidden",
                                    isIncognito
                                        ? "text-zinc-400 hover:text-white hover:bg-white/5"
                                        : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/5"
                                )}
                            >
                                <Menu className="h-5 w-5" />
                            </button>
                        )}

                        {isIncognito ? (
                            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                                <IncognitoIcon className="h-5 w-5 text-zinc-300 shrink-0" />
                                <span className="text-sm font-semibold text-zinc-200 tracking-tight truncate block">Incognito chat</span>
                            </div>
                        ) : (
                            <div className="relative min-w-0">
                                <button
                                    onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                                    className="flex items-center gap-1 sm:gap-2 px-1 sm:px-3 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 transition-all text-zinc-700 dark:text-zinc-200 group max-w-full"
                                >
                                    <span className="text-base sm:text-lg font-bold tracking-tight truncate block">
                                        {selectedModel.name}
                                    </span>
                                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-transform", isModelDropdownOpen && "rotate-180")} />
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
                                                className="max-sm:fixed max-sm:top-[60px] max-sm:left-3 max-sm:right-3 max-sm:w-auto sm:absolute sm:top-full sm:left-0 sm:mt-2 sm:w-72 p-2 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 shadow-2xl z-20 backdrop-blur-xl"
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
                                                                "w-full flex items-start gap-3 max-sm:p-4 sm:p-3 rounded-xl transition-all text-left",
                                                                selectedModel.id === model.id
                                                                    ? "bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20"
                                                                    : "hover:bg-zinc-50 dark:hover:bg-white/5 border border-transparent"
                                                            )}
                                                        >
                                                            <div className={cn("mt-0.5 shrink-0", model.color)}>
                                                                <model.icon className="max-sm:h-5 max-sm:w-5 sm:h-4 sm:w-4" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className={cn("max-sm:text-sm sm:text-xs font-bold leading-none mb-1 truncate", selectedModel.id === model.id ? "text-blue-600 dark:text-blue-400" : "text-zinc-800 dark:text-zinc-200")}>
                                                                    {model.name}
                                                                </p>
                                                                <p className="max-sm:text-xs sm:text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
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
                    </div>

                    {/* CENTER column — Mode Switch, always perfectly centered */}
                    {!isIncognito && (
                        <div className="flex items-center justify-center">
                            <div className="flex items-center bg-slate-100 dark:bg-zinc-800/60 p-1 rounded-xl border border-slate-200/60 dark:border-white/5 shadow-inner shrink-0">
                                <button
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-sm transition-all"
                                >
                                    <GlobeChatIcon className="h-3.5 w-3.5 shrink-0" />
                                    <span>Chat</span>
                                </button>
                                <Link
                                    to="/deep-research"
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
                                >
                                    <DeepResearchLogo className="h-3.5 w-3.5 shrink-0" />
                                    <span>Deep Research</span>
                                </Link>
                            </div>
                        </div>
                    )}

                    {/* RIGHT column — Incognito toggle */}
                    <div className="flex items-center justify-end gap-2">
                        {isIncognito ? (
                            <button
                                onClick={handleIncognitoToggle}
                                title="Turn off incognito"
                                className="flex h-[44px] w-[44px] shrink-0 items-center justify-center transition-all duration-200 rounded-full outline-none focus:outline-none text-zinc-400 hover:text-white hover:bg-white/5"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        ) : (
                            <button
                                onClick={handleIncognitoToggle}
                                title="Turn on incognito"
                                className="flex h-[44px] w-[44px] shrink-0 items-center justify-center transition-all duration-200 rounded-full outline-none focus:outline-none text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5"
                            >
                                <IncognitoIcon className="h-7 w-7" />
                            </button>
                        )}
                    </div>

                </div>



                <AnimatePresence mode="wait">

                    {isIncognito ? (

                        <motion.div

                            key="incognito-chat"

                            initial={{ opacity: 0 }}

                            animate={{ opacity: 1 }}

                            exit={{ opacity: 0 }}

                            className="flex flex-1 flex-col overflow-hidden relative"
                            style={{
                                background: "linear-gradient(145deg, #0d1520 0%, #111928 35%, #152032 65%, #0d1520 100%)",
                                color: "white"
                            }}

                        >
                            {/* Ambient glow effects */}
                            <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
                                <div style={{ position: 'absolute', top: '-10%', left: '20%', width: '40vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)', filter: 'blur(40px)' }} />
                                <div style={{ position: 'absolute', bottom: '10%', right: '10%', width: '30vw', height: '30vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)', filter: 'blur(50px)' }} />
                                <div style={{ position: 'absolute', top: '40%', left: '-5%', width: '20vw', height: '20vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 70%)', filter: 'blur(30px)' }} />
                            </div>

                            {messages.length <= 1 ? (

                                <motion.div

                                    initial={{ opacity: 0, y: 20 }}

                                    animate={{ opacity: 1, y: 0 }}

                                    className="flex-1 flex flex-col items-center justify-center px-6 relative" style={{ zIndex: 1 }}

                                >
                                    {/* Floating orbs */}
                                    <motion.div animate={{ y: [0, -12, 0], opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 4, repeat: Infinity }} style={{ position: 'absolute', top: '15%', left: '10%', width: 8, height: 8, borderRadius: '50%', background: 'rgba(99,102,241,0.5)' }} />
                                    <motion.div animate={{ y: [0, -8, 0], opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 5, repeat: Infinity, delay: 1 }} style={{ position: 'absolute', top: '25%', right: '15%', width: 5, height: 5, borderRadius: '50%', background: 'rgba(139,92,246,0.5)' }} />
                                    <motion.div animate={{ y: [0, -15, 0], opacity: [0.2, 0.6, 0.2] }} transition={{ duration: 6, repeat: Infinity, delay: 2 }} style={{ position: 'absolute', bottom: '30%', left: '20%', width: 6, height: 6, borderRadius: '50%', background: 'rgba(59,130,246,0.4)' }} />

                                    <motion.div
                                        whileHover={{ scale: 1.08, rotate: 3 }}
                                        whileTap={{ scale: 0.95 }}
                                        className="mb-8 p-5 rounded-3xl cursor-default"
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))',
                                            border: '1px solid rgba(99,102,241,0.2)',
                                            boxShadow: '0 8px 32px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.05)'
                                        }}
                                    >

                                        <IncognitoIcon className="h-16 w-16" style={{ filter: 'drop-shadow(0 0 12px rgba(99,102,241,0.4))' }} />

                                    </motion.div>

                                    <h2 className="text-3xl sm:text-4xl font-bold mb-2 tracking-tight" style={{ color: '#f1f5f9', letterSpacing: '-0.02em' }}>

                                        You're incognito

                                    </h2>
                                    <p className="text-sm mb-6" style={{ color: 'rgba(148,163,184,0.8)' }}>Private mode · No history saved</p>



                                    <div className="w-full max-w-4xl mb-8 relative">

                                        <QuotedTextPreview

                                            quotedText={quotedText}

                                            onClear={() => setQuotedText(null)}

                                        />

                                        <ChatInput

                                            onSend={selectedLanguage ? handleTranslate : handleSend}

                                            placeholder={isConnected ? (selectedLanguage ? `Ask in ${TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label}...` : "Ask anything...") : ""}

                                            disabled={isLoading || !isConnected}

                                            onVoiceToggle={() => setIsVoiceMode(true)}
                                            isIncognito={true}

                                        />

                                    </div>



                                    <div className="text-center max-w-md space-y-2 mt-2">
                                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                            <p className="text-xs font-medium" style={{ color: 'rgba(148,163,184,0.9)' }}>
                                                Chats aren't saved to history or used to train models.
                                            </p>
                                        </div>
                                    </div>

                                </motion.div>

                            ) : (

                                <div className="flex-1 flex flex-col overflow-hidden">

                                    <div
                                        className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-sm:px-3 max-sm:py-4 sm:p-8"
                                        onScroll={handleScroll}
                                        ref={scrollContainerRef}
                                    >
                                        <div className="mx-auto w-full max-w-[900px] max-sm:space-y-6 sm:space-y-8">

                                            {messages.map((msg, idx) => (

                                                <MessageBubble key={idx} message={msg} isIncognito={isIncognito} />

                                            ))}

                                            {/* Follow-up Question Chips */}
                                            <AnimatePresence>
                                                {followUpQuestions.length > 0 && !isLoading && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 15 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        transition={{ duration: 0.3, delay: 0.2 }}
                                                        className="flex max-sm:flex-col max-sm:items-stretch max-sm:gap-2 sm:flex-row sm:flex-wrap sm:gap-2 px-4 pt-2 pb-1 sm:max-h-none"
                                                    >
                                                        {followUpQuestions.map((q, i) => (
                                                            <motion.button
                                                                key={i}
                                                                initial={{ opacity: 0, scale: 0.9 }}
                                                                animate={{ opacity: 1, scale: 1 }}
                                                                transition={{ delay: 0.3 + i * 0.1 }}
                                                                onClick={() => {
                                                                    setFollowUpQuestions([]);
                                                                    handleSend(q);
                                                                }}
                                                                className="text-xs px-3 py-2 rounded-xl border border-accent/20 bg-accent/5 hover:bg-accent/15 text-accent hover:border-accent/40 transition-all duration-200 text-left leading-snug max-sm:max-w-full sm:max-w-[280px] cursor-pointer"
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



                                    <div className="w-full max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6 pt-4 z-40" style={{ background: 'linear-gradient(to top, #0f1923 60%, transparent)' }}>

                                        <div className="mx-auto max-w-4xl px-4 relative text-center">

                                            <QuotedTextPreview

                                                quotedText={quotedText}

                                                onClear={() => setQuotedText(null)}

                                            />

                                            <ChatInput

                                                onSend={selectedLanguage ? handleTranslate : handleSend}

                                                placeholder={isConnected ? (selectedLanguage ? `Ask in ${TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label}...` : "Ask anything...") : ""}

                                                disabled={isLoading || !isConnected}

                                                onVoiceToggle={() => setIsVoiceMode(true)}
                                                isIncognito={true}

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

                            {/* Floating Sidebar Toggle Button Removed */}



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

                                                    "flex-1 sm:flex-none gap-2 transition-all max-sm:min-h-[44px] h-8 sm:h-9 py-0 rounded-lg text-sm",

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



                            {isRestoringSession ? (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex-1 flex items-center justify-center"
                                >
                                    <Loader2 className="h-8 w-8 animate-spin text-zinc-300 dark:text-zinc-600" />
                                </motion.div>
                            ) : messages.length <= 1 ? (

                                <motion.div

                                    initial={{ opacity: 0, scale: 0.95 }}

                                    animate={{ opacity: 1, scale: 1 }}

                                    className="flex-1 flex flex-col items-center justify-center max-sm:px-3 sm:p-4 max-w-4xl mx-auto w-full"

                                >

                                    <div className="text-center max-sm:mb-6 sm:mb-10 flex flex-col items-center">



                                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3 text-zinc-900 dark:text-white">{greeting}</h1>

                                    </div>



                                    <div className="w-full relative px-4">

                                        <QuotedTextPreview

                                            quotedText={quotedText}

                                            onClear={() => setQuotedText(null)}

                                        />

                                        <ChatInput

                                            onSend={selectedLanguage ? handleTranslate : handleSend}

                                            placeholder={isConnected ? (selectedLanguage ? `Ask in ${TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label}...` : "Ask anything...") : ""}

                                            disabled={isLoading || !isConnected}

                                            onVoiceToggle={() => setIsVoiceMode(true)}

                                        />

                                        {/* Premium Language Dropdown (Welcome Screen) */}
                                        <div className="mt-3 flex items-center gap-2 relative" style={{ zIndex: 50 }}>
                                            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500 shrink-0">Respond in:</span>
                                            <div className="relative">
                                                <button
                                                    onClick={() => setIsLangDropdownOpen(o => !o)}
                                                    className={cn(
                                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 shadow-sm",
                                                        selectedLanguage
                                                            ? "bg-accent/10 border-accent/30 text-accent hover:bg-accent/15 hover:border-accent/50"
                                                            : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-300 hover:border-accent/40 hover:text-accent dark:hover:text-white"
                                                    )}
                                                >
                                                    <span className="text-sm leading-none">{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.flag}</span>
                                                    <span>{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label || 'English'}</span>
                                                    <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", isLangDropdownOpen && "rotate-180")} />
                                                </button>
                                                <AnimatePresence>
                                                    {isLangDropdownOpen && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 6, scale: 0.97 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: 6, scale: 0.97 }}
                                                            transition={{ duration: 0.15, ease: "easeOut" }}
                                                            className="absolute left-0 bottom-full mb-2 w-48 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/98 dark:bg-zinc-900 backdrop-blur-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_-8px_40px_rgba(0,0,0,0.6)] overflow-hidden z-50"
                                                        >
                                                            <div className="px-3 py-2.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                                                                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-zinc-500">Response Language</p>
                                                                {selectedLanguage && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setSelectedLanguage(null); setIsLangDropdownOpen(false); }}
                                                                        className="text-[10px] font-semibold text-accent hover:text-accent/80 transition-colors"
                                                                    >Reset</button>
                                                                )}
                                                            </div>
                                                            <div className="p-1.5 max-h-[300px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                                                {TRANSLATE_LANGUAGES.map(lang => (
                                                                    <button
                                                                        key={lang.code || 'en'}
                                                                        onClick={() => { setSelectedLanguage(lang.code); setIsLangDropdownOpen(false); }}
                                                                        className={cn(
                                                                            "flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150",
                                                                            selectedLanguage === lang.code
                                                                                ? "bg-accent text-white shadow-sm"
                                                                                : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/6 hover:text-accent dark:hover:text-white"
                                                                        )}
                                                                    >
                                                                        <span className="text-base leading-none w-5 text-center shrink-0">{lang.flag}</span>
                                                                        <span className="flex-1 text-left">{lang.label}</span>
                                                                        {selectedLanguage === lang.code && <Check className="h-3 w-3 shrink-0 opacity-90" />}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                    </div>

                                </motion.div>

                            ) : (

                                <div className="flex-1 flex flex-col overflow-hidden">

                                    <div
                                        className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-sm:px-3 max-sm:py-4 sm:p-8"
                                        onScroll={handleScroll}
                                        ref={setScrollRef}
                                    >

                                        <div className="mx-auto w-full max-w-[900px] max-sm:space-y-6 sm:space-y-8">

                                            {messages.map((msg, idx) => (
                                                <div key={idx} id={`chat-message-${idx}`} data-message-index={idx}>
                                                    <MessageBubble message={msg} isIncognito={isIncognito} />
                                                </div>
                                            ))}



                                            {isLoading && (

                                                <motion.div

                                                    initial={{ opacity: 0, y: 10 }}

                                                    animate={{ opacity: 1, y: 0 }}

                                                    className="flex items-center gap-3 max-sm:p-2 sm:p-4"

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

                                            {/* Follow-up Question Chips */}
                                            <AnimatePresence>
                                                {followUpQuestions.length > 0 && !isLoading && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 15 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        transition={{ duration: 0.3, delay: 0.2 }}
                                                        className="flex max-sm:flex-col max-sm:items-stretch max-sm:gap-2 sm:flex-row sm:flex-wrap sm:gap-2 px-4 pt-2 pb-1 sm:max-h-none"
                                                    >
                                                        {followUpQuestions.map((q, i) => (
                                                            <motion.button
                                                                key={i}
                                                                initial={{ opacity: 0, scale: 0.9 }}
                                                                animate={{ opacity: 1, scale: 1 }}
                                                                transition={{ delay: 0.3 + i * 0.1 }}
                                                                onClick={() => {
                                                                    setFollowUpQuestions([]);
                                                                    handleSend(q);
                                                                }}
                                                                className="text-xs px-3 py-2 rounded-xl border border-accent/20 bg-accent/5 hover:bg-accent/15 text-accent hover:border-accent/40 transition-all duration-200 text-left leading-snug max-sm:max-w-full sm:max-w-[280px] cursor-pointer"
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



                                    <div className="w-full bg-gradient-to-t from-white dark:from-zinc-950 to-transparent max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6 pt-4 z-40">

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
                                                onSend={selectedLanguage ? handleTranslate : handleSend}
                                                placeholder={isConnected ? (selectedLanguage ? `Ask in ${TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label || 'selected language'}...` : "Ask anything...") : ""}
                                                disabled={isLoading || !isConnected}
                                                onVoiceToggle={() => setIsVoiceMode(true)}
                                            />

                                            {/* DESKTOP/TABLET: Premium Language Selector */}
                                            <div className="mt-2 flex items-center gap-2 relative max-sm:hidden" style={{ zIndex: 50 }}>
                                                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500 shrink-0">Respond in:</span>
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setIsLangDropdownOpen(o => !o)}
                                                        className={cn(
                                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 shadow-sm",
                                                            selectedLanguage
                                                                ? "bg-accent/10 border-accent/30 text-accent hover:bg-accent/15 hover:border-accent/50"
                                                                : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-300 hover:border-accent/40 hover:text-accent dark:hover:text-white"
                                                        )}
                                                    >
                                                        <span className="text-sm leading-none">{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.flag}</span>
                                                        <span>{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label || 'English'}</span>
                                                        <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", isLangDropdownOpen && "rotate-180")} />
                                                    </button>
                                                    <AnimatePresence>
                                                        {isLangDropdownOpen && (
                                                            <motion.div
                                                                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                                                                transition={{ duration: 0.15, ease: "easeOut" }}
                                                                className="absolute left-0 bottom-full mb-2 w-48 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/98 dark:bg-zinc-900 backdrop-blur-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_-8px_40px_rgba(0,0,0,0.6)] overflow-hidden z-50"
                                                            >
                                                                <div className="px-3 py-2.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                                                                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-zinc-500">Response Language</p>
                                                                    {selectedLanguage && (
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); setSelectedLanguage(null); setIsLangDropdownOpen(false); }}
                                                                            className="text-[10px] font-semibold text-accent hover:text-accent/80 transition-colors"
                                                                        >Reset</button>
                                                                    )}
                                                                </div>
                                                                <div className="p-1.5 max-h-[300px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                                                    {TRANSLATE_LANGUAGES.map(lang => (
                                                                        <button
                                                                            key={lang.code || 'en'}
                                                                            onClick={() => { setSelectedLanguage(lang.code); setIsLangDropdownOpen(false); }}
                                                                            className={cn(
                                                                                "flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150",
                                                                                selectedLanguage === lang.code
                                                                                    ? "bg-accent text-white shadow-sm"
                                                                                    : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/6 hover:text-accent dark:hover:text-white"
                                                                            )}
                                                                        >
                                                                            <span className="text-base leading-none w-5 text-center shrink-0">{lang.flag}</span>
                                                                            <span className="flex-1 text-left">{lang.label}</span>
                                                                            {selectedLanguage === lang.code && <Check className="h-3 w-3 shrink-0 opacity-90" />}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>

                                            <p className="mt-2 text-center text-[10px] text-zinc-400 dark:text-zinc-500 max-sm:hidden">
                                                {t('chat.disclaimer') || "Content generated by AI may contain errors."}
                                            </p>

                                            {/* MOBILE: Collapsible Footer Panel */}
                                            <div className="sm:hidden w-full flex flex-col items-center mt-3 relative">
                                                <div
                                                    onClick={() => setIsMobileFooterExpanded(e => !e)}
                                                    className="w-10 h-1.5 rounded-full bg-zinc-300 dark:bg-white/20 cursor-pointer transition-all hover:bg-zinc-400 dark:hover:bg-white/30"
                                                />
                                                <AnimatePresence>
                                                    {isMobileFooterExpanded && !isTyping && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: -15, height: 0 }}
                                                            animate={{ opacity: 1, y: 0, height: "auto" }}
                                                            exit={{ opacity: 0, y: -15, height: 0 }}
                                                            transition={{ duration: 0.25, ease: "easeOut" }}
                                                            className="flex flex-col items-center justify-center overflow-visible pt-4 w-full"
                                                        >
                                                            <div className="relative" style={{ zIndex: 60 }}>
                                                                <button
                                                                    onClick={() => setIsLangDropdownOpen(o => !o)}
                                                                    className="flex items-center justify-center gap-1.5 px-4 py-1.5 min-h-[36px] rounded-full text-[13px] font-medium border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-white/5 text-slate-700 dark:text-zinc-300 hover:border-accent/40 hover:text-accent dark:hover:border-accent/50 dark:hover:text-white transition-all shadow-sm backdrop-blur-md"
                                                                >
                                                                    <span className="text-[14px]">{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.flag}</span>
                                                                    <span>{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label || 'English'}</span>
                                                                    <ChevronDown className={cn("h-3.5 w-3.5 opacity-60 transition-transform", isLangDropdownOpen && "rotate-180")} />
                                                                </button>
                                                                <AnimatePresence>
                                                                    {isLangDropdownOpen && (
                                                                        <motion.div
                                                                            initial={{ opacity: 0, y: 10, scale: 0.95, x: "-50%" }}
                                                                            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
                                                                            exit={{ opacity: 0, y: 10, scale: 0.95, x: "-50%" }}
                                                                            transition={{ duration: 0.15 }}
                                                                            style={{ transformOrigin: 'bottom center' }}
                                                                            className="absolute left-1/2 bottom-full mb-3 w-[280px] rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-2 z-[100]"
                                                                        >
                                                                            <div className="max-h-[300px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                                                                {TRANSLATE_LANGUAGES.map(lang => (
                                                                                    <button
                                                                                        key={lang.code || 'en'}
                                                                                        onClick={() => { setSelectedLanguage(lang.code); setIsLangDropdownOpen(false); }}
                                                                                        className={cn(
                                                                                            "flex items-center gap-4 w-full px-4 py-3.5 rounded-xl text-[14px] font-medium transition-all",
                                                                                            selectedLanguage === lang.code
                                                                                                ? "bg-accent text-white shadow-md"
                                                                                                : "text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-accent dark:hover:text-white active:bg-slate-100 dark:active:bg-white/10"
                                                                                        )}
                                                                                    >
                                                                                        <span className="text-xl">{lang.flag}</span>
                                                                                        <span>{lang.label}</span>
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </div>
                                                            <p className="mt-3 mb-1 text-center text-[11px] text-zinc-400/80 dark:text-zinc-500 max-w-[280px] leading-relaxed tracking-wide">
                                                                {t('chat.disclaimer') || "DigiLab Learning Assistant can make mistakes. Verify important information."}
                                                            </p>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

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



                <VoiceOverlay

                    isOpen={isVoiceMode}

                    onClose={() => setIsVoiceMode(false)}

                    onVoiceMessage={handleVoiceMessage}

                    isIncognito={isIncognito}

                />

            </div>

            {/* Starred Chats Context Menu Portal — renders at document.body to escape overflow:hidden ancestors */}
            {ReactDOM.createPortal(
                <AnimatePresence>
                    {activeMenuId && sessions.some(s => s.id === activeMenuId && starredChats.includes(s.id)) && (() => {
                        const session = sessions.find(s => s.id === activeMenuId);
                        if (!session) return null;
                        return (
                            <motion.div
                                ref={starredMenuPortalRef}
                                key={`starred-portal-menu-${activeMenuId}`}
                                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                transition={{ duration: 0.15 }}
                                style={{
                                    position: 'fixed',
                                    top: starredMenuPos.top,
                                    left: Math.max(8, starredMenuPos.left),
                                    width: '144px',
                                    zIndex: 9999,
                                }}
                                className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden"
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
                                        <span>Unstar Chat</span>
                                        <Star className="h-3.5 w-3.5 text-yellow-500" />
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
                                            handleDeleteSession(session.id, e);
                                            setActiveMenuId(null);
                                        }}
                                        className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    >
                                        <span>Delete</span>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </motion.div>
                        );
                    })()}
                </AnimatePresence>,
                document.body
            )}

        </PageTransition>

    );

}