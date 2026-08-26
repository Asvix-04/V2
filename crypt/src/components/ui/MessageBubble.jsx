import { cn } from "../../lib/utils";
import { MdVolumeUp, MdContentCopy, MdCheck, MdLink } from "react-icons/md";
import { motion } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown"; // resolved import
import remarkGfm from "remark-gfm"; // resolved import

// Escape regex special characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Derive a display title for a reference link (falls back to URL path keywords)
function deriveTitle(link) {
    let title = (link.title || "").trim();
    if (!title || title.toLowerCase() === "reference") {
        try {
            const urlObj = new URL(link.url);
            const parts = urlObj.pathname.split('/').filter(p => p.length > 3);
            if (parts.length > 0) title = parts[parts.length - 1].replace(/[-_]/g, ' ');
        } catch (e) { /* ignore */ }
    }
    return title;
}

/**
 * Pre-process the answer text into a Markdown string with reference links
 * injected as real Markdown links: "...Digital Media [link1.](url)...".
 * react-markdown then renders them as styled <a> elements, and they compose
 * cleanly with tables / bold / lists instead of fighting custom JSX.
 */
function injectReferenceLinks(text, links) {
    if (!text) return "";
    if (!links || links.length === 0) return text;

    // Build phrase → {url,id} entries, longest phrase first so we match specifics.
    const entries = [];
    links.forEach((l, index) => {
        if (!l || !l.url) return;
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
        entries.push({ phrase: displayTitle, url: url, id: linkId });

        // Add suffix after common separators
        const subParts = displayTitle.split(/[:\-–—]/);
        if (subParts.length > 1) {
            const suffix = subParts[subParts.length - 1].trim();
            if (suffix.length > 3) entries.push({ phrase: suffix, url: url, id: linkId });
        }

        // Add phrases without common prefixes like "Unit X", "Chapter X"
        const prefixMatch = displayTitle.match(/^(?:Unit|Chapter|Section|Part)\s+\d+[:\s-]*(.*)/i);
        if (prefixMatch && prefixMatch[1] && prefixMatch[1].trim().length > 3) {
            entries.push({ phrase: prefixMatch[1].trim(), url: url, id: linkId });
        }
    });
    entries.sort((a, b) => b.phrase.length - a.phrase.length);

    let result = text;
    const usedIds = new Set();
    for (const e of entries) {
        if (usedIds.has(e.id)) continue;
        // Append the marker after the FIRST case-insensitive occurrence of the phrase.
        const re = new RegExp(`(${escapeRegExp(e.phrase)})`, 'i');
        if (re.test(result)) {
            result = result.replace(re, `$1 [link${e.id}.](${e.url})`);
            usedIds.add(e.id);
        }
    }
    return result;
}

// Themed renderers so Markdown elements match the app's light/dark theme.
const mdComponents = {
    p: ({ node, ...props }) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
    strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
    em: ({ node, ...props }) => <em className="italic" {...props} />,
    ul: ({ node, ...props }) => <ul className="list-disc pl-5 space-y-1 my-2" {...props} />,
    ol: ({ node, ...props }) => <ol className="list-decimal pl-5 space-y-1 my-2" {...props} />,
    li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
    h1: ({ node, ...props }) => <h1 className="text-lg font-bold text-foreground mt-3 mb-2" {...props} />,
    h2: ({ node, ...props }) => <h2 className="text-base font-bold text-foreground mt-3 mb-2" {...props} />,
    h3: ({ node, ...props }) => <h3 className="text-sm font-semibold text-foreground mt-2 mb-1" {...props} />,
    a: ({ node, ...props }) => (
        <a
            className="text-accent hover:text-accent-bright font-medium underline decoration-accent/30 underline-offset-2 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
            {...props}
        />
    ),
    blockquote: ({ node, ...props }) => (
        <blockquote className="border-l-2 border-accent/40 pl-3 italic text-foreground-muted my-2" {...props} />
    ),
    code: ({ node, inline, ...props }) =>
        inline ? (
            <code className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10 text-[0.85em] font-mono" {...props} />
        ) : (
            <code className="block p-3 rounded-lg bg-black/5 dark:bg-white/10 text-[0.85em] font-mono overflow-x-auto my-2" {...props} />
        ),
    hr: ({ node, ...props }) => <hr className="my-3 border-black/10 dark:border-white/10" {...props} />,
    // ── Tables (the main reason for this change) ──
    table: ({ node, ...props }) => (
        <div className="my-3 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm border-collapse" {...props} />
        </div>
    ),
    thead: ({ node, ...props }) => <thead className="bg-black/5 dark:bg-white/5" {...props} />,
    th: ({ node, ...props }) => (
        <th className="px-3 py-2 text-left font-semibold text-foreground border-b border-black/10 dark:border-white/10" {...props} />
    ),
    td: ({ node, ...props }) => (
        <td className="px-3 py-2 text-foreground-muted border-b border-black/5 dark:border-white/5 align-top" {...props} />
    ),
    tr: ({ node, ...props }) => (
        <tr className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors" {...props} />
    ),
};

