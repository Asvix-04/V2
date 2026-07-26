import { motion } from "framer-motion";

export function Background() {
    return (
        <div className="fixed inset-0 -z-50 h-full w-full overflow-hidden bg-background-base transition-colors duration-300">

            {/* ===== LIGHT MODE BACKGROUND ===== */}
            {/* 1. Subtle radial base tint */}
            <div className="block dark:hidden absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(94,106,210,0.10),transparent)]" />

            {/* 2. Dot grid overlay */}
            <div
                className="block dark:hidden absolute inset-0 opacity-[0.35]"
                style={{
                    backgroundImage: `radial-gradient(circle, #94a3b8 1px, transparent 1px)`,
                    backgroundSize: `28px 28px`,
                    maskImage: `radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)`,
                    WebkitMaskImage: `radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)`,
                }}
            />

            {/* 3. Animated gradient blobs — light mode */}
            <div className="block dark:hidden pointer-events-none">
                {/* Top-left indigo blob */}
                <motion.div
                    animate={{ scale: [1, 1.15, 1], x: [0, 18, 0], y: [0, -20, 0] }}
                    transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -left-24 -top-24 h-[480px] w-[480px] rounded-full"
                    style={{
                        background: "radial-gradient(circle, rgba(94,106,210,0.18) 0%, transparent 70%)",
                        filter: "blur(40px)",
                    }}
                />
                {/* Top-right purple blob */}
                <motion.div
                    animate={{ scale: [1, 1.1, 1], x: [0, -15, 0], y: [0, 25, 0] }}
                    transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                    className="absolute -right-20 -top-16 h-[400px] w-[400px] rounded-full"
                    style={{
                        background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
                        filter: "blur(48px)",
                    }}
                />
                {/* Bottom-center accent blob */}
                <motion.div
                    animate={{ scale: [1, 1.2, 1], x: [0, 10, 0], y: [0, -15, 0] }}
                    transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 4 }}
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[320px] w-[600px] rounded-full"
                    style={{
                        background: "radial-gradient(ellipse, rgba(79,70,229,0.08) 0%, transparent 70%)",
                        filter: "blur(60px)",
                    }}
                />
            </div>

            {/* ===== DARK MODE BACKGROUND (Linear Space / Glass) — UNTOUCHED ===== */}
            {/* 1. Base Gradient */}
            <div className="hidden dark:block absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#0a0a0f] via-[#050506] to-[#020203]" />

            {/* 2. Grid Overlay */}
            <div className="hidden dark:block absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />

            {/* 3. Animated Gradient Blobs */}
            <div className="hidden dark:block">
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        rotate: [0, 180, 360],
                    }}
                    transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: "linear",
                    }}
                    className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl"
                />
                <motion.div
                    animate={{
                        scale: [1, 1.1, 1],
                        rotate: [360, 180, 0],
                    }}
                    transition={{
                        duration: 15,
                        repeat: Infinity,
                        ease: "linear",
                    }}
                    className="absolute -right-32 top-1/2 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl"
                />
            </div>
        </div>
    );
}
