import * as React from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useRoadmaps } from "../context/RoadmapContext";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { ChatInput } from "../components/ui/ChatInput";
import { MessageBubble } from "../components/ui/MessageBubble";
import { PageTransition } from "../components/ui/PageTransition";
import { VoiceOverlay } from "../components/ui/VoiceOverlay";
import {
    ArrowLeft,
    BookOpen,
    ChevronRight,
    FileText,
    MessageSquare,
    Share,
    Star,
    Map,
    CheckCircle
} from "lucide-react";
import { MdSearch } from "react-icons/md";

const MOCK_MESSAGES = [
    {
        role: "assistant",
        content: "Hello! I am Asvix, your academic assistant. How can I help you today?",
        timestamp: "10:00 AM",
    },
];

export function ChatPage() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const urlMode = searchParams.get("mode");

    const roadmapId = searchParams.get("roadmapId");
    const topicId = searchParams.get("topicId");

    // ⭐ Unique conversation ID
    const conversationId = roadmapId && topicId
        ? `${roadmapId}-${topicId}`
        : "general-chat";

    // ⭐ Starred conversations state
    const [starredConversations, setStarredConversations] = React.useState(() => {
        const saved = localStorage.getItem("starredChats");
        return saved ? JSON.parse(saved) : [];
    });

    const isStarred = starredConversations.includes(conversationId);

    const toggleStarConversation = () => {
        let updated;
        if (isStarred) {
            updated = starredConversations.filter(id => id !== conversationId);
        } else {
            updated = [...starredConversations, conversationId];
        }
        setStarredConversations(updated);
        localStorage.setItem("starredChats", JSON.stringify(updated));
    };

    // Roadmap context
    const { roadmaps, getProgressForRoadmap, updateTopicProgress } = useRoadmaps();
    const currentRoadmap = roadmapId ? roadmaps.find(r => r.id === roadmapId) : null;
    const currentTopic = currentRoadmap?.topics?.find(t => t.id === topicId);
    const progress = roadmapId ? getProgressForRoadmap(roadmapId) : null;
    const isTopicCompleted = progress?.completedTopicIds?.includes(topicId) || false;
    const [markingComplete, setMarkingComplete] = React.useState(false);

    const user = JSON.parse(localStorage.getItem("user") || "null");
    const isTeacher = user?.role === "teacher";
    const isGuest = !user;

    const [messages, setMessages] = React.useState(MOCK_MESSAGES);
    const [teacherView, setTeacherView] = React.useState(
        urlMode === "classroom-plan"
            ? "classroom_plan"
            : urlMode === "deep-dive"
                ? "deep_dive"
                : "overview"
    );

    const [isModeOpen, setIsModeOpen] = React.useState(false);
    const [showLimitModal, setShowLimitModal] = React.useState(false);
    const [isVoiceMode, setIsVoiceMode] = React.useState(false);

    const handleSend = (text) => {
        if (isGuest && messages.length >= 10) {
            setShowLimitModal(true);
            return;
        }

        const newMsg = {
            role: "user",
            content: text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        setMessages(prev => [...prev, newMsg]);

        setTimeout(() => {
            setMessages(prev => [...prev, {
                role: "assistant",
                content: isTeacher
                    ? "Here is a structured lesson plan with objectives and assessment strategy."
                    : "Here is the explanation breaking down the core concepts clearly.",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }]);
        }, 1000);
    };

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

    const handleMarkComplete = async () => {
        if (!roadmapId || !topicId) return;
        setMarkingComplete(true);
        try {
            await updateTopicProgress(roadmapId, topicId, !isTopicCompleted);
        } catch (err) {
            console.error(err);
        } finally {
            setMarkingComplete(false);
        }
    };

    const nextTopic = currentRoadmap?.topics?.[
        currentRoadmap.topics.findIndex(t => t.id === topicId) + 1
    ];

    return (
        <PageTransition className="relative flex h-screen w-full overflow-hidden bg-background-base text-foreground">

            {/* Sidebar */}
            <div className="hidden w-80 flex-col border-r border-border-base bg-background-base/50 backdrop-blur-xl lg:flex">

                <div className="flex h-16 items-center border-b px-6">
                    <Link
                        to={isGuest ? "/" : (isTeacher ? "/dashboard?mode=teacher" : "/dashboard")}
                        className="flex items-center space-x-2 text-foreground-muted hover:text-foreground"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        <span className="text-sm font-medium">
                            {isGuest ? t('nav.home') : t('chat.backToDashboard')}
                        </span>
                    </Link>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">

                    {/* ⭐ Starred Section */}
                    {starredConversations.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="px-2 text-xs font-semibold text-yellow-500 uppercase tracking-wider">
                                ⭐ Starred
                            </h3>

                            {starredConversations.map((id) => (
                                <button
                                    key={id}
                                    onClick={() => navigate(`/chat`)}
                                    className="flex w-full items-center space-x-3 rounded-lg px-2 py-2 text-sm hover:bg-accent/5"
                                >
                                    <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                                    <span className="truncate">{id}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Today Section */}
                    <div className="space-y-2">
                        <h3 className="px-2 text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                            {t('chat.today')}
                        </h3>
                        {[1, 2].map((i) => (
                            <button
                                key={i}
                                className="flex w-full items-center space-x-3 rounded-lg px-2 py-2 text-sm hover:bg-accent/5"
                            >
                                <MessageSquare className="h-4 w-4" />
                                <span className="truncate">Quantum Physics Basics</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Area */}
            <div className="flex flex-1 flex-col relative">

                {/* Top Bar */}
                {isTeacher && (
                    <div className="flex h-16 items-center justify-between border-b px-6 backdrop-blur-md">

                        <div className="flex items-center space-x-3">

                            {/* ⭐ Star Button */}
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={toggleStarConversation}
                                className="hover:text-yellow-400"
                            >
                                <Star
                                    className={cn(
                                        "h-5 w-5 transition-all",
                                        isStarred ? "fill-yellow-400 text-yellow-400" : ""
                                    )}
                                />
                            </Button>

                            <Button variant="ghost" size="sm">
                                <Share className="h-4 w-4 mr-2" />
                                {t('chat.share')}
                            </Button>

                            <Button size="sm" className="bg-accent text-white">
                                <FileText className="h-4 w-4 mr-2" />
                                {t('chat.savePlan')}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="mx-auto max-w-3xl space-y-6">
                        {messages.map((msg, idx) => (
                            <MessageBubble key={idx} message={msg} />
                        ))}
                        <div className="h-24" />
                    </div>
                </div>

                {/* Input */}
                <div className="fixed bottom-0 left-0 w-full bg-gradient-to-t from-background-base via-background-base/95 to-transparent pb-6 pt-10 lg:pl-80">
                    <div className="mx-auto max-w-3xl px-4">
                        <ChatInput
                            onSend={handleSend}
                            placeholder={t('chat.inputPlaceholder')}
                            onVoiceToggle={() => setIsVoiceMode(true)}
                        />
                    </div>
                </div>

                <VoiceOverlay
                    isOpen={isVoiceMode}
                    onClose={() => setIsVoiceMode(false)}
                />
            </div>
        </PageTransition>
    );
}