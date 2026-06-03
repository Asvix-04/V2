import * as React from "react";
import { Button } from "./Button";
import { cn } from "../../lib/utils";
import { MdArrowUpward, MdAttachFile, MdGraphicEq, MdStop } from "react-icons/md";
import { VoiceInputBar } from "./VoiceOverlay";

import api from "../../lib/api";

export const ChatInput = React.forwardRef(({
    className,
    onSend,
    disabled,
    value,
    onValueChange,
    isLLMActive = false,
    onStop,
    voiceControlRef,
    onTranscriptSend,
    responseLanguage = null,
    ...props
}, ref) => {
    const [internalValue, setInternalValue] = React.useState("");
    const [isUploading, setIsUploading] = React.useState(false);
    const [isVoiceModeActive, setIsVoiceModeActive] = React.useState(false);
    const textareaRef = React.useRef(null);
    const fileInputRef = React.useRef(null);
    const voiceDraftRef = React.useRef(false);
    const isControlled = typeof value === "string";
    const inputValue = isControlled ? value : internalValue;

    const setInputValue = (nextValue) => {
        const resolvedValue = typeof nextValue === "function"
            ? nextValue(inputValue)
            : nextValue;

        if (isControlled) {
            onValueChange?.(resolvedValue);
            return;
        }

        setInternalValue(resolvedValue);
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setIsUploading(true);
        try {
            const res = await api.post('/chat/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            // Clean URL construction - removing /api if double (since backend returns /uploads/...)
            // Actually, backend returns /uploads/filename. We need to point to server root /uploads
            // API_URL usually points to /api. So we might need BASE_URL.
            // Let's assume standard local setup: http://localhost:5001/uploads/...
            const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5001/api').replace('/api', '');
            const finalLink = `[File: ${file.name}](${baseUrl}${res.data.url})`;

            setInputValue((prev) => prev + (prev ? "\n" : "") + finalLink);
        } catch (error) {
            console.error("Upload failed", error);
            alert("Failed to upload file");
        } finally {
            setIsUploading(false);
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isLLMActive) return;
        if (inputValue.trim() && onSend) {
            onSend(inputValue, { source: voiceDraftRef.current ? "voice" : "text" });
            voiceDraftRef.current = false;
            setInputValue("");
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className={cn(
                "relative flex items-end w-full py-2 px-3 sm:py-1.5 sm:px-2.5 rounded-full sm:rounded-[2.5rem] transition-all duration-500",
                // Light Mode
                "bg-white/90 backdrop-blur-xl border border-black/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] focus-within:shadow-[0_8px_30px_rgba(94,106,210,0.12)] focus-within:border-accent/40",
                // Dark Mode
                "dark:bg-[#1b1b22]/80 dark:backdrop-blur-2xl dark:border-white/5 dark:shadow-none dark:focus-within:bg-[#20202a]/90 dark:focus-within:border-white/10",
                className
            )}
        >
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
            />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className={cn("h-12 w-12 mr-1 text-foreground-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 shrink-0 !rounded-full transition-all flex items-center justify-center", isUploading && "animate-pulse")}
            >
                <MdAttachFile className="!text-[28px] sm:!text-[32px] rotate-45" />
            </Button>

            {isVoiceModeActive ? (
                <VoiceInputBar
                    ref={voiceControlRef}
                    onTranscriptSend={(text) => {
                        voiceDraftRef.current = true;
                        setInputValue(text);
                        onTranscriptSend?.(text);
                        setIsVoiceModeActive(false);
                    }}
                    onClose={() => setIsVoiceModeActive(false)}
                    responseLanguage={responseLanguage}
                />
            ) : isLLMActive ? (
                <div className="flex min-h-[48px] flex-1 items-center gap-3 px-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
                        <MdGraphicEq className="text-[24px]" />
                    </div>
                    <div className="flex h-8 flex-1 items-center gap-[3px] overflow-hidden">
                        {Array.from({ length: 72 }, (_, index) => (
                            <span
                                key={index}
                                className="w-[3px] shrink-0 animate-pulse rounded-full bg-foreground-muted/70"
                                style={{
                                    height: `${6 + ((index * 7) % 22)}px`,
                                    animationDelay: `${index * 35}ms`,
                                }}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                <textarea
                    ref={ref || textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    rows={1}
                    className="flex-1 w-full bg-transparent border-0 px-2 py-2.5 text-sm sm:text-[15px] text-foreground focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none resize-none max-h-32 placeholder:text-gray-400 dark:placeholder:text-foreground-subtle"
                    style={{ minHeight: "20px" }}
                    readOnly={isLLMActive}
                    disabled={disabled}
                    {...props}
                />
            )}

            <div className="flex items-center space-x-1 ml-1 shrink-0 pb-0.5">
                {!isVoiceModeActive && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsVoiceModeActive(true)}
                        title="Voice Mode"
                        className="h-12 w-12 text-foreground-muted hover:text-accent hover:bg-accent/10 shrink-0 !rounded-full transition-all flex items-center justify-center"
                    >
                        <MdGraphicEq className="!text-[30px] sm:!text-[34px]" />
                    </Button>
                )}

                {isLLMActive ? (
                    <Button
                        type="button"
                        onClick={onStop}
                        size="icon"
                        className="h-12 w-12 !rounded-full transition-all duration-200 flex items-center justify-center bg-accent hover:bg-accent-bright text-white shadow-lg shadow-accent/30"
                        aria-label="Stop response"
                    >
                        <MdStop className="text-[26px] sm:text-[32px]" />
                    </Button>
                ) : (
                    <Button
                        type="submit"
                        disabled={!inputValue.trim() || disabled}
                        size="icon"
                        className={cn(
                            "h-12 w-12 !rounded-full transition-all duration-200 flex items-center justify-center",
                            inputValue.trim()
                                ? "bg-accent hover:bg-accent-bright text-white shadow-lg shadow-accent/30 hover:shadow-accent/40 hover:scale-105"
                                : "bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-foreground-muted"
                        )}
                    >
                        <MdArrowUpward className="text-[26px] sm:text-[32px]" />
                    </Button>
                )}
            </div>
        </form>
    );
});

ChatInput.displayName = "ChatInput";
