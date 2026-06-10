import { cn } from "../../lib/utils";
import { MdVolumeUp, MdContentCopy, MdCheck, MdLink } from "react-icons/md";
import { motion } from "framer-motion";
import { useState, useRef, useEffect } from "react";

// Helper to escape regex special characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Logic to process text and find link matches
function processText(text, links) {
    if (!links || links.length === 0) return [text];

    // Build a map of phrases to match. 
    const linkEntries = [];
    links.forEach((l, index) => {
        if (!l) return;
        const url = l.url;
        const linkId = index + 1;
        let mainTitle = l.title;

        // If title is missing, try to extract keywords from URL path
        if (!mainTitle || mainTitle.trim() === "" || mainTitle.trim().toLowerCase() === "reference") {
            try {
                const urlObj = new URL(url);
                const pathParts = urlObj.pathname.split('/').filter(p => p.length > 3);
                if (pathParts.length > 0) {
                    mainTitle = pathParts[pathParts.length - 1].replace(/[-_]/g, ' ');
                }
            } catch (e) { }
        }

        const displayTitle = mainTitle || "Resource";
        linkEntries.push({ phrase: displayTitle, url: url, id: linkId });

        // Add suffix after common separators
        const subParts = displayTitle.split(/[:\-–—]/);
        if (subParts.length > 1) {
            const suffix = subParts[subParts.length - 1].trim();
            if (suffix.length > 3) linkEntries.push({ phrase: suffix, url: url, id: linkId });
        }

        // Add phrases without common prefixes like "Unit X", "Chapter X"
        const prefixMatch = displayTitle.match(/^(?:Unit|Chapter|Section|Part)\s+\d+[:\s-]*(.*)/i);
        if (prefixMatch && prefixMatch[1] && prefixMatch[1].trim().length > 3) {
            linkEntries.push({ phrase: prefixMatch[1].trim(), url: url, id: linkId });
        }
    });

    // Sort by length descending to match longest first
    linkEntries.sort((a, b) => (b.phrase?.length || 0) - (a.phrase?.length || 0));

    // Filter to unique phrases for the regex
    const uniquePhrases = Array.from(new Set(
        linkEntries
            .filter(le => le.phrase)
            .map(le => le.phrase.toLowerCase())
    ));
    if (uniquePhrases.length === 0) return [text];

    // Create regex with word boundaries (if possible) or just text matching
    const pattern = `(${uniquePhrases.map(p => escapeRegExp(p)).join('|')})`;
    const regex = new RegExp(pattern, 'gi');

    const parts = text.split(regex);
    return parts.map((part, i) => {
        const match = linkEntries.find(le => le.phrase.toLowerCase() === part.toLowerCase());
        if (match) {
            return (
                <span key={`link-${i}`} className="inline-flex items-baseline">
                    <span className="text-foreground">{part}</span>
                    <a
                        href={match.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-0.5 text-[10px] font-bold text-accent hover:text-accent-bright transition-opacity opacity-80 hover:opacity-100 no-underline cursor-pointer select-none"
                        title={`Reference: ${match.phrase}`}
                    >
                        [link{match.id}.]
                    </a>
                </span>
            );
        }
        return part;
    });
}

// Parse markdown into JSX with embedded links
function formatMessage(text, links = []) {
    if (!text) return null;
    const boldRegex = /(\*\*.*?\*\*)/g;
    const parts = text.split(boldRegex);

    return parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            const content = part.slice(2, -2);
            return (
                <strong key={i} className="font-semibold">
                    {processText(content, links)}
                </strong>
            );
        }
        return processText(part, links);
    });
}

