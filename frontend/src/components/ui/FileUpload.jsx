import * as React from "react";
import { cn } from "../../lib/utils";
import { UploadCloud, CheckCircle, Loader2 } from "lucide-react";

export function FileUpload({ className, onUpload, ...props }) {
    const [dragActive, setDragActive] = React.useState(false);
    const [isUploading, setIsUploading] = React.useState(false);
    const [isSuccess, setIsSuccess] = React.useState(false);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const processFiles = async (files) => {
        if (!files || files.length === 0) return;

        setIsUploading(true);

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (onUpload) {
            onUpload(files);
        }

        setIsUploading(false);
        setIsSuccess(true);

        // Reset success state
        setTimeout(() => {
            setIsSuccess(false);
        }, 2000);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const newFiles = Array.from(e.dataTransfer.files);
            processFiles(newFiles);
        }
    };

    const handleChange = (e) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            const newFiles = Array.from(e.target.files);
            processFiles(newFiles);
        }
    };

    return (
        <div className={cn("w-full", className)} {...props}>
            <div
                className={cn(
                    "relative flex flex-col items-center justify-center w-full h-48 rounded-xl border-2 border-dashed transition-all duration-200",
                    dragActive
                        ? "border-accent bg-accent/10"
                        : "border-white/10 bg-white/5 hover:bg-white/[0.07] hover:border-white/20",
                    isSuccess && "border-green-500/50 bg-green-500/10"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <input
                    type="file"
                    multiple
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                    onChange={handleChange}
                    disabled={isUploading}
                />

                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center pointer-events-none">
                    <div className={cn(
                        "h-12 w-12 rounded-full flex items-center justify-center mb-3 transition-colors",
                        isSuccess ? "bg-green-500/20 text-green-500" : "bg-surface"
                    )}>
                        {isUploading ? (
                            <Loader2 className="h-6 w-6 text-accent animate-spin" />
                        ) : isSuccess ? (
                            <CheckCircle className="h-6 w-6" />
                        ) : (
                            <UploadCloud className="h-6 w-6 text-accent" />
                        )}
                    </div>

                    <p className="mb-1 text-sm font-medium text-foreground">
                        {isUploading ? (
                            "Uploading..."
                        ) : isSuccess ? (
                            "Upload Complete!"
                        ) : (
                            <>
                                <span className="text-accent hover:underline">Click to upload</span> or drag and drop
                            </>
                        )}
                    </p>
                    <p className="text-xs text-foreground-muted">
                        PDF, DOCX, TXT (Max 10MB)
                    </p>
                </div>
            </div>
        </div>
    );
}
