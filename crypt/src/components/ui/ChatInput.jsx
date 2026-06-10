import * as React from "react";
import { cn } from "../../lib/utils";
import { MdSend, MdAttachFile, MdMic, MdMicOff, MdGraphicEq } from "react-icons/md";
import api from "../../lib/api";

export const ChatInput = React.forwardRef(({ className, onSend, disabled, ...props }, ref) => {
    const [value, setValue] = React.useState("");
    const [isListening, setIsListening] = React.useState(false);
    const [isUploading, setIsUploading] = React.useState(false);
    const [isFocused, setIsFocused] = React.useState(false);

    const textareaRef = React.useRef(null);
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
        if (value.trim() && onSend) { onSend(value); setValue(""); }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className={cn(
                // The single pill — always one shape, no layout changes
                "flex items-center w-full px-3 transition-all duration-200",
                "min-h-[56px] rounded-[2rem]",
                // Light
                "bg-white border border-zinc-200 shadow-sm focus-within:border-accent/50 focus-within:shadow-[0_0_0_3px_rgba(94,106,210,0.08)]",
                // Dark
                "dark:bg-zinc-900 dark:border-white/10 dark:focus-within:border-accent/40 dark:focus-within:shadow-[0_0_0_3px_rgba(94,106,210,0.06)]",
                className
            )}
        >
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

            {/* LEFT — Attach */}
            <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || disabled}
                className={cn(
                    "shrink-0 flex items-center justify-center h-10 w-10 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 transition-all duration-150 active:scale-95",
                    isUploading && "animate-pulse opacity-60"
                )}
                aria-label="Attach file"
            >
                <MdAttachFile className="text-[22px] rotate-45" />
            </button>

            {/* CENTER — Text input (transparent, always present as tap target) */}
            <textarea
                ref={ref || textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={(e) => { setIsFocused(true); props.onFocus?.(e); }}
                onBlur={(e) => { setIsFocused(false); props.onBlur?.(e); }}
                placeholder={isFocused ? activePlaceholder : ""}
                rows={1}
                className="flex-1 min-w-0 bg-transparent border-0 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 caret-accent focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none resize-none max-h-32 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 self-center"
                style={{ minHeight: "24px" }}
                disabled={disabled}
            />

            {/* RIGHT — Mic + Talk (idle) OR Send (active) */}
            <div className="flex items-center gap-1 shrink-0 ml-1">
                {/* Mic button — show when not active on mobile, always on desktop */}
                <button
                    type="button"
                    onClick={toggleListening}
                    className={cn(
                        "flex items-center justify-center h-10 w-10 rounded-full transition-all duration-150 active:scale-95",
                        // On mobile: hide when active (focused/typing), show when idle
                        isActive ? "max-md:hidden" : "",
                        isListening
                            ? "bg-red-500/10 text-red-500 animate-pulse"
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
                    className={cn(
                        "flex items-center justify-center h-10 w-10 rounded-full text-zinc-400 hover:text-accent hover:bg-accent/10 transition-all duration-150 active:scale-95",
                        isActive ? "max-md:hidden" : ""
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
