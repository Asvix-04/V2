import { cn } from "../../lib/utils";
import { MdPerson, MdSmartToy, MdVolumeUp, MdVolumeOff, MdContentCopy, MdCheck, MdLink, MdEdit, MdRefresh } from "react-icons/md";
import { motion } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Escape regex special characters
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
            } catch {
                // Ignore malformed reference URLs.
            }
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

    // For now, return the original text as a single segment.
    return [text];
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

function playAudioBase64(base64, { onAudio } = {}) {
    return new Promise((resolve, reject) => {
        let url = null;
        try {
            const byteCharacters = atob(base64);
            const bytes = new Uint8Array(byteCharacters.length);

            for (let index = 0; index < byteCharacters.length; index += 1) {
                bytes[index] = byteCharacters.charCodeAt(index);
            }

            const blob = new Blob([bytes], { type: "audio/wav" });
            url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            onAudio?.(audio);

            audio.onended = () => {
                URL.revokeObjectURL(url);
                resolve();
            };
            audio.onerror = (error) => {
                URL.revokeObjectURL(url);
                reject(error);
            };
            audio.play().catch((error) => {
                if (url) URL.revokeObjectURL(url);
                reject(error);
            });
        } catch (error) {
            if (url) URL.revokeObjectURL(url);
            reject(error);
        }
    });
}

