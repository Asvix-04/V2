import * as React from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../components/ui/Button";
import { ChatInput } from "../components/ui/ChatInput";
import { MessageBubble } from "../components/ui/MessageBubble";
import { PageTransition } from "../components/ui/PageTransition";
import { VoiceOverlay } from "../components/ui/VoiceOverlay";
import { ArrowLeft, BookOpen, ChevronRight, FileText, Layout, Lightbulb, MessageSquare, MoreHorizontal, Settings, Share } from "lucide-react";
import { MdSearch } from "react-icons/md";

import {
    ArrowLeft,
    MessageSquare,
    Plus,
    X,
    User,
    Search,
    MessageSquarePlus,
} from "lucide-react";

/* =========================
   INITIAL DATA
========================= */
const INITIAL_MESSAGES = [
    {
        role: "assistant",
        content:
            "Hello! I am Asvix, your academic assistant. How can I help you today?",
        timestamp: "Now",
    },
];

const MOCK_HISTORY = [
    { id: 1, title: "Quantum Physics Basics" },
    { id: 2, title: "Calculus Derivatives" },
    { id: 3, title: "Organic Chemistry" },
];

export function ChatPage() {
    const { t } = useLanguage();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const user = JSON.parse(localStorage.getItem("user") || "null");
    const isGuest = !user;

    const [messages, setMessages] = React.useState(INITIAL_MESSAGES);
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [isSearchActive, setIsSearchActive] = React.useState(false);

    const [showLimitModal, setShowLimitModal] = React.useState(false);
    const [isVoiceMode, setIsVoiceMode] = React.useState(false);

    const handleSend = (text) => {
        // GUEST LIMIT CHECK
        if (isGuest && messages.length >= 20) {
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
                content: "Here is the explanation for your question.",
                timestamp: "Now",
            },
        ]);
    };

    /* ================= NEW CHAT ================= */
    const handleNewChat = () => {
        setMessages(INITIAL_MESSAGES);
        setSearchQuery("");
        setIsSearchActive(false);
        setIsSidebarOpen(false);
    };

    const filteredHistory = MOCK_HISTORY.filter((item) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    /* ================= SIDEBAR ================= */
    const SidebarContent = () => (
        <div className="flex h-full flex-col">
            <div className="flex h-16 items-center justify-between border-b px-6">
                <Link
                    to="/dashboard"
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Dashboard
                </Link>
                <button onClick={() => setIsSidebarOpen(false)}>
                    <X className="h-5 w-5 text-muted-foreground" />
                </button>
            </div>

            <div className="px-4 py-4 space-y-2">
                <button
                    onClick={handleNewChat}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent/10"
                >
                    <MessageSquarePlus className="h-4 w-4" />
                    New Chat
                </button>

                <button
                    onClick={() => setIsSearchActive(!isSearchActive)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent/10"
                >
                    <Search className="h-4 w-4" />
                    Search Chat
                </button>

                {isSearchActive && (
                    <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search history..."
                        className="mt-2 w-full rounded-md border px-3 py-1.5 text-xs"
                    />
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    Chat History
                </h3>
                <div className="space-y-1">
                    {filteredHistory.map((item) => (
                        <button
                            key={item.id}
                            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent/10"
                        >
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            <span className="truncate">{item.title}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div
                onClick={() => navigate("/profile")}
                className="border-t px-4 py-4 flex items-center gap-3 cursor-pointer hover:bg-accent/10"
            >
                <div className="h-9 w-9 rounded-full bg-accent/20 flex items-center justify-center">
                    <User className="h-4 w-4" />
                </div>
                <div>
                    <p className="text-sm font-medium">{user?.name || "Guest User"}</p>
                    <p className="text-xs text-muted-foreground">
                        {user?.role || "Visitor"}
                    </p>
                </div>
            </div>
        </div>
    );

    /* ================= MAIN ================= */
    return (
        <PageTransition className="relative flex h-screen bg-background-base">
            <AnimatePresence>
                {isSidebarOpen && (
                    <>
                        <motion.div
                            initial={{ x: "-100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "-100%" }}
                            className="fixed left-0 top-0 z-50 h-full w-80 bg-background-base border-r"
                        >
                            <SidebarContent />
                        </motion.div>
                        <div
                            onClick={() => setIsSidebarOpen(false)}
                            className="fixed inset-0 bg-black/40 z-40"
                        />
                    </>
                )}
            </AnimatePresence>

            {/* CHAT AREA */}
            <div className="flex flex-1 flex-col">
                <div className="flex-1 overflow-y-auto px-6 py-6">
                    <div className="mx-auto max-w-6xl space-y-3">
                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"
                                    }`}
                            >
                                {/* 🔥 COMPACT CHATGPT SIZE */}
                                <div className="max-w-[48%] text-sm leading-relaxed">
                                    <MessageBubble message={msg} />
                                </div>
                            </div>
                        ))}
                    </div>
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

            {!isSidebarOpen && (
                <Button
                    size="icon"
                    onClick={() => setIsSidebarOpen(true)}
                    className="fixed bottom-24 left-6 h-11 w-11 rounded-full"
                >
                    <Plus className="h-5 w-5" />
                </Button>
            )}
        </PageTransition>
    );
}