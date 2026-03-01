import * as React from "react";
import { cn } from "../../lib/utils";

const Card = React.forwardRef(({ className, children, spotlight = true, ...props }, ref) => {
    const divRef = React.useRef(null);
    const [position, setPosition] = React.useState({ x: 0, y: 0 });
    const [opacity, setOpacity] = React.useState(0);

    const handleMouseMove = (e) => {
        if (!divRef.current || !spotlight) return;

        const rect = divRef.current.getBoundingClientRect();
        setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    const handleFocus = () => {
        setOpacity(1);
    };

    const handleBlur = () => {
        setOpacity(0);
    };

    const handleMouseEnter = () => {
        setOpacity(1);
    };

    const handleMouseLeave = () => {
        setOpacity(0);
    };

    return (
        <div
            ref={divRef}
            onMouseMove={handleMouseMove}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={cn(
                "relative overflow-hidden transition-all duration-300",
                // Light Mode (Neumorphism: Lifted -> Submerged/Pressed on Hover)
                "rounded-[32px] bg-background-base border border-black/5 shadow-neu hover:shadow-neu-pressed hover:translate-y-1",
                // Dark Mode (Linear / Glass)
                "dark:rounded-2xl dark:border dark:border-white/5 dark:bg-gradient-to-b dark:from-white/[0.08] dark:to-white/[0.02] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4),0_0_40px_rgba(0,0,0,0.2)] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_8px_40px_rgba(0,0,0,0.5),0_0_80px_rgba(94,106,210,0.1)]",
                className
            )}
            {...props}
        >
            {spotlight && (
                <div
                    className="pointer-events-none absolute -inset-px opacity-0 transition duration-300"
                    style={{
                        opacity,
                        background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(94,106,210,0.15), transparent 40%)`,
                    }}
                />
            )}
            <div className="relative h-full">{children}</div>
        </div >
    );
});

Card.displayName = "Card";

export { Card };
