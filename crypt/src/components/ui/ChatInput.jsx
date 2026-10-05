import * as React from "react";
import { cn } from "../../lib/utils";
import { MdSend, MdAttachFile, MdMic, MdMicOff, MdGraphicEq, MdClose } from "react-icons/md";
import { FaFilePdf, FaFileWord, FaFileLines } from "react-icons/fa6";
import api from "../../lib/api";

function getFileIcon(filename = "") {
    const ext = filename?.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
        return <FaFilePdf className="text-red-500 dark:text-red-400 shrink-0 text-[14px]" aria-hidden="true" />;
    }
    if (ext === 'docx' || ext === 'doc') {
        return <FaFileWord className="text-blue-500 dark:text-blue-400 shrink-0 text-[14px]" aria-hidden="true" />;
    }
    return <FaFileLines className="text-zinc-500 dark:text-zinc-400 shrink-0 text-[14px]" aria-hidden="true" />;
}

// Maximum height before the textarea stops growing and scrolls internally.
// 200px ≈ ~8 lines at 14px — matches ChatGPT / Claude behaviour.
const MAX_HEIGHT = 200;

export const ChatInput = React.forwardRef(({ className, onSend, disabled, initialValue = "", onChangeText, isIncognito, ...props }, ref) => {
    const [value, setValue] = React.useState(initialValue);
    const [isListening, setIsListening] = React.useState(false);
    const [isFocused, setIsFocused] = React.useState(false);

    // Persistent active attachment state — survives page refresh / tab switch
    const [attachment, setAttachment] = React.useState(() => {
        try {
            const saved = sessionStorage.getItem("digilab_active_attachment");
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    });

    // Internal ref used for height measurement.
    const internalRef = React.useRef(null);
    const recognitionRef = React.useRef(null);
    const fileInputRef = React.useRef(null);

    const hasText = value.trim().length > 0;
    const isProcessingAttachment = attachment && (attachment.status === "uploading" || attachment.status === "processing");
    // Show send button instead of mic+talk when user is actively typing, focused with text, or has a ready file
    const isActive = isFocused || hasText || (attachment && attachment.status === "ready");
    const canSend = (hasText || (attachment && attachment.status === "ready")) && !isProcessingAttachment && !disabled;

    // Responsive placeholder — short on mobile, full on desktop
    const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < 768;
    const activePlaceholder = isProcessingAttachment
        ? "Processing document..."
        : isMobileScreen
            ? "Message..."
            : (props.placeholder || "Ask a question...");

    // Persist attachment to sessionStorage so refresh / navigation preserves state
    React.useEffect(() => {
        try {
            if (attachment) {
                sessionStorage.setItem("digilab_active_attachment", JSON.stringify(attachment));
            } else {
                sessionStorage.removeItem("digilab_active_attachment");
            }
        } catch {
            // Ignore storage quota errors
        }
    }, [attachment]);

    // Short-poll status endpoint while document is processing
    React.useEffect(() => {
        if (!attachment?.jobId || attachment.status === "ready" || attachment.status === "failed") {
            return;
        }

        let isMounted = true;
        const pollInterval = setInterval(async () => {
            try {
                const res = await api.get(`/chat/upload-status/${attachment.jobId}`);
                if (!isMounted) return;

                const jobStatus = res.data?.status;
                if (jobStatus === "READY") {
                    setAttachment((prev) => (prev ? { ...prev, status: "ready" } : null));
                    clearInterval(pollInterval);
                } else if (jobStatus === "FAILED") {
                    setAttachment((prev) => (prev ? { ...prev, status: "failed" } : null));
                    clearInterval(pollInterval);
                } else if (jobStatus === "PROCESSING" || jobStatus === "QUEUED") {
                    setAttachment((prev) => (prev && prev.status !== "processing" ? { ...prev, status: "processing" } : prev));
                }
            } catch (err) {
                console.warn("[ChatInput] Status poll error:", err.message);
            }
        }, 1500);

        return () => {
            isMounted = false;
            clearInterval(pollInterval);
        };
    }, [attachment?.jobId, attachment?.status]);

    // ── Auto-resize ─────────────────────────────────────────────────────────
    React.useLayoutEffect(() => {
        const el = internalRef.current;
        if (!el) return;
        el.style.height = "auto";
        const scrollH = el.scrollHeight;
        el.style.height = `${Math.min(scrollH, MAX_HEIGHT)}px`;
        el.style.overflowY = scrollH > MAX_HEIGHT ? "auto" : "hidden";
    }, [value]);

    // Compose the forwarded ref with the internal measurement ref.
    const setRef = React.useCallback((node) => {
        internalRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
    }, [ref]);

    React.useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    React.useEffect(() => {
        if (onChangeText) {
            onChangeText(value);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    React.useEffect(() => {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.onresult = (event) => {
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
                }
                if (finalTranscript) setValue((prev) => prev + (prev ? " " : "") + finalTranscript);
            };
            recognitionRef.current.onerror = () => setIsListening(false);
        }
    }, []);

    const toggleListening = () => {
        if (!recognitionRef.current) return;
        if (isListening) { recognitionRef.current.stop(); setIsListening(false); }
        else { recognitionRef.current.start(); setIsListening(true); }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const ext = file.name.split('.').pop()?.toLowerCase();
        const isDoc = ext === 'pdf' || ext === 'docx';

        const formData = new FormData();
        formData.append('file', file);

        setAttachment({
            name: file.name,
            status: 'uploading',
            isDocument: isDoc,
        });

        try {
            const res = await api.post('/chat/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5001/api').replace('/api', '');
            const fullUrl = res.data.url?.startsWith('http') ? res.data.url : `${baseUrl}${res.data.url}`;

            if (isDoc && res.data.jobId) {
                // Background ingestion queued (HTTP 202)
                setAttachment({
                    jobId: res.data.jobId,
                    documentId: res.data.documentId,
                    name: file.name,
                    url: fullUrl,
                    status: 'processing',
                    isDocument: true,
                });
            } else {
                // Non-document or immediately ready
                setAttachment({
                    name: file.name,
                    url: fullUrl,
                    status: 'ready',
                    isDocument: false,
                });
            }
        } catch (err) {
            console.error('[ChatInput] Upload failed:', err);
            setAttachment({
                name: file.name,
                status: 'failed',
                isDocument: isDoc,
            });
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleRetry = async () => {
        if (!attachment?.jobId) return;
        setAttachment((prev) => (prev ? { ...prev, status: 'processing' } : null));
        try {
            await api.post(`/chat/upload-retry/${attachment.jobId}`);
        } catch (err) {
            console.error('[ChatInput] Retry failed:', err);
            setAttachment((prev) => (prev ? { ...prev, status: 'failed' } : null));
        }
    };

    const handleRemoveAttachment = () => {
        setAttachment(null);
        try {
            sessionStorage.removeItem("digilab_active_attachment");
        } catch { /* noop */ }
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!canSend) return;

        const textToSend = value.trim();
        let attachmentToSend = null;

        if (attachment && attachment.status === "ready") {
            attachmentToSend = {
                name: attachment.name,
                url: attachment.url,
                documentId: attachment.documentId || null,
                jobId: attachment.jobId || null,
                isDocument: attachment.isDocument ?? true,
            };
            handleRemoveAttachment();
        }

        if ((textToSend || attachmentToSend) && onSend) {
            onSend(textToSend, attachmentToSend);
            setValue("");
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <div className="w-full flex flex-col items-center">
            <form
                onSubmit={handleSubmit}
                className={cn(
                    "flex flex-col w-full px-3 py-2 transition-all duration-200",
                    "min-h-[56px] rounded-[2rem]",
                    isIncognito
                        ? "border focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.12)]"
                        : [
                            "bg-white border border-zinc-200 shadow-sm focus-within:border-accent/50 focus-within:shadow-[0_0_0_3px_rgba(94,106,210,0.08)]",
                            "dark:bg-zinc-900 dark:border-white/10 dark:focus-within:border-accent/40 dark:focus-within:shadow-[0_0_0_3px_rgba(94,106,210,0.06)]",
                        ],
                    className
                )}
                style={isIncognito ? {
                    backgroundColor: "rgba(30,42,58,0.9)",
                    borderColor: "rgba(255,255,255,0.08)",
                    backdropFilter: "blur(12px)",
                } : undefined}
            >
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

                {/* ChatGPT-style clean inline attachment pill inside composer surface */}
                {attachment && (
                    <div className="pt-1 pb-1 px-1 flex items-center">
                        <div
                            className={cn(
                                "flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs w-fit max-w-full transition-all",
                                isIncognito
                                    ? "bg-slate-800/80 border border-white/10 text-slate-200"
                                    : "bg-zinc-100 dark:bg-white/5 border border-zinc-200/80 dark:border-white/10 text-zinc-700 dark:text-zinc-300"
                            )}
                        >
                            {getFileIcon(attachment.name)}
                            <span className="font-medium truncate max-w-[150px] sm:max-w-[260px]">
                                {attachment.name}
                            </span>

                            {/* Subtle quiet loading indicator during upload / processing — NO 'Ready' text */}
                            {(attachment.status === "uploading" || attachment.status === "processing") && (
                                <span
                                    className="inline-block w-3 h-3 rounded-full border-[1.5px] border-zinc-400 dark:border-zinc-500 border-t-transparent animate-spin shrink-0"
                                    title="Processing document..."
                                    aria-label="Processing document"
                                />
                            )}

                            {/* Failed state with retry */}
                            {attachment.status === "failed" && (
                                <span className="text-rose-500 dark:text-rose-400 flex items-center gap-1 font-normal text-xs">
                                    <span>Couldn't process</span>
                                    {attachment.jobId && (
                                        <button
                                            type="button"
                                            onClick={handleRetry}
                                            className="underline hover:text-rose-600 dark:hover:text-rose-300 font-medium ml-0.5 cursor-pointer"
                                        >
                                            Retry
                                        </button>
                                    )}
                                </span>
                            )}

                            {/* Close / Remove button */}
                            <button
                                type="button"
                                onClick={handleRemoveAttachment}
                                className="ml-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 rounded-full transition-colors cursor-pointer"
                                aria-label="Remove attachment"
                                title="Remove attachment"
                            >
                                <MdClose className="text-sm" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Input & action controls row */}
                <div className="flex items-end w-full">
                    {/* LEFT — Attach button */}
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isProcessingAttachment || disabled}
                        className={cn(
                            "shrink-0 flex items-center justify-center h-10 w-10 rounded-full transition-all duration-150 active:scale-95 mb-1",
                            isIncognito
                                ? "text-slate-400 hover:text-slate-200 hover:bg-white/8"
                                : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10",
                            isProcessingAttachment && "opacity-50 cursor-not-allowed"
                        )}
                        aria-label="Attach file"
                        title={isProcessingAttachment ? "Document is processing..." : "Attach file"}
                    >
                        <MdAttachFile className="text-[22px] rotate-45" />
                    </button>

                    {/* CENTER — Auto-growing textarea */}
                    <textarea
                        ref={setRef}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={(e) => { setIsFocused(true); props.onFocus?.(e); }}
                        onBlur={(e) => { setIsFocused(false); props.onBlur?.(e); }}
                        placeholder={isFocused ? activePlaceholder : (isProcessingAttachment ? activePlaceholder : "")}
                        rows={1}
                        className={cn(
                            "chat-input-textarea flex-1 min-w-0 bg-transparent border-0 px-3 py-3 text-sm leading-5 caret-accent focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none resize-none",
                            isIncognito
                                ? "text-slate-200 placeholder:text-slate-500"
                                : "text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                        )}
                        style={{ minHeight: "24px", overflowY: "hidden" }}
                        disabled={disabled}
                    />

                    {/* RIGHT — Actions */}
                    <div className="flex items-center gap-1 shrink-0 ml-1 mb-1">
                        {/* Mic button */}
                        <button
                            type="button"
                            onClick={toggleListening}
                            disabled={disabled || isProcessingAttachment}
                            className={cn(
                                "flex items-center justify-center h-10 w-10 rounded-full transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                                isActive ? "max-md:hidden" : "",
                                isListening
                                    ? "bg-red-500/10 text-red-500 animate-pulse"
                                    : isIncognito
                                        ? "text-slate-400 hover:text-slate-200 hover:bg-white/8"
                                        : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10"
                            )}
                            aria-label={isListening ? "Stop voice input" : "Voice input"}
                        >
                            {isListening ? <MdMicOff className="text-[22px]" /> : <MdMic className="text-[22px]" />}
                        </button>

                        {/* Talk button */}
                        <button
                            type="button"
                            onClick={props.onVoiceToggle}
                            disabled={disabled || isProcessingAttachment}
                            className={cn(
                                "flex items-center justify-center h-10 w-10 rounded-full transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                                isActive ? "max-md:hidden" : "",
                                isIncognito
                                    ? "text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10"
                                    : "text-zinc-400 hover:text-accent hover:bg-accent/10"
                            )}
                            aria-label="Talk mode"
                        >
                            <MdGraphicEq className="text-[22px]" />
                        </button>

                        {/* Send button */}
                        <button
                            type="submit"
                            disabled={!canSend}
                            className={cn(
                                "flex items-center justify-center h-10 w-10 rounded-full transition-all duration-200 active:scale-95",
                                !isActive ? "max-md:hidden" : "",
                                canSend
                                    ? "bg-accent text-white shadow-md shadow-accent/30 hover:bg-accent/90 hover:scale-105 cursor-pointer"
                                    : "bg-zinc-100 text-zinc-400 dark:bg-white/5 dark:text-zinc-600 cursor-not-allowed"
                            )}
                            aria-label="Send message"
                            title={isProcessingAttachment ? "Please wait for file to finish processing" : "Send message"}
                        >
                            <MdSend className="text-[20px] ml-0.5" />
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
});

ChatInput.displayName = "ChatInput";
