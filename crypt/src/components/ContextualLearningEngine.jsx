import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import {
    Sparkles,
    MessageCircle,
    Search,
    Database,
    Brain,
    CheckCircle2,
    Zap,
    Globe,
    BookOpen,
    ShieldCheck,
    Timer,
    ArrowRight,
} from "lucide-react";
import { Button } from "./ui/Button";

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */

const techPills = [
    { label: "Vector Search" },
    { label: "Academic Sources" },
    { label: "AI Reasoning" },
    { label: "Context Aware" },
    { label: "RAG Pipeline" },
];

const pipelineNodes = [
    {
        icon: MessageCircle,
        title: "User Question",
        desc: "Natural language input in any supported language.",
        color: "from-violet-500/20 to-purple-500/10",
        iconColor: "text-violet-500 dark:text-violet-400",
        borderColor: "border-violet-200/60 dark:border-violet-500/25",
        glowColor: "shadow-violet-500/15",
        dotColor: "bg-violet-400",
    },
    {
        icon: Search,
        title: "Semantic Search",
        desc: "Vector embeddings find the most relevant context.",
        color: "from-blue-500/20 to-indigo-500/10",
        iconColor: "text-blue-500 dark:text-blue-400",
        borderColor: "border-blue-200/60 dark:border-blue-500/25",
        glowColor: "shadow-blue-500/15",
        dotColor: "bg-blue-400",
    },
    {
        icon: Database,
        title: "Knowledge Base",
        desc: "1M+ curated academic sources, verified and indexed.",
        color: "from-emerald-500/20 to-teal-500/10",
        iconColor: "text-emerald-500 dark:text-emerald-400",
        borderColor: "border-emerald-200/60 dark:border-emerald-500/25",
        glowColor: "shadow-emerald-500/15",
        dotColor: "bg-emerald-400",
    },
    {
        icon: Brain,
        title: "AI Reasoning",
        desc: "Multi-step reasoning chains for deep comprehension.",
        color: "from-purple-500/20 to-pink-500/10",
        iconColor: "text-purple-500 dark:text-purple-400",
        borderColor: "border-purple-200/60 dark:border-purple-500/25",
        glowColor: "shadow-purple-500/15",
        dotColor: "bg-purple-400",
    },
    {
        icon: CheckCircle2,
        title: "Accurate Answer",
        desc: "Verified, grounded response with cited sources.",
        color: "from-amber-500/20 to-orange-500/10",
        iconColor: "text-amber-500 dark:text-amber-400",
        borderColor: "border-amber-200/60 dark:border-amber-500/25",
        glowColor: "shadow-amber-500/15",
        dotColor: "bg-amber-400",
    },
];

const metrics = [
    {
        value: "210ms",
        label: "Avg Response",
        icon: Timer,
        iconColor: "text-violet-500 dark:text-violet-400",
        bg: "from-violet-500/10 to-purple-500/5",
        border: "border-violet-200/50 dark:border-violet-500/20",
        glow: "hover:shadow-violet-500/10",
    },
    {
        value: "97%",
        label: "Accuracy Rate",
        icon: CheckCircle2,
        iconColor: "text-emerald-500 dark:text-emerald-400",
        bg: "from-emerald-500/10 to-teal-500/5",
        border: "border-emerald-200/50 dark:border-emerald-500/20",
        glow: "hover:shadow-emerald-500/10",
    },
    {
        value: "12+",
        label: "Languages",
        icon: Globe,
        iconColor: "text-blue-500 dark:text-blue-400",
        bg: "from-blue-500/10 to-indigo-500/5",
        border: "border-blue-200/50 dark:border-blue-500/20",
        glow: "hover:shadow-blue-500/10",
    },
    {
        value: "1M+",
        label: "Academic Sources",
        icon: BookOpen,
        iconColor: "text-amber-500 dark:text-amber-400",
        bg: "from-amber-500/10 to-orange-500/5",
        border: "border-amber-200/50 dark:border-amber-500/20",
        glow: "hover:shadow-amber-500/10",
    },
    {
        value: "100%",
        label: "Privacy Protected",
        icon: ShieldCheck,
        iconColor: "text-pink-500 dark:text-pink-400",
        bg: "from-pink-500/10 to-rose-500/5",
        border: "border-pink-200/50 dark:border-pink-500/20",
        glow: "hover:shadow-pink-500/10",
    },
];