export function MessageBubble({ message }) {
    const isUser = message.role === "user";
    const [copied, setCopied] = useState(false);
    const [showMobileActions, setShowMobileActions] = useState(false);
    const [showUserTimestamp, setShowUserTimestamp] = useState(false);
    const bubbleRef = useRef(null);
    const userBubbleRef = useRef(null);

    // Outside-click handler for AI message actions panel
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (bubbleRef.current && !bubbleRef.current.contains(e.target)) {
                setShowMobileActions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        // Use 'click' not 'touchstart' — fires AFTER the bubble's own onClick,
        // preventing the race that re-opens the panel on the second tap.
        document.addEventListener("click", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("click", handleClickOutside);
        };
    }, []);

    // Outside-click handler for USER message timestamp
    useEffect(() => {
        const handleUserClickOutside = (e) => {
            if (userBubbleRef.current && !userBubbleRef.current.contains(e.target)) {
                setShowUserTimestamp(false);
            }
        };
        document.addEventListener("mousedown", handleUserClickOutside);
        document.addEventListener("click", handleUserClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleUserClickOutside);
            document.removeEventListener("click", handleUserClickOutside);
        };
    }, []);

    const handleSpeak = (e) => {
        if (e) e.stopPropagation();
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(message.content);
            window.speechSynthesis.speak(utterance);
        }
    };

    const handleCopy = async (e) => {
        if (e) e.stopPropagation();
        try {
            await navigator.clipboard.writeText(message.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) { }
    };

    // Detect quoted message pattern
    const quoteMatch = message.content.match(/^>\s*"([\s\S]+?)"\n\n([\s\S]*)$/);

    // USER MESSAGE
    if (isUser) {
        return (
            <motion.div
                ref={userBubbleRef}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex w-full justify-end max-sm:px-0 sm:px-4 group mb-6"
                onClick={() => {
                    if (window.innerWidth < 640) {
                        setShowUserTimestamp(prev => !prev);
                    }
                }}
            >
                <div className="max-sm:max-w-[85%] sm:max-w-[75%] lg:max-w-[65%] rounded-[24px] bg-accent max-sm:bg-accent/75 max-sm:backdrop-blur-xl max-sm:border max-sm:border-white/10 text-white px-5 py-3.5 text-[15px] leading-relaxed shadow-sm">

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

                    {/* Desktop: hover-controlled. Mobile: state-controlled. */}
                    <div className={cn(
                        "overflow-hidden transition-all duration-200",
                        // Desktop hover behavior (unchanged) — sm:group-hover: is the correct Tailwind order
                        "sm:max-h-0 sm:opacity-0 sm:mt-0 sm:group-hover:max-h-6 sm:group-hover:opacity-100 sm:group-hover:mt-1",
                        // Mobile: driven by showUserTimestamp state
                        showUserTimestamp
                            ? "max-sm:max-h-6 max-sm:opacity-100 max-sm:mt-1"
                            : "max-sm:max-h-0 max-sm:opacity-0 max-sm:mt-0"
                    )}>
                        <span className="text-[10px] opacity-60 text-white/80">
                            {message.timestamp}
                        </span>
                    </div>
                </div>
            </motion.div>
        );
    }

    // ASSISTANT MESSAGE
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex w-full justify-start max-sm:pl-3 max-sm:pr-1 sm:px-4 group mb-8"
            ref={bubbleRef}
        >
            {/* The assistant text should naturally fill the available width (up to the parent's 900px max-width) */}
            <div className="w-full min-w-0">
                {/* Clickable area for mobile to reveal actions */}
                <div
                    className="cursor-default sm:cursor-text"
                    onClick={() => {
                        // Only toggle on mobile screens, desktop uses hover
                        if (window.innerWidth < 640) {
                            setShowMobileActions(prev => !prev);
                        }
                    }}
                >
                    <div className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">
                        {formatMessage(message.content, message.referenceLinks || message.reference_links)}
                    </div>

                    {/* Sublte footer for links - only if they exist but weren't necessarily all matched */}
                    {(message.referenceLinks || message.reference_links)?.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/5">
                            <div className="flex flex-wrap gap-x-4 gap-y-2">
                                <div className="flex items-center gap-1.5 no-underline">
                                    <MdLink size={14} className="text-accent/50" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted/60">Sources</span>
                                </div>
                                {(message.referenceLinks || message.reference_links).map((link, i) => (
                                    <a
                                        key={i}
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-accent hover:text-accent-bright transition-colors underline decoration-accent/20 underline-offset-4 font-medium"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        link{i + 1}.
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Actions Row - revealed on tap (mobile) or hover (desktop) */}
                <div
                    className={cn(
                        "flex flex-wrap items-center gap-y-2 gap-x-1 transition-all duration-200 overflow-hidden",
                        showMobileActions
                            ? "opacity-100 max-h-20 mt-3"
                            : "max-sm:opacity-0 max-sm:max-h-0 max-sm:mt-0",
                        "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 sm:mt-3 sm:max-h-20 sm:overflow-visible"
                    )}
                >
                    <button
                        onClick={handleCopy}
                        className="flex items-center space-x-1 rounded-md px-2 py-1 text-xs text-foreground-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors max-sm:min-h-[36px]"
                        title="Copy"
                    >
                        {copied ? <MdCheck size={14} /> : <MdContentCopy size={14} />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>

                    <button
                        onClick={handleSpeak}
                        className="flex items-center space-x-1 rounded-md px-2 py-1 text-xs text-foreground-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors max-sm:min-h-[36px]"
                        title="Read aloud"
                    >
                        <MdVolumeUp size={14} />
                        <span>Read aloud</span>
                    </button>

                    <span className="text-[10px] text-foreground-muted opacity-60 ml-2">
                        {message.timestamp}
                    </span>

                    {message.modelName && (
                        <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full ml-3 border font-medium bg-black/5 dark:bg-white/5",
                            message.modelName.includes('Flash') ? "text-blue-500 border-blue-500/20" :
                                message.modelName.includes('Original') ? "text-zinc-500 border-zinc-500/20" :
                                    "text-purple-500 border-purple-500/20"
                        )}>
                            via {message.modelName.replace('Gemini ', '')}
                        </span>
                    )}

                </div>
            </div>
        </motion.div>
    );
}
