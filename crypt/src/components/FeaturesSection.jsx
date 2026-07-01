import { motion } from "framer-motion";
import {
    BrainCircuit,
    FileText,
    BookMarked,
    Globe2,
    Mic2,
    BarChart3,
    ShieldCheck,
    Sparkles,
    CheckCircle,
    TrendingUp,
    Lock,
} from "lucide-react";
import { Card } from "./ui/Card";

/* ─────────────────────────────────────────
   MINI ILLUSTRATIONS
   Compact, tight, opinionated.
   Each one communicates ONE idea clearly.
──────────────────────────────────────── */

function ChatIllustration() {
    return (
        <div className="rounded-xl border border-slate-200/50 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] overflow-hidden select-none">
            {/* Chrome bar */}
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100/80 dark:border-white/[0.05]">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-400/70" />
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400/70" />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
                <div className="ml-auto h-1.5 w-16 rounded-full bg-slate-100 dark:bg-white/8" />
            </div>
            <div className="p-2.5 space-y-2">
                {/* User bubble */}
                <div className="flex justify-end">
                    <div className="bg-accent/12 dark:bg-accent/20 border border-accent/15 rounded-xl rounded-tr-sm px-2.5 py-1.5 text-[9.5px] text-accent font-medium leading-tight max-w-[80%]">
                        Explain quantum entanglement
                    </div>
                </div>
                {/* AI reply */}
                <div className="flex items-start gap-1.5">
                    <div className="w-4 h-4 rounded-full bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="w-2 h-2 text-accent" />
                    </div>
                    <div className="space-y-1 flex-1 pt-0.5">
                        <div className="h-1.5 bg-slate-200/70 dark:bg-white/10 rounded-full w-full" />
                        <div className="h-1.5 bg-slate-200/70 dark:bg-white/10 rounded-full w-5/6" />
                        <div className="h-1.5 bg-slate-200/70 dark:bg-white/10 rounded-full w-4/6" />
                    </div>
                </div>
                {/* Typing dots */}
                <div className="flex items-center gap-1 pl-5">
                    {[0, 150, 300].map((d) => (
                        <div key={d} className="w-1 h-1 rounded-full bg-accent/40 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function NotesIllustration() {
    return (
        <div className="rounded-xl border border-slate-200/50 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] overflow-hidden select-none">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100/80 dark:border-white/[0.05]">
                <div className="w-4 h-4 rounded bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center">
                    <FileText className="w-2.5 h-2.5 text-violet-500" />
                </div>
                <div className="h-1.5 bg-slate-200/70 dark:bg-white/10 rounded-full w-20" />
                <div className="ml-auto px-1.5 py-0.5 rounded text-[7px] font-semibold bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Done</div>
            </div>
            <div className="p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-accent shrink-0" />
                    <div className="h-1.5 bg-accent/25 rounded-full w-full" />
                </div>
                {[0.75, 0.9, 0.65, 0.8].map((w, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-slate-300/80 dark:bg-white/15 shrink-0" />
                        <div className="h-1.5 bg-slate-100/80 dark:bg-white/5 rounded-full" style={{ width: `${w * 100}%` }} />
                    </div>
                ))}
            </div>
        </div>
    );
}

function CitationIllustration() {
    const sources = [
        { tag: "IEEE", c: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200/50 dark:border-blue-500/20" },
        { tag: "Nature", c: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/50 dark:border-emerald-500/20" },
        { tag: "arXiv", c: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 border-violet-200/50 dark:border-violet-500/20" },
    ];
    return (
        <div className="rounded-xl border border-slate-200/50 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-2.5 select-none space-y-1.5">
            <div className="flex items-center gap-1 mb-1">
                <CheckCircle className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                <span className="text-[8px] font-semibold text-foreground-muted uppercase tracking-widest">Verified Sources</span>
            </div>
            {sources.map((s) => (
                <div key={s.tag} className="flex items-center gap-1.5">
                    <span className={`text-[7.5px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${s.c}`}>{s.tag}</span>
                    <div className="h-1.5 bg-slate-100/80 dark:bg-white/5 rounded-full flex-1" />
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 shrink-0" />
                </div>
            ))}
        </div>
    );
}

function MultilingualIllustration() {
    const langs = [
        { label: "English", active: true },
        { label: "हिंदी", active: false },
        { label: "Tamil", active: false },
        { label: "বাংলা", active: false },
    ];
    return (
        <div className="rounded-xl border border-slate-200/50 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-2.5 select-none">
            <div className="flex flex-wrap gap-1 mb-2">
                {langs.map((l) => (
                    <span key={l.label} className={`text-[8px] font-medium px-1.5 py-0.5 rounded-full border ${l.active ? "bg-accent/10 border-accent/25 text-accent" : "bg-slate-50 dark:bg-white/5 border-slate-200/50 dark:border-white/8 text-foreground-muted"}`}>
                        {l.label}
                    </span>
                ))}
            </div>
            <div className="space-y-1">
                <div className="h-1.5 bg-slate-100/80 dark:bg-white/5 rounded-full w-full" />
                <div className="h-1.5 bg-accent/15 rounded-full w-3/4" />
            </div>
        </div>
    );
}

function VoiceIllustration() {
    const bars = [3, 5, 8, 6, 10, 7, 4, 9, 5, 7, 10, 4, 7, 5, 3];
    return (
        <div className="rounded-xl border border-slate-200/50 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-2.5 select-none">
            <div className="flex items-center gap-1.5 mb-2">
                <div className="w-4 h-4 rounded-full bg-rose-50 dark:bg-rose-500/10 border border-rose-200/40 dark:border-rose-500/20 flex items-center justify-center">
                    <Mic2 className="w-2 h-2 text-rose-500" />
                </div>
                <div className="h-1.5 bg-slate-100/70 dark:bg-white/5 rounded-full flex-1" />
                <div className="flex items-center gap-0.5">
                    <div className="w-1 h-1 rounded-full bg-rose-400 animate-pulse" />
                    <span className="text-[7px] text-rose-500 font-mono font-bold">REC</span>
                </div>
            </div>
            <div className="flex items-center gap-[2px] justify-center" style={{ height: 28 }}>
                {bars.map((h, i) => (
                    <motion.div
                        key={i}
                        className="w-[2.5px] rounded-full bg-gradient-to-t from-rose-500 to-rose-300"
                        animate={{ scaleY: [0.6, 1.4, 0.6] }}
                        transition={{ duration: 0.7 + (i % 3) * 0.15, repeat: Infinity, ease: "easeInOut", delay: i * 0.04 }}
                        style={{ height: h * 2.2, transformOrigin: "bottom" }}
                    />
                ))}
            </div>
        </div>
    );
}

function AnalyticsIllustration() {
    const pts_data = [28, 42, 33, 58, 48, 72, 62, 83, 76, 92];
    const W = 100, H = 36;
    const pts = pts_data.map((v, i) => `${(i / (pts_data.length - 1)) * W},${H - (v / 100) * H}`).join(" ");
    return (
        <div className="rounded-xl border border-slate-200/50 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-2.5 select-none">
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-[8px] font-semibold text-foreground-muted">Learning Progress</span>
                <span className="text-[8px] font-bold text-emerald-500">↑ 18%</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 32 }} preserveAspectRatio="none">
                <defs>
                    <linearGradient id="cg2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(94,106,210)" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="rgb(94,106,210)" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <polyline points={`${pts} ${W},${H} 0,${H}`} fill="url(#cg2)" />
                <polyline points={pts} fill="none" stroke="rgb(94,106,210)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                {/* Last dot */}
                <circle cx={W} cy={H - (92 / 100) * H} r="2" fill="rgb(94,106,210)" />
            </svg>
        </div>
    );
}

function SecurityIllustration() {
    return (
        <div className="rounded-xl border border-slate-200/50 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-2.5 select-none">
            <div className="flex items-center gap-1.5 mb-2">
                <div className="w-4 h-4 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/40 dark:border-emerald-500/20 flex items-center justify-center">
                    <ShieldCheck className="w-2 h-2 text-emerald-500" />
                </div>
                <span className="text-[8px] font-semibold text-emerald-600 dark:text-emerald-400">End-to-end encrypted</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
                {["AES-256", "Zero Logs", "GDPR"].map((label) => (
                    <div key={label} className="flex flex-col items-center py-1.5 rounded-lg bg-slate-50/70 dark:bg-white/4 border border-slate-200/40 dark:border-white/5 gap-0.5">
                        <Lock className="w-2 h-2 text-foreground-muted" />
                        <span className="text-[6.5px] text-foreground-muted font-semibold text-center leading-none">{label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PathIllustration() {
    const steps = [
        { label: "Foundations", done: true },
        { label: "Concepts", done: true },
        { label: "Advanced", done: false },
        { label: "Mastery", done: false },
    ];
    return (
        <div className="rounded-xl border border-slate-200/50 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-2.5 select-none space-y-1.5">
            {steps.map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 border ${s.done ? "bg-accent border-accent/40" : "bg-slate-100 dark:bg-white/5 border-slate-200/60 dark:border-white/10"}`}>
                        {s.done && <div className="w-1 h-1 rounded-full bg-white" />}
                    </div>
                    <span className={`text-[8px] font-medium flex-1 ${s.done ? "text-foreground" : "text-foreground-muted"}`}>{s.label}</span>
                    {s.done && <div className="h-1 w-6 rounded-full bg-accent/25" />}
                </div>
            ))}
        </div>
    );
}

/* ─────────────────────────────────────────
   FEATURE DATA
──────────────────────────────────────── */

const largeFeatures = [
    {
        id: "ai-assistant",
        icon: BrainCircuit,
        iconColor: "text-indigo-600 dark:text-indigo-400",
        iconBg: "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200/50 dark:border-indigo-500/20",
        hoverBorder: "hover:border-indigo-300/60 dark:hover:border-indigo-500/25",
        hoverShadow: "hover:shadow-[0_12px_40px_rgba(99,102,241,0.15)] dark:hover:shadow-[0_6px_32px_rgba(99,102,241,0.10)]",
        gradientTo: "to-indigo-50/30 dark:to-indigo-500/[0.03]",
        title: "AI Study Assistant",
        description: "Ask any academic question and get clear, step-by-step explanations tailored to your level.",
        illustration: <ChatIllustration />,
    },
    {
        id: "smart-notes",
        icon: FileText,
        iconColor: "text-violet-600 dark:text-violet-400",
        iconBg: "bg-violet-50 dark:bg-violet-500/10 border-violet-200/50 dark:border-violet-500/20",
        hoverBorder: "hover:border-violet-300/60 dark:hover:border-violet-500/25",
        hoverShadow: "hover:shadow-[0_12px_40px_rgba(139,92,246,0.15)] dark:hover:shadow-[0_6px_32px_rgba(139,92,246,0.10)]",
        gradientTo: "to-violet-50/30 dark:to-violet-500/[0.03]",
        title: "Smart Notes & Summaries",
        description: "Upload PDFs or lecture slides and get structured summaries so you review faster.",
        illustration: <NotesIllustration />,
    },
];

const smallFeatures = [
    {
        id: "source-grounded",
        icon: BookMarked,
        iconColor: "text-blue-600 dark:text-blue-400",
        iconBg: "bg-blue-50 dark:bg-blue-500/10 border-blue-200/50 dark:border-blue-500/20",
        hoverBorder: "hover:border-blue-300/60 dark:hover:border-blue-500/25",
        hoverShadow: "hover:shadow-[0_8px_32px_rgba(59,130,246,0.12)] dark:hover:shadow-[0_4px_24px_rgba(59,130,246,0.08)]",
        gradientTo: "to-blue-50/25 dark:to-blue-500/[0.02]",
        title: "Source-Grounded",
        description: "Every answer cites verified academic references — IEEE, Nature, arXiv.",
        illustration: <CitationIllustration />,
    },
    {
        id: "multilingual",
        icon: Globe2,
        iconColor: "text-emerald-600 dark:text-emerald-400",
        iconBg: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/50 dark:border-emerald-500/20",
        hoverBorder: "hover:border-emerald-300/60 dark:hover:border-emerald-500/25",
        hoverShadow: "hover:shadow-[0_8px_32px_rgba(16,185,129,0.12)] dark:hover:shadow-[0_4px_24px_rgba(16,185,129,0.08)]",
        gradientTo: "to-emerald-50/25 dark:to-emerald-500/[0.02]",
        title: "Multilingual",
        description: "Learn in Hindi, Tamil, Bengali and 9 more Indian languages.",
        illustration: <MultilingualIllustration />,
    },
    {
        id: "voice-image",
        icon: Mic2,
        iconColor: "text-rose-600 dark:text-rose-400",
        iconBg: "bg-rose-50 dark:bg-rose-500/10 border-rose-200/50 dark:border-rose-500/20",
        hoverBorder: "hover:border-rose-300/60 dark:hover:border-rose-500/25",
        hoverShadow: "hover:shadow-[0_8px_32px_rgba(244,63,94,0.12)] dark:hover:shadow-[0_4px_24px_rgba(244,63,94,0.08)]",
        gradientTo: "to-rose-50/25 dark:to-rose-500/[0.02]",
        title: "Voice & Image",
        description: "Speak questions or photograph equations and handwritten notes.",
        illustration: <VoiceIllustration />,
    },
    {
        id: "analytics",
        icon: BarChart3,
        iconColor: "text-amber-600 dark:text-amber-400",
        iconBg: "bg-amber-50 dark:bg-amber-500/10 border-amber-200/50 dark:border-amber-500/20",
        hoverBorder: "hover:border-amber-300/60 dark:hover:border-amber-500/25",
        hoverShadow: "hover:shadow-[0_8px_32px_rgba(245,158,11,0.12)] dark:hover:shadow-[0_4px_24px_rgba(245,158,11,0.08)]",
        gradientTo: "to-amber-50/25 dark:to-amber-500/[0.02]",
        title: "Analytics",
        description: "Track learning velocity and topic mastery with AI-powered insights.",
        illustration: <AnalyticsIllustration />,
    },
    {
        id: "security",
        icon: ShieldCheck,
        iconColor: "text-teal-600 dark:text-teal-400",
        iconBg: "bg-teal-50 dark:bg-teal-500/10 border-teal-200/50 dark:border-teal-500/20",
        hoverBorder: "hover:border-teal-300/60 dark:hover:border-teal-500/25",
        hoverShadow: "hover:shadow-[0_8px_32px_rgba(20,184,166,0.12)] dark:hover:shadow-[0_4px_24px_rgba(20,184,166,0.08)]",
        gradientTo: "to-teal-50/25 dark:to-teal-500/[0.02]",
        title: "Secure & Private",
        description: "AES-256 encrypted. Conversations never stored or sold.",
        illustration: <SecurityIllustration />,
    },
    {
        id: "learning-path",
        icon: TrendingUp,
        iconColor: "text-purple-600 dark:text-purple-400",
        iconBg: "bg-purple-50 dark:bg-purple-500/10 border-purple-200/50 dark:border-purple-500/20",
        hoverBorder: "hover:border-purple-300/60 dark:hover:border-purple-500/25",
        hoverShadow: "hover:shadow-[0_8px_32px_rgba(168,85,247,0.12)] dark:hover:shadow-[0_4px_24px_rgba(168,85,247,0.08)]",
        gradientTo: "to-purple-50/25 dark:to-purple-500/[0.02]",
        title: "Learning Path",
        description: "AI adapts to your pace and builds a custom roadmap to mastery.",
        illustration: <PathIllustration />,
    },
];

/* ─────────────────────────────────────────
   ANIMATION
──────────────────────────────────────── */

const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: (delay = 0) => ({
        opacity: 1, y: 0,
        transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] },
    }),
};

/* ─────────────────────────────────────────
   LARGE FEATURE CARD
   Text left — Illustration right
   Natural height, no stretching.
──────────────────────────────────────── */
function LargeFeatureCard({ feature, index }) {
    const Icon = feature.icon;
    return (
        <motion.div
            custom={index * 0.08}
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
        >
            <Card
                className={[
                    "flex flex-col sm:flex-row sm:items-stretch gap-0 overflow-hidden",
                    "p-0",
                    "bg-gradient-to-br from-white dark:from-white/[0.05]",
                    feature.gradientTo,
                    "border-slate-200/70 dark:border-white/[0.07]",
                    feature.hoverBorder,
                    feature.hoverShadow,
                    "transition-all duration-400 group cursor-default",
                ].join(" ")}
            >
                {/* Left — text block */}
                <div className="flex flex-col justify-between p-5 sm:p-6 sm:w-[56%] shrink-0">
                    <div>
                        {/* Icon + title inline */}
                        <div className="flex items-start gap-3 mb-3">
                            <div className={`inline-flex w-8 h-8 items-center justify-center rounded-lg border ${feature.iconBg} group-hover:scale-105 transition-transform duration-300 shrink-0 mt-0.5`}>
                                <Icon className={`h-4 w-4 ${feature.iconColor}`} />
                            </div>
                            <h3 className="text-base font-semibold text-foreground tracking-tight leading-snug">
                                {feature.title}
                            </h3>
                        </div>
                        <p className="text-[13px] text-foreground-muted leading-relaxed">
                            {feature.description}
                        </p>
                    </div>
                </div>

                {/* Divider */}
                <div className="hidden sm:block w-px bg-slate-100/80 dark:bg-white/[0.05] shrink-0 my-4" />
                <div className="sm:hidden h-px bg-slate-100/80 dark:bg-white/[0.05] mx-5" />

                {/* Right — illustration */}
                <div className="flex items-center justify-center p-4 sm:p-5 sm:flex-1 bg-slate-50/50 dark:bg-white/[0.02]">
                    <div className="w-full max-w-xs sm:max-w-none">
                        {feature.illustration}
                    </div>
                </div>
            </Card>
        </motion.div>
    );
}

/* ─────────────────────────────────────────
   SMALL FEATURE CARD
   Icon + title on one line.
   Description tight.
   Illustration at bottom, constrained height.
──────────────────────────────────────── */
function SmallFeatureCard({ feature, index }) {
    const Icon = feature.icon;
    return (
        <motion.div
            custom={0.15 + index * 0.06}
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            className="h-full"
        >
            <Card
                className={[
                    "h-full flex flex-col p-4 sm:p-5",
                    "bg-gradient-to-br from-white dark:from-white/[0.05]",
                    feature.gradientTo,
                    "border-slate-200/70 dark:border-white/[0.07]",
                    feature.hoverBorder,
                    feature.hoverShadow,
                    "transition-all duration-300 group cursor-default",
                ].join(" ")}
            >
                {/* Icon + title row */}
                <div className="flex items-start gap-2.5 mb-2">
                    <div className={`inline-flex w-7 h-7 items-center justify-center rounded-lg border ${feature.iconBg} group-hover:scale-105 transition-transform duration-300 shrink-0 mt-0.5`}>
                        <Icon className={`h-3.5 w-3.5 ${feature.iconColor}`} />
                    </div>
                    <h3 className="text-[13px] font-semibold text-foreground tracking-tight leading-snug">
                        {feature.title}
                    </h3>
                </div>

                {/* Description */}
                <p className="text-[11.5px] text-foreground-muted leading-relaxed mb-3">
                    {feature.description}
                </p>

                {/* Illustration — fixed space, no grow */}
                <div className="mt-auto">
                    {feature.illustration}
                </div>
            </Card>
        </motion.div>
    );
}

/* ─────────────────────────────────────────
   MAIN EXPORT
──────────────────────────────────────── */
export function FeaturesSection() {
    return (
        <section
            id="features"
            aria-labelledby="features-heading"
            className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 sm:pt-0 mt-4 sm:mt-0"
        >
            {/* Header */}
            <motion.div
                className="mb-10 sm:mb-12 text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55 }}
            >
                <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-[11px] font-mono text-accent mb-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    Features
                </div>
                <h2
                    id="features-heading"
                    className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground"
                >
                    Everything You Need to{" "}
                    <span
                        className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 dark:from-[#5E6AD2] dark:via-[#8b5cf6] dark:to-[#4F46E5]"
                        style={{ backgroundSize: "200% 200%", animation: "gradient-shift 5s ease infinite" }}
                    >
                        Learn Smarter
                    </span>
                </h2>
                <p className="mt-3 text-foreground-muted max-w-lg mx-auto text-sm sm:text-base">
                    A complete AI-powered academic platform built for students who want to understand deeply, not just pass exams.
                </p>
            </motion.div>

            {/* ════════════════════════════════════════
                MOBILE  (<sm) — compact interleaved
            ════════════════════════════════════════ */}
            <div className="flex flex-col gap-3 sm:hidden">
                <LargeFeatureCard feature={largeFeatures[0]} index={0} />
                <div className="grid grid-cols-2 gap-3">
                    <SmallFeatureCard feature={smallFeatures[0]} index={0} />
                    <SmallFeatureCard feature={smallFeatures[1]} index={1} />
                </div>
                <LargeFeatureCard feature={largeFeatures[1]} index={1} />
                <div className="grid grid-cols-2 gap-3">
                    <SmallFeatureCard feature={smallFeatures[2]} index={2} />
                    <SmallFeatureCard feature={smallFeatures[3]} index={3} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <SmallFeatureCard feature={smallFeatures[4]} index={4} />
                    <SmallFeatureCard feature={smallFeatures[5]} index={5} />
                </div>
            </div>

            {/* ════════════════════════════════════════
                TABLET + DESKTOP  (>=sm)
            ════════════════════════════════════════ */}
            <div className="hidden sm:flex flex-col gap-4">
                {/* Row 1 — Two large cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {largeFeatures.map((f, i) => (
                        <LargeFeatureCard key={f.id} feature={f} index={i} />
                    ))}
                </div>
                {/* Row 2 — Three small cards */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {smallFeatures.slice(0, 3).map((f, i) => (
                        <SmallFeatureCard key={f.id} feature={f} index={i} />
                    ))}
                </div>
                {/* Row 3 — Three small cards */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {smallFeatures.slice(3).map((f, i) => (
                        <SmallFeatureCard key={f.id} feature={f} index={i + 3} />
                    ))}
                </div>
            </div>
        </section>
    );
}
