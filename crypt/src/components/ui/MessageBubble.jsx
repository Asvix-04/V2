import { cn } from "../../lib/utils";
import { MdPerson, MdSmartToy, MdVolumeUp, MdContentCopy, MdCheck, MdLink } from "react-icons/md";
import { motion } from "framer-motion";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
        const id = index + 1;
        const title = deriveTitle(l);
        if (title && title.length >= 4) entries.push({ phrase: title, url: l.url, id });
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
    const refLinks = message.referenceLinks || message.reference_links;
    const markdownContent = injectReferenceLinks(message.content, refLinks);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex w-full justify-start space-x-3 px-4 group"
        >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 border border-accent/20">
                <MdSmartToy size={18} className="text-accent" />
            </div>

            <div className="w-full min-w-0">
                <div className="text-sm leading-relaxed text-foreground break-words">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                        {markdownContent}
                    </ReactMarkdown>
                </div>

                {/* Sources footer */}
                {refLinks?.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/5">
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            <div className="flex items-center gap-1.5 no-underline">
                                <MdLink size={14} className="text-accent/50" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted/60">Sources</span>
                            </div>
                            {refLinks.map((link, i) => (
                                <a
                                    key={i}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-accent hover:text-accent-bright transition-colors underline decoration-accent/20 underline-offset-4 font-medium"
                                >
                                    link{i + 1}.
                                </a>
                            ))}
                        </div>
                    </div>
                )}

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

                    {message.modelName && (
                        <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full ml-3 border font-medium bg-black/5 dark:bg-white/5",
                            message.modelName.includes('Flash') ? "text-blue-500 border-blue-500/20" :
                            message.modelName.includes('Original') ? "text-zinc-500 border-zinc-500/20" :
                            "text-purple-500 border-purple-500/20"
                        )}>
                            via {message.modelName}
                        </span>
                    )}

                </div>
            </div>
        </motion.div>
    );
}
