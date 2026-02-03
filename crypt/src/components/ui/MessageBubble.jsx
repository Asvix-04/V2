import { useState } from "react";
import { cn } from "../../lib/utils";
import { MdPerson, MdSmartToy, MdVolumeUp, MdThumbUp, MdThumbDown } from "react-icons/md";
import { motion } from "framer-motion";

export function MessageBubble({ message }) {
    const isUser = message.role === "user";
    const [feedback, setFeedback] = useState(null);

    const handleSpeak = () => {
        if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(message.content);
            window.speechSynthesis.speak(utterance);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={cn(
                "w-full flex",
                isUser ? "justify-end" : "justify-start"
            )}
        >
            {/* Message container with hover area */}
            <div
                className={cn(
                    "max-w-[75%] md:max-w-[60%]",
                    isUser ? "text-right" : "text-left"
                )}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* ROLE LABEL */}
                <div className={cn(
                    "mb-1 flex items-center gap-2 text-xs text-foreground-muted",
                    isUser ? "justify-end" : "justify-start"
                )}>
                    {isUser ? (
                        <>
                            <MdPerson size={14} />
                            <span>You</span>
                        </>
                    ) : (
                        <>
                            <MdSmartToy size={14} />
                            <span>Asvix</span>
                        </>
                    )}
                </div>

            <div className={cn(
                "relative max-w-[55%] rounded-2xl px-3 py-1.5 text-xs leading-tight shadow-sm",
                isUser
                    ? "bg-accent text-white rounded-tr-sm"
                    : "bg-white border border-black/5 text-foreground rounded-tl-sm dark:bg-[#1a1a1f] dark:border-white/5"
            )}>
                {message.content}

                    {/* Side Action Buttons - Only for bot messages, show on hover */}
                    {!isUser && (
                        <div
                            className={cn(
                                "flex items-center gap-1 transition-opacity duration-200",
                                isHovered || feedback ? "opacity-100" : "opacity-0"
                            )}
                        >
                            <button
                                onClick={() => setFeedback(feedback === 'like' ? null : 'like')}
                                className={cn(
                                    "p-1.5 rounded-full hover:bg-green-500/10 transition-colors",
                                    feedback === 'like' ? "text-green-500 bg-green-500/10" : "text-foreground-muted hover:text-green-500"
                                )}
                                title="Good response"
                            >
                                <MdThumbUp size={14} />
                            </button>
                            <button
                                onClick={() => setFeedback(feedback === 'dislike' ? null : 'dislike')}
                                className={cn(
                                    "p-1.5 rounded-full hover:bg-red-500/10 transition-colors",
                                    feedback === 'dislike' ? "text-red-500 bg-red-500/10" : "text-foreground-muted hover:text-red-500"
                                )}
                                title="Bad response"
                            >
                                <MdThumbDown size={14} />
                            </button>
                        </div>
                    )}
                </div>

                {/* FOOTER */}
                <div className={cn(
                    "mt-1 flex items-center text-[11px] text-foreground-muted",
                    isUser ? "justify-end" : "justify-start gap-4"
                )}>
                    <span>{message.timestamp}</span>

                    {!isUser && (
                        <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex items-center space-x-1">
                                <button
                                    onClick={() => setFeedback('liked')}
                                    className={cn("p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors", feedback === 'liked' ? "text-green-500" : "text-foreground-muted hover:text-green-500")}
                                    title="Like"
                                >
                                    <MdThumbUp size={16} />
                                </button>
                                <button
                                    onClick={() => setFeedback('disliked')}
                                    className={cn("p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors", feedback === 'disliked' ? "text-red-500" : "text-foreground-muted hover:text-red-500")}
                                    title="Dislike"
                                >
                                    <MdThumbDown size={16} />
                                </button>
                            </div>
                            <button
                                onClick={handleSpeak}
                                className="text-foreground-muted hover:text-accent transition-colors ml-1"
                                title="Read aloud"
                            >
                                <MdVolumeUp size={18} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
