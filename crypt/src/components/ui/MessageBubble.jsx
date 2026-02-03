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
            className="w-full flex justify-center"
        >
            {/* CENTERED CONTENT COLUMN (ChatGPT style) */}
            <div className="w-full max-w-[760px] px-2">
                {/* ROLE LABEL */}
                <div className="mb-1 flex items-center gap-2 text-xs text-foreground-muted">
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

                {/* MESSAGE BODY */}
                <div
                    className={cn(
                        "rounded-lg px-4 py-3 text-[15px] leading-relaxed",
                        isUser
                            ? "bg-accent text-white"
                            : "bg-white border border-black/5 text-foreground dark:bg-[#1a1a1f] dark:border-white/5"
                    )}
                >
                    {message.content}
                </div>

                {/* FOOTER */}
                <div className="mt-1 flex items-center justify-between text-[11px] text-foreground-muted">
                    <span>{message.timestamp}</span>

                    {!isUser && (
                        <button
                            onClick={handleSpeak}
                            className="flex items-center gap-1 hover:text-accent transition-colors"
                            title="Read aloud"
                        >
                            <MdVolumeUp size={14} />
                            <span>Read</span>
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