/* ─────────────────────────────────────────────
   ANIMATION VARIANTS
───────────────────────────────────────────── */

const fadeSlideUp = {
    hidden: { opacity: 0, y: 24 },
    visible: (delay = 0) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] },
    }),
};

const staggerContainer = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.07 } },
};

const pillVariant = {
    hidden: { opacity: 0, scale: 0.88, y: 10 },
    visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
    },
};

const nodeVariant = (i) => ({
    hidden: { opacity: 0, x: -12 },
    visible: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.5, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] },
    },
});

/* ─────────────────────────────────────────────
   ANIMATED CONNECTOR
───────────────────────────────────────────── */
function Connector({ reducedMotion }) {
    return (
        <div className="relative flex items-center justify-center my-0 py-1.5 select-none" aria-hidden="true">
            <div className="absolute left-1/2 -translate-x-1/2 w-px h-full bg-gradient-to-b from-slate-200 dark:from-white/10 to-transparent" />
            {!reducedMotion && (
                <motion.div
                    className="relative z-10 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_6px_2px_rgba(94,106,210,0.55)]"
                    animate={{ y: [0, 20, 0], opacity: [0, 1, 0] }}
                    transition={{
                        duration: 1.8,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                />
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────
   PIPELINE NODE
───────────────────────────────────────────── */
function PipelineNode({ node, index, reducedMotion }) {
    const Icon = node.icon;
    return (
        <motion.div
            variants={nodeVariant(index)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className={`group flex items-start gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-2xl
                bg-gradient-to-br ${node.color}
                border ${node.borderColor}
                hover:shadow-lg ${node.glowColor}
                transition-all duration-300 hover:-translate-y-0.5`}
        >
            <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
                    bg-white/70 dark:bg-white/5 border ${node.borderColor}
                    group-hover:scale-105 transition-transform duration-300`}
            >
                <Icon className={`h-[18px] w-[18px] ${node.iconColor}`} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground leading-snug">
                    {node.title}
                </p>
                <p className="text-xs text-foreground-muted leading-relaxed mt-0.5">
                    {node.desc}
                </p>
            </div>
            <span
                className={`ml-auto mt-1 shrink-0 w-2 h-2 rounded-full ${node.dotColor}
                    ${!reducedMotion ? "animate-pulse" : ""} opacity-75`}
            />
        </motion.div>
    );
}

/* ─────────────────────────────────────────────
   METRIC CARD
───────────────────────────────────────────── */
function MetricCard({ metric, index }) {
    const Icon = metric.icon;
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: index * 0.08 }}
            whileHover={{ y: -3, scale: 1.02 }}
            className={`group relative flex flex-col items-start gap-3 p-4 sm:p-5 rounded-2xl
                bg-gradient-to-br ${metric.bg}
                border ${metric.border}
                backdrop-blur-sm
                hover:shadow-xl ${metric.glow}
                transition-all duration-300 cursor-default select-none`}
        >
            <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100
                    transition-opacity duration-300
                    bg-gradient-to-br from-white/5 to-transparent pointer-events-none"
            />
            <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl
                    bg-white/70 dark:bg-white/5
                    border ${metric.border}
                    group-hover:scale-110 transition-transform duration-300`}
            >
                <Icon className={`h-[18px] w-[18px] ${metric.iconColor}`} />
            </div>
            <div>
                <p className="text-2xl font-bold text-foreground tracking-tight leading-none">
                    {metric.value}
                </p>
                <p className="text-xs text-foreground-muted mt-1 font-medium">
                    {metric.label}
                </p>
            </div>
        </motion.div>
    );
}

/* ─────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────── */
export function ContextualLearningEngine() {
    const reducedMotion = useReducedMotion();

    return (
        <>
            {/* ═══════════════════════════════════════
                HOW IT WORKS
            ═══════════════════════════════════════ */}
            <section
                id="how-it-works"
                aria-labelledby="cle-heading"
                className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
            >
                {/* Section pill label */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="mb-10 sm:mb-12 flex justify-center"
                >
                    <div
                        className="inline-flex items-center gap-2 rounded-full
                            border border-accent/20 bg-accent/5
                            px-3 py-1 text-[11px] font-mono text-accent"
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        How It Works
                    </div>
                </motion.div>

                {/* Two-column layout */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6 lg:gap-8 xl:gap-12 items-start">

                    {/* LEFT PANEL */}
                    <div className="flex flex-col gap-8">

                        {/* Glass header card */}
                        <motion.div
                            initial={{ opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-60px" }}
                            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                            className="relative rounded-3xl overflow-hidden
                                border border-slate-200/80 dark:border-white/8
                                bg-gradient-to-br from-white to-slate-50/60
                                dark:from-white/[0.04] dark:to-white/[0.01]
                                p-6 sm:p-8
                                shadow-[0_4px_32px_rgba(94,106,210,0.06)]
                                dark:shadow-[0_4px_32px_rgba(0,0,0,0.3)]"
                        >
                            {/* Light mode ambient blobs */}
                            <div className="block dark:hidden absolute -top-12 -right-12 w-40 h-40 rounded-full bg-accent/8 blur-3xl pointer-events-none" />
                            <div className="block dark:hidden absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-purple-400/6 blur-3xl pointer-events-none" />
                            {/* Dark mode purple glow */}
                            <div className="hidden dark:block absolute -top-12 -right-12 w-52 h-52 rounded-full bg-accent/5 blur-3xl pointer-events-none" />

                            {/* AI badge */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.85 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4 }}
                                className="inline-flex items-center gap-1.5 rounded-full
                                    border border-accent/25 bg-accent/8 dark:bg-accent/10
                                    px-3 py-1 text-[10px] font-mono text-accent-bright mb-5"
                            >
                                <Sparkles className="h-3 w-3" />
                                AI Powered
                            </motion.div>

                            {/* Heading */}
                            <motion.h2
                                id="cle-heading"
                                custom={0}
                                variants={fadeSlideUp}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-[1.1] text-foreground mb-3"
                            >
                                Contextual{" "}
                                <span
                                    className="bg-clip-text text-transparent
                                        bg-gradient-to-br from-indigo-700 via-purple-700 to-indigo-800
                                        dark:from-[#5E6AD2] dark:via-[#8b5cf6] dark:to-[#4F46E5]"
                                    style={{ backgroundSize: "200% 200%", animation: "gradient-shift 5s ease infinite" }}
                                >
                                    Learning Engine
                                </span>
                            </motion.h2>

                            {/* Description */}
                            <motion.p
                                custom={0.08}
                                variants={fadeSlideUp}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                className="text-foreground-muted leading-relaxed max-w-xl mb-6 text-sm sm:text-base"
                            >
                                DigiLab doesn't just answer questions—it understands them.
                                Our RAG-powered pipeline retrieves verified academic context,
                                reasons across it, and delivers precise, grounded answers
                                at sub-second speed.
                            </motion.p>

                            {/* Tech pills */}
                            <motion.div
                                variants={staggerContainer}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                className="flex flex-wrap gap-2"
                            >
                                {techPills.map((pill) => (
                                    <motion.span
                                        key={pill.label}
                                        variants={pillVariant}
                                        className="inline-flex items-center rounded-full
                                            border border-slate-200/80 dark:border-white/10
                                            bg-white/80 dark:bg-white/5
                                            backdrop-blur-sm
                                            px-3 py-1 text-xs font-medium
                                            text-foreground-muted
                                            hover:border-accent/40 hover:text-accent
                                            hover:bg-accent/5
                                            transition-all duration-200 cursor-default select-none"
                                    >
                                        {pill.label}
                                    </motion.span>
                                ))}
                            </motion.div>
                        </motion.div>

                        {/* AI Pipeline */}
                        <div className="flex flex-col gap-0.5">
                            <motion.p
                                initial={{ opacity: 0, y: 12 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5 }}
                                className="text-[10px] font-mono text-foreground-muted/60 uppercase tracking-widest mb-3 pl-1"
                            >
                                Processing Pipeline
                            </motion.p>

                            <div className="flex flex-col gap-0">
                                {pipelineNodes.map((node, i) => (
                                    <div key={node.title}>
                                        <PipelineNode
                                            node={node}
                                            index={i}
                                            reducedMotion={reducedMotion}
                                        />
                                        {i < pipelineNodes.length - 1 && (
                                            <Connector reducedMotion={reducedMotion} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT PANEL — Metric Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 lg:gap-4 lg:sticky lg:top-24 self-start">
                        {metrics.map((m, i) => (
                            <MetricCard key={m.label} metric={m} index={i} />
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════
                PREMIUM CTA
            ═══════════════════════════════════════ */}
            <section
                aria-label="Call to action"
                className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8"
            >
                <motion.div
                    initial={{ opacity: 0, y: 28 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                    className="relative overflow-hidden rounded-3xl
                        border border-accent/20 dark:border-accent/15
                        bg-gradient-to-br
                            from-white via-slate-50/80 to-white
                            dark:from-white/[0.04] dark:via-accent/[0.03] dark:to-white/[0.01]
                        shadow-[0_8px_48px_rgba(94,106,210,0.10)]
                        dark:shadow-[0_8px_48px_rgba(94,106,210,0.08)]
                        px-6 py-12 sm:px-12 sm:py-16
                        text-center"
                >
                    <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-72 h-36 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
                    <div className="block dark:hidden absolute -bottom-12 -right-12 w-48 h-48 rounded-full bg-purple-400/8 blur-3xl pointer-events-none" />
                    <div className="hidden dark:block absolute -bottom-12 -right-12 w-48 h-48 rounded-full bg-accent/5 blur-3xl pointer-events-none" />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

                    <div className="relative z-10 flex flex-col items-center gap-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.85 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4 }}
                            className="inline-flex items-center gap-2 rounded-full
                                border border-accent/25 bg-accent/8 dark:bg-accent/10
                                px-3 py-1 text-[10px] font-mono text-accent"
                        >
                            <Zap className="h-3 w-3" />
                            Get Started Today
                        </motion.div>

                        <motion.h2
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: 0.06 }}
                            className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight
                                text-foreground max-w-xl leading-[1.15]"
                        >
                            Ready to transform{" "}
                            <span
                                className="bg-clip-text text-transparent
                                    bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800
                                    dark:from-[#5E6AD2] dark:via-[#8b5cf6] dark:to-[#4F46E5]"
                                style={{ backgroundSize: "200% 200%", animation: "gradient-shift 5s ease infinite" }}
                            >
                                your learning?
                            </span>
                        </motion.h2>

                        <motion.p
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.12 }}
                            className="text-foreground-muted text-sm sm:text-base max-w-sm leading-relaxed"
                        >
                            Join thousands of students already using DigiLab to learn
                            faster, understand deeper, and achieve more.
                        </motion.p>

                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.18 }}
                            className="flex flex-col sm:flex-row items-center gap-3 mt-2"
                        >
                            <Link to="/signup">
                                <motion.div
                                    whileHover={{ scale: 1.03, y: -2 }}
                                    whileTap={{ scale: 0.97 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                >
                                    <Button
                                        size="lg"
                                        className="h-12 px-8 text-sm font-semibold
                                            bg-accent hover:bg-accent-bright text-white
                                            shadow-[0_4px_24px_rgba(94,106,210,0.35)]
                                            hover:shadow-[0_8px_32px_rgba(94,106,210,0.5)]
                                            dark:shadow-[0_0_0_1px_rgba(94,106,210,0.4),0_4px_12px_rgba(94,106,210,0.25)]
                                            transition-all duration-300 rounded-2xl border-0"
                                    >
                                        <Sparkles className="mr-2 h-4 w-4" />
                                        Get Started Free
                                    </Button>
                                </motion.div>
                            </Link>

                            <Link to="/chat">
                                <motion.div
                                    whileHover={{ scale: 1.03, y: -2 }}
                                    whileTap={{ scale: 0.97 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                >
                                    <Button
                                        variant="secondary"
                                        size="lg"
                                        className="h-12 px-7 text-sm font-medium
                                            border border-border-base dark:border-white/10
                                            hover:border-accent/40
                                            bg-white/70 dark:bg-white/5
                                            hover:bg-accent/5 dark:hover:bg-white/8
                                            text-foreground-muted hover:text-accent
                                            shadow-sm hover:shadow-[0_4px_20px_rgba(94,106,210,0.12)]
                                            transition-all duration-300 rounded-2xl"
                                    >
                                        Try the Chat
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </motion.div>
                            </Link>
                        </motion.div>

                        <motion.p
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.28 }}
                            className="text-[11px] text-foreground-muted/60 font-mono mt-1 select-none"
                        >
                            No credit card required · Always free
                        </motion.p>
                    </div>
                </motion.div>
            </section>
        </>
    );
}
