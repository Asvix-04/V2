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
import { ArrowLeft, BookOpen, ChevronRight, FileText, Layout, Lightbulb, MessageSquare, MoreHorizontal, Settings, Share } from "lucide-react";
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
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const isTeacher = user?.role === "teacher";
    const isGuest = !user;

    const [messages, setMessages] = React.useState(MOCK_MESSAGES);
    // Initialize view based on URL param or default
    const [teacherView, setTeacherView] = React.useState(
        urlMode === "classroom-plan" ? "classroom_plan" :
            urlMode === "deep-dive" ? "deep_dive" :
                "overview"
    );
    const [isModeOpen, setIsModeOpen] = React.useState(false);

    const [showLimitModal, setShowLimitModal] = React.useState(false);
    const [isVoiceMode, setIsVoiceMode] = React.useState(false);

    const handleSend = (text) => {
        // GUEST LIMIT CHECK
        if (isGuest && messages.length >= 10) {
            setShowLimitModal(true);
            return;
        }

        const newMsg = {
            role: "user",
            content: text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, newMsg]);

        // Simulate AI response
        setTimeout(() => {
            setMessages((prev) => [...prev, {
                role: "assistant",
                content: isTeacher
                    ? "I have analyzed the topic. Here is a suggested lesson plan structure including prerequisites and assessment strategies."
                    : "Here is the explanation for your question, essentially breaking down the core concepts.",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }]);
        }, 1000);
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

    return (
        <PageTransition className="relative flex h-screen w-full overflow-hidden bg-background-base text-foreground">
            {/* Sidebar - Context / History */}
            <div className="hidden w-80 flex-col border-r border-border-base dark:border-white/5 bg-background-base/50 backdrop-blur-xl lg:flex">
                <div className="flex h-16 items-center border-b border-border-base dark:border-white/5 px-6">
                    <Link
                        to={isGuest ? "/" : (isTeacher ? "/dashboard?mode=teacher" : "/dashboard")}
                        className="flex items-center space-x-2 text-foreground-muted hover:text-foreground"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        <span className="text-sm font-medium">{isGuest ? t('nav.home') : t('chat.backToDashboard')}</span>
                    </Link>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="space-y-2">
                        <h3 className="px-2 text-xs font-semibold text-foreground-muted uppercase tracking-wider">{t('chat.today')}</h3>
                        {[1, 2].map((i) => (
                            <button key={i} className="flex w-full items-center space-x-3 rounded-lg px-2 py-2 text-sm text-foreground hover:bg-accent/5 dark:hover:bg-white/5">
                                <MessageSquare className="h-4 w-4" />
                                <span className="truncate">Quantum Physics Basics</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex flex-1 flex-col relative">
                {/* Search, Theme & Actions Top Bar */}
                {isTeacher && (
                    <div className="flex h-16 items-center justify-between border-b border-border-base dark:border-white/5 bg-background-base/50 px-6 backdrop-blur-md">
                        <div className="flex items-center flex-1">
                            <div className="relative w-64 max-w-xs">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                    <MdSearch className="h-5 w-5 text-foreground-muted" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search past conversations..."
                                    className="block w-full rounded-full border-0 bg-white/50 dark:bg-white/5 py-2 pl-10 pr-4 text-sm text-foreground placeholder-foreground-subtle ring-1 ring-inset ring-gray-300 dark:ring-white/10 focus:ring-2 focus:ring-accent sm:text-sm sm:leading-6 backdrop-blur-sm transition-all focus:bg-white dark:focus:bg-white/10"
                                />
                            </div>

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={toggleTheme}
                                className="ml-2 text-foreground-muted hover:text-foreground rounded-full hover:bg-white/10 shrink-0"
                            >
                                <svg className="hidden h-5 w-5 dark:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                <svg className="block h-5 w-5 dark:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                </svg>
                            </Button>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Button variant="ghost" size="sm" className="text-foreground-muted hover:text-foreground">
                                <Share className="h-4 w-4 mr-2" /> {t('chat.share')}
                            </Button>
                            <Button size="sm" className="bg-accent text-white hover:bg-accent-bright">
                                <FileText className="h-4 w-4 mr-2" /> {t('chat.savePlan')}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Roadmap Topic Header - Shows when learning from a roadmap */}
                {currentTopic && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border-b border-border-base dark:border-white/5 bg-gradient-to-r from-accent/5 via-accent/10 to-accent/5 px-6 py-4"
                    >
                        <div className="max-w-3xl mx-auto flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Link
                                    to="/roadmaps"
                                    className="flex items-center gap-2 text-sm text-foreground-muted hover:text-accent transition-colors"
                                >
                                    <Map className="h-4 w-4" />
                                    <span className="hidden sm:inline">{currentRoadmap?.title}</span>
                                </Link>
                                <ChevronRight className="h-4 w-4 text-foreground-muted" />
                                <div className="flex items-center gap-2">
                                    <BookOpen className="h-4 w-4 text-accent" />
                                    <span className="font-semibold text-foreground">{currentTopic.title}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button
                                    size="sm"
                                    onClick={handleMarkComplete}
                                    disabled={markingComplete}
                                    className={cn(
                                        "gap-2 transition-all",
                                        isTopicCompleted
                                            ? "bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20"
                                            : "bg-accent text-white hover:bg-accent-bright"
                                    )}
                                >
                                    <CheckCircle className={cn("h-4 w-4", isTopicCompleted && "fill-current")} />
                                    {markingComplete ? "Saving..." : isTopicCompleted ? "Completed" : "Mark Complete"}
                                </Button>
                                {nextTopic && isTopicCompleted && (
                                    <Link to={`/chat?roadmapId=${roadmapId}&topicId=${nextTopic.id}`}>
                                        <Button size="sm" variant="outline" className="gap-2 border-accent/30 text-accent hover:bg-accent/10">
                                            Next: {nextTopic.title}
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </Link>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                    <div className="mx-auto max-w-3xl space-y-6">
                        {messages.map((msg, idx) => (
                            <MessageBubble
                                key={idx}
                                message={msg}
                            />
                        ))}
                        <div className="h-24"></div> {/* Spacer for bottom input */}
                    </div>

                    {/* Input Area */}
                    <div className="fixed bottom-0 left-0 w-full bg-gradient-to-t from-background-base via-background-base/95 to-transparent pb-6 pt-10 lg:pl-80">
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
                                placeholder={t('chat.inputPlaceholder')}
                                disabled={false}
                                onVoiceToggle={() => setIsVoiceMode(true)}
                            />
                            <p className="mt-2 text-center text-[10px] text-foreground-subtle">
                                {t('chat.disclaimer')}
                            </p>
                        </div>
                    </div>
                </div>

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


