import * as React from "react";
import { cn } from "../../lib/utils";

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
    return (
        <input
            type={type}
            className={cn(
                "flex h-10 w-full rounded-lg border px-3 py-2 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                // Light Mode
                "bg-white border-black/10 text-foreground placeholder:text-gray-400 focus-visible:ring-accent/50 focus-visible:ring-offset-white shadow-sm",
                // Dark Mode
                "dark:bg-[#0F0F12] dark:border-white/10 dark:text-foreground dark:placeholder:text-foreground-subtle dark:focus-visible:ring-accent/50 dark:focus-visible:ring-offset-background-base",
                className
            )}
            ref={ref}
            {...props}
        />
    );
});
Input.displayName = "Input";

export { Input };
