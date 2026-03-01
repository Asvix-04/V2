import * as React from "react";
import { Button } from "./Button";
import { cn } from "../../lib/utils";
import { MdSend, MdAttachFile, MdMic, MdMicOff, MdGraphicEq } from "react-icons/md";
import { Edit2, X, Check } from "lucide-react";

import api from "../../lib/api";

export const ChatInput = React.forwardRef(({ className, onSend, disabled, ...props }, ref) => {
    const [value, setValue] = React.useState("");
    const [isListening, setIsListening] = React.useState(false);
    const [isUploading, setIsUploading] = React.useState(false);
    const [isEditMode, setIsEditMode] = React.useState(false);
    const [editValue, setEditValue] = React.useState("");
    const textareaRef = React.useRef(null);
    const editTextareaRef = React.useRef(null);
    const recognitionRef = React.useRef(null);
    const fileInputRef = React.useRef(null);

    React.useEffect(() => {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;

            recognitionRef.current.onresult = (event) => {
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    }
                }
                if (finalTranscript) {
                    setValue((prev) => prev + (prev ? " " : "") + finalTranscript);
                }
            };

            recognitionRef.current.onerror = (event) => {
                console.error("Speech recognition error", event.error);
                setIsListening(false);
            };

            recognitionRef.current.onend = () => {
                // Auto-restart if we didn't manually stop? No, manual toggle is better UX for this context.
                // setIsListening(false); 
            };
        }
    }, []);

    const toggleListening = () => {
        if (!recognitionRef.current) return;

        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            recognitionRef.current.start();
            setIsListening(true);
        }
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
            // Append file link to input
            const fileLink = `[File: ${file.name}](${import.meta.env.VITE_API_URL || 'http://localhost:5001/api'}${res.data.url})`;

            // Clean URL construction - removing /api if double (since backend returns /uploads/...)
            // Actually, backend returns /uploads/filename. We need to point to server root /uploads
            // API_URL usually points to /api. So we might need BASE_URL.
            // Let's assume standard local setup: http://localhost:5001/uploads/...
            const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5001/api').replace('/api', '');
            const finalLink = `[File: ${file.name}](${baseUrl}${res.data.url})`;

            setValue((prev) => prev + (prev ? "\n" : "") + finalLink);
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
        if (value.trim() && onSend) {
            onSend(value);
            setValue("");
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const openEditMode = () => {
        setEditValue(value);
        setIsEditMode(true);
        setTimeout(() => {
            editTextareaRef.current?.focus();
        }, 0);
    };

    const closeEditMode = () => {
        setIsEditMode(false);
        setEditValue("");
    };

    const saveEdit = () => {
        if (editValue.trim()) {
            setValue(editValue.trim());
            closeEditMode();
        }
    };

    const handleEditKeyDown = (e) => {
        if (e.key === "Enter" && e.ctrlKey) {
            e.preventDefault();
            saveEdit();
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className={cn(
                "relative flex items-end w-full p-2 rounded-[50px] transition-all duration-300",
                // Light Mode
                "bg-white border border-black/10 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] focus-within:shadow-[0_4px_25px_-5px_rgba(94,106,210,0.15)] focus-within:border-accent/40",
                // Dark Mode
                "dark:bg-[#1a1a1f] dark:border-white/5 dark:shadow-none dark:focus-within:bg-[#202025] dark:focus-within:border-white/10",
                className
            )}
        >
            {/* Edit Modal */}
            {isEditMode && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-[#1a1a1f] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 w-full max-w-2xl max-h-[80vh] flex flex-col mx-4">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-black/10 dark:border-white/10">
                            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                                <Edit2 className="h-5 w-5 text-accent" />
                                Edit Your Message
                            </h2>
                            <button
                                type="button"
                                onClick={closeEditMode}
                                className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="h-5 w-5 text-foreground-muted" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 overflow-auto p-6">
                            <textarea
                                ref={editTextareaRef}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={handleEditKeyDown}
                                className="w-full h-full min-h-[300px] bg-gray-50 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-base text-foreground focus:ring-2 focus:ring-accent focus:border-transparent outline-none resize-none placeholder:text-foreground-muted"
                                placeholder="Edit your message..."
                            />
                            <p className="text-xs text-foreground-muted mt-3">
                                💡 Tip: Press <kbd className="px-2 py-1 bg-black/5 dark:bg-white/10 rounded text-accent font-mono text-xs">Ctrl + Enter</kbd> to save
                            </p>
                        </div>

                        {/* Modal Footer */}
                        <div className="flex items-center justify-end gap-3 p-6 border-t border-black/10 dark:border-white/10 bg-gray-50/50 dark:bg-white/5">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={closeEditMode}
                                className="gap-2"
                            >
                                <X className="h-4 w-4" />
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={saveEdit}
                                disabled={!editValue.trim()}
                                className="gap-2 bg-accent hover:bg-accent-bright text-white"
                            >
                                <Check className="h-4 w-4" />
                                Save Changes
                            </Button>
                        </div>
                    </div>
                </div>
            )}

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
                className={cn("h-12 w-12 mr-2 text-foreground-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 shrink-0 !rounded-full transition-all", isUploading && "animate-pulse")}
            >
                <MdAttachFile size={30} className="rotate-45" />
            </Button>

            <textarea
                ref={ref || textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                className="flex-1 w-full bg-transparent border-0 px-2 py-3 text-base text-foreground focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none resize-none max-h-32 placeholder:text-gray-400 dark:placeholder:text-foreground-subtle"
                style={{ minHeight: "24px" }}
                disabled={disabled}
                {...props}
            />

            <div className="flex items-center space-x-2 ml-2 shrink-0">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={openEditMode}
                    disabled={!value.trim() || disabled}
                    title="Edit message"
                    className={cn(
                        "h-12 w-12 !rounded-full transition-all",
                        value.trim()
                            ? "text-foreground-muted hover:text-accent hover:bg-accent/10"
                            : "text-foreground-muted/50 cursor-not-allowed"
                    )}
                >
                    <Edit2 size={24} />
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={props.onVoiceToggle}
                    title="Voice Mode"
                    className="h-12 w-12 text-foreground-muted hover:text-accent hover:bg-accent/10 shrink-0 !rounded-full transition-all"
                >
                    <MdGraphicEq size={30} />
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={toggleListening}
                    className={cn(
                        "h-12 w-12 !rounded-full transition-all",
                        isListening
                            ? "bg-red-500/10 text-red-500 animate-pulse hover:bg-red-500/20"
                            : "text-foreground-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                    )}
                >
                    {isListening ? <MdMicOff size={30} /> : <MdMic size={30} />}
                </Button>

                <Button
                    type="submit"
                    disabled={!value.trim() || disabled}
                    size="icon"
                    className={cn(
                        "h-12 w-12 !rounded-full transition-all duration-200",
                        value.trim()
                            ? "bg-accent hover:bg-accent-bright text-white shadow-lg shadow-accent/30 hover:shadow-accent/40 hover:scale-105"
                            : "bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-foreground-muted"
                    )}
                >
                    <MdSend size={28} className="ml-1" />
                </Button>
            </div>
        </form>
    );
});

ChatInput.displayName = "ChatInput";
