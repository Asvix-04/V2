import { motion } from "framer-motion";

export function Background() {
    return (
        <div className="fixed inset-0 -z-50 h-full w-full overflow-hidden bg-background-base transition-colors duration-300">
            {/* --- DARK MODE BACKGROUND (Linear Space / Glass) --- */}

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