export function MessageBubble({ message, isIncognito }) {
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
        } catch (err) {
            try {
                const textarea = document.createElement("textarea");
                textarea.value = message.content;
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch (e) {
                console.error("Failed to copy text", e);
            }
        }
    };

    // Detect quoted message pattern
    const quoteMatch = message.content?.match ? message.content.match(/^>\s*"([\s\S]+?)"\n\n([\s\S]*)$/) : null;

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
                        "overflow-hidden transition-all duration-200 flex items-center justify-between gap-3",
                        // Desktop hover behavior — sm:group-hover: is the correct Tailwind order
                        "sm:max-h-0 sm:opacity-0 sm:mt-0 sm:group-hover:max-h-8 sm:group-hover:opacity-100 sm:group-hover:mt-1.5",
                        // Mobile: driven by showUserTimestamp state
                        showUserTimestamp
                            ? "max-sm:max-h-8 max-sm:opacity-100 max-sm:mt-1.5"
                            : "max-sm:max-h-0 max-sm:opacity-0 max-sm:mt-0"
                    )}>
                        <span className="text-[10px] opacity-70 text-white/80 select-none">
                            {message.timestamp}
                        </span>

                        <button
                            type="button"
                            onClick={handleCopy}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-white/80 hover:text-white hover:bg-white/20 transition-all active:scale-95 cursor-pointer select-none"
                            title="Copy message"
                            aria-label="Copy message"
                        >
                            {copied ? (
                                <>
                                    <MdCheck size={13} className="text-white" />
                                    <span className="text-[10px] font-medium">Copied</span>
                                </>
                            ) : (
                                <>
                                    <MdContentCopy size={13} />
                                    <span className="text-[10px] font-medium">Copy</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </motion.div>
        );
    }

    // ASSISTANT MESSAGE
    const refLinks = message.referenceLinks || message.reference_links;
    const markdownContent = injectReferenceLinks(message.content, refLinks);

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
                    <div className={cn(
                        "text-sm leading-relaxed text-foreground break-words",
                        isIncognito ? "text-zinc-100" : "text-zinc-800 dark:text-zinc-100"
                    )}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                            {markdownContent}
                        </ReactMarkdown>
                    </div>

                    {/* Sources footer */}
                    {refLinks?.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/5">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1.5 no-underline mr-1">
                                    <MdLink size={14} className={isIncognito ? "text-zinc-400" : "text-zinc-400 dark:text-zinc-500"} />
                                    <span className={cn("text-[10px] font-bold uppercase tracking-wider", isIncognito ? "text-zinc-400" : "text-zinc-500 dark:text-zinc-400")}>Sources</span>
                                </div>
                                {refLinks.map((link, i) => (
                                    <a
                                        key={i}
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={cn(
                                            "text-[11px] px-2 py-1 rounded-md transition-colors border font-medium flex items-center gap-1 cursor-pointer",
                                            isIncognito 
                                                ? "bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white border-white/5"
                                                : "bg-zinc-100 dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/[0.08] hover:text-zinc-900 dark:hover:text-white border-black/5 dark:border-white/5"
                                        )}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {i + 1}
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
