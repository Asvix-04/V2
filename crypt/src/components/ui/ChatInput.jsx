import * as React from "react";
import { cn } from "../../lib/utils";
import { MdSend, MdAttachFile, MdMic, MdMicOff, MdGraphicEq } from "react-icons/md";
import api from "../../lib/api";

// Maximum height before the textarea stops growing and scrolls internally.
// 200px ≈ ~8 lines at 14px — matches ChatGPT / Claude behaviour.
const MAX_HEIGHT = 200;

export const ChatInput = React.forwardRef(({ className, onSend, disabled, initialValue = "", onChangeText, isIncognito, ...props }, ref) => {
    const [value, setValue] = React.useState(initialValue);
    const [isListening, setIsListening] = React.useState(false);
    const [isUploading, setIsUploading] = React.useState(false);
    const [isFocused, setIsFocused] = React.useState(false);

    // Internal ref used for height measurement.
    const internalRef = React.useRef(null);
    const recognitionRef = React.useRef(null);
    const fileInputRef = React.useRef(null);

    const hasText = value.trim().length > 0;
    // Show send button instead of mic+talk when user is actively typing or focused with text
    const isActive = isFocused || hasText;
    // Responsive placeholder — short on mobile, full on desktop
    const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < 768;
    const activePlaceholder = isMobileScreen
        ? "Message..."
        : (props.placeholder || "Ask a question...");

    // ── Auto-resize ─────────────────────────────────────────────────────────
    // useLayoutEffect fires synchronously before paint, eliminating flicker.
    // Re-runs on every value change so height tracks content in both directions.
    React.useLayoutEffect(() => {
        const el = internalRef.current;
        if (!el) return;
        // 1. Reset so scrollHeight reflects natural content height, not the
        //    previously set style.height — required for the element to shrink.
        el.style.height = "auto";
        // 2. Measure.
        const scrollH = el.scrollHeight;
        // 3. Clamp and apply.
        el.style.height = `${Math.min(scrollH, MAX_HEIGHT)}px`;
        // 4. Only show a scrollbar once content exceeds the cap.
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
        const formData = new FormData();
        formData.append('file', file);
        setIsUploading(true);
        try {
            const res = await api.post('/chat/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5001/api').replace('/api', '');
            setValue((prev) => prev + (prev ? "\n" : "") + `[File: ${file.name}](${baseUrl}${res.data.url})`);
        } catch { alert("Failed to upload file"); }
        finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (disabled) return;
        if (value.trim() && onSend) { onSend(value); setValue(""); }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className={cn(
                // items-end keeps the attach / send buttons anchored to the
                // bottom of the pill as the textarea grows — matching ChatGPT.
                // py-2 provides the vertical rhythm; the textarea's py-3 adds
                // internal spacing so single-line text sits centred.
                "flex items-end w-full px-3 py-2 transition-all duration-200",
                "min-h-[56px] rounded-[2rem]",
                isIncognito
                    // Incognito: dark steel-gray, matches incognito surface
                    ? "border focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.12)]"
                    : [
                        // Light
                        "bg-white border border-zinc-200 shadow-sm focus-within:border-accent/50 focus-within:shadow-[0_0_0_3px_rgba(94,106,210,0.08)]",
                        // Dark
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

            {/* LEFT — Attach: mb-1 gives the icon the same optical bottom gap
                as the textarea's py-3 so the baseline aligns on single-line. */}
            <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || disabled}
                className={cn(
                    "shrink-0 flex items-center justify-center h-10 w-10 rounded-full transition-all duration-150 active:scale-95 mb-1",
                    isIncognito
                        ? "text-slate-400 hover:text-slate-200 hover:bg-white/8"
                        : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10",
                    isUploading && "animate-pulse opacity-60"
                )}
                aria-label="Attach file"
            >
                <MdAttachFile className="text-[22px] rotate-45" />
            </button>

            {/* CENTER — Auto-growing textarea.
                - rows={1} sets the browser intrinsic height; useLayoutEffect
                  immediately overrides it with scrollHeight.
                - max-h-* removed — JS is the sole height authority.
                - py-3 centres single-line text inside the 56px pill.
                - overflowY is applied directly via the ref (hidden / auto). */}
            <textarea
                ref={setRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={(e) => { setIsFocused(true); props.onFocus?.(e); }}
                onBlur={(e) => { setIsFocused(false); props.onBlur?.(e); }}
                placeholder={isFocused ? activePlaceholder : ""}
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

            {/* RIGHT — Mic + Talk (idle) OR Send (active).
                mb-1 mirrors the attach button baseline. */}
            <div className="flex items-center gap-1 shrink-0 ml-1 mb-1">
                {/* Mic button — show when not active on mobile, always on desktop */}
                <button
                    type="button"
                    onClick={toggleListening}
                    disabled={disabled}
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

                {/* Talk button — show when not active on mobile, always on desktop */}
                <button
                    type="button"
                    onClick={props.onVoiceToggle}
                    disabled={disabled}
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

                {/* Send button — show when active on mobile, always on desktop */}
                <button
                    type="submit"
                    disabled={!hasText || disabled}
                    className={cn(
                        "flex items-center justify-center h-10 w-10 rounded-full transition-all duration-200 active:scale-95",
                        // Mobile: only show when active
                        !isActive ? "max-md:hidden" : "",
                        hasText
                            ? "bg-accent text-white shadow-md shadow-accent/30 hover:bg-accent/90 hover:scale-105"
                            : "bg-zinc-100 text-zinc-400 dark:bg-white/5 dark:text-zinc-600 cursor-not-allowed"
                    )}
                    aria-label="Send message"
                >
                    <MdSend className="text-[20px] ml-0.5" />
                </button>
            </div>
        </form>
    );
});

ChatInput.displayName = "ChatInput";