export function MessageBubble({ message, onEdit, isEditing = false, onEditSubmit, onEditCancel, onRetry, isIncognito = false }) {
    const isUser = message.role === "user";
    const voiceAudio = message.audioBase64 || message.audio_base64;
    const [copied, setCopied] = useState(false);
    const [editValue, setEditValue] = useState(message.content || "");
    const [isReading, setIsReading] = useState(false);
    const editTextareaRef = useRef(null);
    const utteranceRef = useRef(null);
    const audioRef = useRef(null);
    const autoReadStartedRef = useRef(false);
    const readingRunRef = useRef(0);

    // When entering edit mode, reset textarea content and focus
    useEffect(() => {
        if (isEditing && isUser) {
            queueMicrotask(() => setEditValue(message.content || ""));
            requestAnimationFrame(() => {
                if (editTextareaRef.current) {
                    editTextareaRef.current.focus();
                    const len = editTextareaRef.current.value.length;
                    editTextareaRef.current.setSelectionRange(len, len);
                }
            });
        }
    }, [isEditing, isUser, message.content]);

    const stopReading = useCallback(() => {
        readingRunRef.current += 1;
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        utteranceRef.current = null;
        setIsReading(false);
    }, []);

    const startReading = useCallback(() => {
        const runId = readingRunRef.current + 1;
        readingRunRef.current = runId;

        if (voiceAudio) {
            setIsReading(true);
            playAudioBase64(voiceAudio, {
                onAudio: (audio) => {
                    audioRef.current = audio;
                },
            }).catch(() => {}).finally(() => {
                if (readingRunRef.current !== runId) {
                    return;
                }
                audioRef.current = null;
                setIsReading(false);
            });
            return;
        }

        if ('speechSynthesis' in window && message.content) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(message.content);
            utterance.onend = () => {
                if (readingRunRef.current !== runId) {
                    return;
                }
                utteranceRef.current = null;
                setIsReading(false);
            };
            utterance.onerror = () => {
                if (readingRunRef.current !== runId) {
                    return;
                }
                utteranceRef.current = null;
                setIsReading(false);
            };
            utteranceRef.current = utterance;
            setIsReading(true);
            window.speechSynthesis.speak(utterance);
            window.speechSynthesis.resume();
        }
    }, [message.content, voiceAudio]);

    const handleSpeak = useCallback(() => {
        if (isReading) {
            stopReading();
            return;
        }

        startReading();
    }, [isReading, startReading, stopReading]);

    useEffect(() => {
        autoReadStartedRef.current = false;
    }, [message.id]);

    useEffect(() => {
        if (!isUser && message.autoReadAloud && !message.isStreaming && message.content && !autoReadStartedRef.current) {
            autoReadStartedRef.current = true;
            const frame = window.requestAnimationFrame(() => {
                startReading();
            });
            return () => window.cancelAnimationFrame(frame);
        }
    }, [isUser, message.autoReadAloud, message.content, message.isStreaming, startReading]);

    useEffect(() => () => stopReading(), [stopReading]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(message.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard can be unavailable in restricted browser contexts.
        }
    };

    // Detect quoted message pattern
    const quoteMatch = message.content.match(/^>\s*"([\s\S]+?)"\n\n([\s\S]*)$/);

    // USER MESSAGE
    if (isUser) {
        // ── Inline Edit Mode (Claude.ai style) ──────────────────────────
        if (isEditing && onEditSubmit) {
            return (
                <div
                    className="flex w-full justify-end space-x-2 px-4"
                >
                    <div className="flex w-full max-w-[75%] flex-col gap-2">
                        <textarea
                            ref={editTextareaRef}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (editValue.trim()) onEditSubmit(editValue.trim());
                                }
                                if (e.key === 'Escape') {
                                    onEditCancel?.();
                                }
                            }}
                            className="w-full resize-none rounded-2xl rounded-tr-sm border border-accent/40 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-accent/50 dark:bg-accent/10 dark:text-white"
                            rows={Math.max(2, (editValue.match(/\n/g) || []).length + 1)}
                        />
                        <div className="flex items-center justify-end gap-2">
                            <button
                                onClick={() => onEditCancel?.()}
                                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-foreground-muted transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => { if (editValue.trim()) onEditSubmit(editValue.trim()); }}
                                disabled={!editValue.trim()}
                                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Confirm Edit
                            </button>
                        </div>
                    </div>

                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/5 bg-gray-100 dark:border-white/10 dark:bg-white/10">
                        <MdPerson size={14} className="text-foreground" />
                    </div>
                </div>
            );
        }

        // ── Normal display ───────────────────────────────────────────────
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex w-full justify-end max-sm:px-0 sm:px-4 group mb-6"
            >
                <div className="flex max-sm:max-w-[85%] sm:max-w-[75%] lg:max-w-[65%] flex-col items-end gap-1">
                    <div className={cn(
                        "w-full rounded-[24px] px-5 py-3.5 text-[15px] leading-relaxed text-white shadow-sm",
                        isIncognito
                            ? "bg-[#1e2a3a]/90 border border-white/10 backdrop-blur-xl"
                            : "bg-accent max-sm:bg-accent/75 max-sm:backdrop-blur-xl max-sm:border max-sm:border-white/10"
                    )}>

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
                    </div>

                    <div className="flex items-center gap-2 opacity-100 transition-opacity">
                        {onEdit && (
                            <button
                                onClick={onEdit}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground-muted transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                                title="Edit message"
                                aria-label="Edit message"
                            >
                                <MdEdit size={14} />
                            </button>
                        )}

                        <span className="text-[10px] text-accent/70">
                            {message.isEdited ? 'Edited · ' : ''}{message.timestamp}
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
            className="flex w-full justify-start space-x-3 max-sm:pl-3 max-sm:pr-1 sm:px-4 group mb-8"
        >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 border border-accent/20">
                <MdSmartToy size={18} className="text-accent" />
            </div>

            <div className="w-full min-w-0">
                <div className={cn(
                    "text-[15px] sm:text-[15.5px] leading-relaxed sm:leading-7 break-words",
                    isIncognito ? "text-zinc-100" : "text-foreground"
                )}>
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
                                    className={cn(
                                        "text-xs transition-colors underline underline-offset-4 font-medium",
                                        isIncognito
                                            ? "text-zinc-300 hover:text-white decoration-zinc-500/40"
                                            : "text-accent hover:text-accent-bright decoration-accent/20"
                                    )}
                                >
                                    link{i + 1}.
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">

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
                        title={isReading ? "Stop reading" : "Read aloud"}
                    >
                        {isReading ? <MdVolumeOff size={14} /> : <MdVolumeUp size={14} />}
                        <span>{isReading ? 'Stop reading' : 'Read aloud'}</span>
                    </button>

                    {onRetry && (
                        <button
                            onClick={onRetry}
                            className="flex items-center space-x-1 rounded-md px-2 py-1 text-xs text-foreground-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            title="Retry"
                            aria-label="Retry message"
                        >
                            <MdRefresh size={14} />
                            <span>Retry</span>
                        </button>
                    )}

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
