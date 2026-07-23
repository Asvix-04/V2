import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";
import { Loader2 } from "lucide-react";

const buttonVariants = {
    primary: "bg-accent text-white shadow-neu hover:shadow-neu-hover hover:-translate-y-0.5 active:shadow-neu-pressed active:translate-y-0.5 dark:shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.3),inset_0_1px_0_0_rgba(255,255,255,0.2)] dark:hover:bg-accent-bright dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_0_20px_rgba(94,106,210,0.5)]",
    secondary: "bg-background-base text-foreground shadow-neu hover:shadow-neu-hover hover:-translate-y-0.5 active:shadow-neu-pressed active:translate-y-0.5 dark:bg-surface dark:text-foreground dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] dark:border dark:border-white/5 dark:hover:bg-surface-hover dark:hover:border-white/10",
    ghost: "bg-transparent text-foreground-muted hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5 dark:hover:text-foreground",
};

const Button = React.forwardRef(({
    className,
    variant = "primary",
    size = "default",
    isLoading,
    children,
    ...props
}, ref) => {
    return (
        <motion.button
            ref={ref}
            whileTap={{ scale: 0.98 }}
            className={cn(
                "inline-flex items-center justify-center rounded-2xl text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-50 dark:rounded-lg",
                "h-10 px-4 py-2", // Default size, add more if needed
                buttonVariants[variant],
                className
            )}
            {...props}
        >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {children}
        </motion.button>
    );
});

Button.displayName = "Button";

export { Button };
