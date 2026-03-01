import { cn } from "../../lib/utils";
import { MdPerson, MdSmartToy, MdVolumeUp, MdContentCopy, MdCheck } from "react-icons/md";
import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { Eye, Edit2, X, ChevronDown } from "lucide-react";

// Parse **bold** markdown into JSX
function formatMessage(text) {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        }
        return part;
    });
}

export function MessageBubble({ message, isLast, onEdit }) {
    const isUser = message.role === "user";
    const [copied, setCopied] = useState(false);
    const [remainingTime, setRemainingTime] = useState(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [editedContent, setEditedContent] = useState(message.content);

    // Calculate remaining time for disappearing messages
    useEffect(() => {
        if (!message.disappearTime) return;

        const updateTimer = () => {
            const now = Date.now();
            const remaining = message.disappearTime - now;

            if (remaining <= 0) {
                setRemainingTime(null);
            } else if (remaining < 60 * 60 * 1000) {
                // Less than 1 hour
                const minutes = Math.floor(remaining / (60 * 1000));
                setRemainingTime(`${minutes}m`);
            } else {
                // More than 1 hour
                const hours = Math.floor(remaining / (60 * 60 * 1000));
                setRemainingTime(`${hours}h`);
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 60000); // Update every minute

        return () => clearInterval(interval);
    }, [message.disappearTime]);

    // Detect overflow for assistant (bot) messages to show collapse/expand affordance
    const contentRef = useRef(null);
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [isOverflowing, setIsOverflowing] = useState(false);

    useEffect(() => {
        if (!contentRef.current) return;
        const el = contentRef.current;
        const check = () => setIsOverflowing(el.scrollHeight > el.clientHeight + 4);
        requestAnimationFrame(check);
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [message.content]);

    const handleSpeak = () => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(message.content);
            window.speechSynthesis.speak(utterance);
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(message.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            // fallback
        }
    };

    const handleEditClick = () => {
        setIsEditMode(true);
    };

    const handleEditCancel = () => {
        setIsEditMode(false);
        setEditedContent(message.content);
    };

    const handleEditSave = () => {
        if (editedContent.trim() && onEdit) {
            onEdit(editedContent.trim());
            setIsEditMode(false);
        }
    };

    // User message: right-aligned with bubble
    if (isUser) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex w-full justify-end space-x-3 px-4"
            >
                {isEditMode && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="bg-white dark:bg-[#1a1a1f] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 w-full max-w-2xl flex flex-col mx-4">
                            {/* Modal Header */}
                            <div className="flex items-center justify-between p-6 border-b border-black/10 dark:border-white/10">
                                <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                                    <Edit2 className="h-5 w-5 text-accent" />
                                    Edit message
                                </h2>
                                <button
                                    onClick={handleEditCancel}
                                    className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <X className="h-5 w-5 text-foreground-muted" />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="p-6">
                                <textarea
                                    autoFocus
                                    value={editedContent}
                                    onChange={(e) => setEditedContent(e.target.value)}
                                    className="w-full min-h-[150px] bg-gray-50 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-base text-foreground focus:ring-2 focus:ring-accent focus:border-transparent outline-none resize-none placeholder:text-foreground-muted"
                                    placeholder="Edit your message..."
                                />
                            </div>

                            {/* Modal Footer */}
                            <div className="flex items-center justify-end gap-3 p-6 border-t border-black/10 dark:border-white/10 bg-gray-50/50 dark:bg-white/5">
                                <button
                                    onClick={handleEditCancel}
                                    className="px-4 py-2 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-foreground font-medium flex items-center gap-2"
                                >
                                    <X className="h-4 w-4" />
                                    Cancel
                                </button>
                                <button
                                    onClick={handleEditSave}
                                    disabled={!editedContent.trim() || editedContent === message.content}
                                    className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-bright text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                >
                                    <Edit2 className="h-4 w-4" />
                                    Save & Send
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="max-w-[70%] group">
                    <div className="rounded-2xl rounded-tr-sm bg-accent text-white px-5 py-3.5 text-sm leading-relaxed shadow-sm">
                        {message.content}
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                            <span className="text-[10px] opacity-60 text-accent-100">
                                {message.timestamp}
                            </span>
                            {remainingTime && (
                                <div className="flex items-center gap-1 text-[10px] opacity-70 bg-black/20 px-2 py-0.5 rounded-full">
                                    <Eye className="h-3 w-3" />
                                    <span>{remainingTime}</span>
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Edit button below message */}
                    <div className="mt-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={handleEditClick}
                            className="flex items-center space-x-1 rounded-md px-2 py-1 text-xs text-foreground-muted hover:text-accent hover:bg-accent/10 transition-colors"
                            title="Edit message"
                        >
                            <Edit2 size={14} />
                            <span>Edit</span>
                        </button>
                    </div>
                </div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 border border-black/5 dark:bg-white/10 dark:border-white/10">
                    <MdPerson size={18} className="text-foreground" />
                </div>
            </motion.div>
        );
    }

    // Bot message: full-width, no bubble, clean layout like ChatGPT
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex w-full justify-start space-x-3 px-4 group"
        >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 border border-accent/20">
                <MdSmartToy size={18} className="text-accent" />
            </div>

            <div className="flex-1 min-w-0 max-w-full">
                <div className="relative">
                    <div
                        ref={contentRef}
                        className={cn("text-sm leading-relaxed text-foreground whitespace-pre-wrap transition-all", isCollapsed && isOverflowing ? "max-h-[160px] overflow-hidden" : "")}
                    >
                        {formatMessage(message.content)}
                    </div>

                    {/* Fade at bottom when collapsed */}
                    {isCollapsed && isOverflowing && (
                        <div className="pointer-events-none absolute left-0 right-0 bottom-0 h-10 bg-gradient-to-t from-background-base to-transparent" />
                    )}

                    {/* Small circular down arrow to scroll to bottom */}
                    {isCollapsed && isOverflowing && (
                        <button
                            onClick={() => {
                                if (contentRef.current) {
                                    contentRef.current.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'smooth' });
                                }
                                setIsCollapsed(false);
                            }}
                            className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 dark:bg-[#0b0b0d]/90 border border-black/5 dark:border-white/5 shadow-sm text-foreground hover:scale-105 transition-transform"
                            title="Show full response"
                        >
                            <ChevronDown className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Actions bar */}
                <div className="mt-2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                        onClick={handleCopy}
                        className="flex items-center space-x-1 rounded-md px-2 py-1 text-xs text-foreground-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        title="Copy"
                    >
                        {copied ? <MdCheck size={14} /> : <MdContentCopy size={14} />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                        onClick={handleSpeak}
                        className="flex items-center space-x-1 rounded-md px-2 py-1 text-xs text-foreground-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        title="Read aloud"
                    >
                        <MdVolumeUp size={14} />
                        <span>Read aloud</span>
                    </button>
                    <span className="text-[10px] text-foreground-muted opacity-60 ml-2">
                        {message.timestamp}
                    </span>
                    {remainingTime && (
                        <span className="text-[10px] text-purple-400 opacity-70 ml-auto flex items-center gap-1 bg-purple-500/10 px-2 py-0.5 rounded-full">
                            <Eye className="h-3 w-3" />
                            {remainingTime}
                        </span>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
