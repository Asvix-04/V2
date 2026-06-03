import { cn } from "../../lib/utils";
import { MdPerson, MdSmartToy, MdVolumeUp, MdVolumeOff, MdContentCopy, MdCheck, MdLink, MdEdit, MdRefresh } from "react-icons/md";
import { useState, useEffect, useRef } from "react";

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

function playAudioBase64(base64) {
    return new Promise((resolve, reject) => {
        try {
            const byteCharacters = atob(base64);
            const bytes = new Uint8Array(byteCharacters.length);

            for (let index = 0; index < byteCharacters.length; index += 1) {
                bytes[index] = byteCharacters.charCodeAt(index);
            }

            const blob = new Blob([bytes], { type: "audio/wav" });
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);

            audio.onended = () => {
                URL.revokeObjectURL(url);
                resolve();
            };
            audio.onerror = (error) => {
                URL.revokeObjectURL(url);
                reject(error);
            };
            audio.play().catch((error) => {
                URL.revokeObjectURL(url);
                reject(error);
            });
        } catch (error) {
            reject(error);
        }
    });
}

export function MessageBubble({ message, onEdit, isEditing = false, onEditSubmit, onEditCancel, onRetry, onStopAudio }) {
    const isUser = message.role === "user";
    const voiceAudio = message.audioBase64 || message.audio_base64;
    const [copied, setCopied] = useState(false);
    const [editValue, setEditValue] = useState(message.content || "");
    const [isReading, setIsReading] = useState(false);
    const [voiceVolume, setVoiceVolume] = useState(1);
    const editTextareaRef = useRef(null);
    const utteranceRef = useRef(null);
    const audioRef = useRef(null);
    const autoReadStartedRef = useRef(false);

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

    const stopReading = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        utteranceRef.current = null;
        setIsReading(false);
    };

    const handleSpeak = () => {
        if (isReading) {
            stopReading();
            return;
        }

        if (voiceAudio) {
            playAudioBase64(voiceAudio).catch(() => {}).finally(() => setIsReading(false));
            setIsReading(true);
            return;
        }

        if ('speechSynthesis' in window && message.content) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(message.content);
            utterance.volume = voiceVolume;
            utterance.onend = () => {
                utteranceRef.current = null;
                setIsReading(false);
            };
            utterance.onerror = () => {
                utteranceRef.current = null;
                setIsReading(false);
            };
            utteranceRef.current = utterance;
            setIsReading(true);
            window.speechSynthesis.speak(utterance);
        }
    };

    useEffect(() => {
        if (utteranceRef.current) {
            utteranceRef.current.volume = voiceVolume;
        }
    }, [voiceVolume]);

    useEffect(() => {
        const autoReadKey = message.id ? `digilab-auto-read:${message.id}` : null;
        const alreadyAutoRead = autoReadKey ? sessionStorage.getItem(autoReadKey) === 'true' : false;
        if (!isUser && message.autoReadAloud && !message.isStreaming && message.content && !autoReadStartedRef.current && !alreadyAutoRead) {
            autoReadStartedRef.current = true;
            if (autoReadKey) sessionStorage.setItem(autoReadKey, 'true');
            queueMicrotask(() => handleSpeak());
        }
    }, [isUser, message.autoReadAloud, message.content, message.isStreaming]);

    useEffect(() => () => stopReading(), []);

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
            <div
                className="flex w-full justify-end space-x-2 px-4 group"
            >
                <div className="flex max-w-[70%] flex-col items-end gap-1">
                    <div className="w-full rounded-2xl rounded-tr-sm bg-accent px-4 py-2 text-sm leading-relaxed text-white shadow-sm">

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
            </div>
        );
    }

    // ASSISTANT MESSAGE
    return (
        <div
            className="flex w-full justify-start space-x-3 px-4 group"
        >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 border border-accent/20">
                <MdSmartToy size={18} className="text-accent" />
            </div>

            <div className="w-full min-w-0">
                <div className={cn(
                    "text-sm leading-relaxed whitespace-pre-wrap",
                    message.isError ? "rounded-2xl rounded-tl-sm border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200" : "text-foreground"
                )}>
                    {message.content ? (
                        formatMessage(message.content, message.referenceLinks || message.reference_links)
                    ) : message.isStreaming ? (
                        <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-zinc-100 px-4 py-3 dark:bg-white/10">
                            {[0, 1, 2].map((dot) => (
                                <span
                                    key={dot}
                                    className="h-2 w-2 animate-pulse rounded-full bg-zinc-500 dark:bg-zinc-300"
                                    style={{ animationDelay: `${dot * 140}ms` }}
                                />
                            ))}
                        </div>
                    ) : null}
                    {message.isError && onRetry && (
                        <button
                            onClick={onRetry}
                            className="mt-3 flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
                            title="Retry"
                        >
                            <MdRefresh size={14} />
                            Retry
                        </button>
                    )}
                    {message.stopped && (
                        <div className="mt-2 text-xs text-foreground-muted opacity-70">
                            Response stopped
                        </div>
                    )}
                    {message.playbackFailed && (
                        <div className="mt-2 text-xs text-foreground-muted opacity-70">
                            Voice playback failed
                        </div>
                    )}
                </div>

                {voiceAudio && onStopAudio && !message.isError && (
                    <div className="mt-3 flex items-center">
                        <button
                            onClick={onStopAudio}
                            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-foreground-muted transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                            title="Stop voice"
                            aria-label="Stop voice"
                        >
                            <MdVolumeOff size={15} />
                            <span>Stop voice</span>
                        </button>
                    </div>
                )}

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

                    {isReading && (
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={voiceVolume}
                            onChange={(event) => setVoiceVolume(Number(event.target.value))}
                            className="w-24 accent-[var(--accent)]"
                            aria-label="Voice volume"
                        />
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
        </div>
    );
}
