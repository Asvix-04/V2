import { cn } from "../../lib/utils";
import { MdPerson, MdSmartToy, MdVolumeUp, MdContentCopy, MdCheck } from "react-icons/md";
import { motion } from "framer-motion";
import { useState } from "react";

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

export function MessageBubble({ message }) {
    const isUser = message.role === "user";
    const [copied, setCopied] = useState(false);

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
        } catch (err) {}
    };

    // Detect quoted message pattern
    const quoteMatch = message.content.match(/^>\s*"([\s\S]+?)"\n\n([\s\S]*)$/);

    // USER MESSAGE
    if (isUser) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex w-full justify-end space-x-2 px-4 group"
            >
                <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-accent text-white px-4 py-2 text-sm leading-relaxed shadow-sm">

                    {quoteMatch ? (
                        <div className="space-y-2">
                            <div className="rounded-lg border-l-4 border-white/40 bg-white/10 px-3 py-2 text-xs italic">
                                "{quoteMatch[1]}"
                            </div>
                            <div>{quoteMatch[2]}</div>
                        </div>
                    ) : (
                        message.content
                    )}

                    <div className="max-h-0 overflow-hidden opacity-0 group-hover:max-h-6 group-hover:opacity-100 group-hover:mt-1 transition-all duration-200">
                        <span className="text-[10px] opacity-60 text-accent-100">
                            {message.timestamp}
                        </span>
                    </div>
                </div>

                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 border border-black/5 dark:bg-white/10 dark:border-white/10">
                    <MdPerson size={14} className="text-foreground" />
                </div>
            </motion.div>
        );
    }

    // ASSISTANT MESSAGE
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
                <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                    {formatMessage(message.content)}
                </div>

                {/* Actions */}
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

                </div>
            </div>
        </motion.div>
    );
}