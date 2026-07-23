import { motion, useScroll, useTransform } from "framer-motion";
import { useNavigate, Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageTransition } from "../components/ui/PageTransition";
import { ArrowRight, BookOpen, BrainCircuit, Library, Sparkles, Zap, Check, Star, StarOff } from "lucide-react";
import { Logo } from "../components/ui/Logo";
import { PerformanceStats } from "../components/PerformanceStats";

function PricingFeature({ children, highlighted = false }) {
    return (
        <li className="flex items-center space-x-3 text-sm group/feat">
            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-300
                ${highlighted
                    ? 'bg-accent/15 text-accent group-hover/feat:bg-accent/25 group-hover/feat:scale-110'
                    : 'bg-accent/10 text-accent dark:bg-white/10 dark:text-foreground-muted'}`}>
                <Check className="h-3 w-3" />
            </div>
            <span className={`transition-colors duration-200 ${highlighted ? "text-foreground group-hover/feat:text-accent" : "text-foreground-muted"}`}>
                {children}
            </span>
        </li>
    );
}

/* Floating particle effect for hero */
function FloatingOrb({ style, className }) {
    return (
        <motion.div
            className={`absolute rounded-full pointer-events-none ${className}`}
            animate={{ y: [0, -20, 0], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 4 + Math.random() * 2, repeat: Infinity, ease: "easeInOut" }}
            style={style}
        />
    );
}

export function HomePage() {
    const { scrollY } = useScroll();
    const y = useTransform(scrollY, [0, 500], [0, 150]);
    const opacity = useTransform(scrollY, [0, 300], [1, 0]);
    const { t } = useLanguage();
    const navigate = useNavigate();

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.altKey && event.key.toLowerCase() === 'n') {
                event.preventDefault();
                navigate('/chat');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigate]);

    return (
        <PageTransition className="flex flex-col space-y-24 sm:space-y-32 pb-28 md:pb-24">

            {/* ═══════════════════════════════════════════
                SECTION 1 — HERO
            ═══════════════════════════════════════════ */}
            <section className="relative flex min-h-[82svh] sm:min-h-[85vh] flex-col items-center justify-center text-center px-4 sm:px-6 overflow-hidden">

                {/* Light-mode only hero ambient glow */}
                <div className="block dark:hidden absolute inset-0 pointer-events-none">
                    {/* Central halo */}
                    <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full opacity-30"
                        style={{
                            background: "radial-gradient(ellipse, rgba(94,106,210,0.25) 0%, rgba(139,92,246,0.1) 50%, transparent 75%)",
                            filter: "blur(30px)",
                        }}
                    />
                    {/* Floating orbs */}
                    <motion.div
                        className="absolute top-[15%] left-[8%] w-3 h-3 rounded-full bg-accent/40"
                        animate={{ y: [0, -15, 0], opacity: [0.4, 0.9, 0.4], scale: [1, 1.3, 1] }}
                        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        className="absolute top-[25%] right-[12%] w-2 h-2 rounded-full bg-purple-500/50"
                        animate={{ y: [0, -12, 0], opacity: [0.5, 1, 0.5], scale: [1, 1.4, 1] }}
                        transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    />
                    <motion.div
                        className="absolute bottom-[20%] left-[15%] w-2 h-2 rounded-full bg-indigo-400/40"
                        animate={{ y: [0, -10, 0], opacity: [0.3, 0.8, 0.3], scale: [1, 1.2, 1] }}
                        transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                    />
                    <motion.div
                        className="absolute bottom-[30%] right-[18%] w-1.5 h-1.5 rounded-full bg-accent/60"
                        animate={{ y: [0, -8, 0], opacity: [0.4, 1, 0.4], scale: [1, 1.5, 1] }}
                        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                    />
                    <motion.div
                        className="absolute top-[50%] left-[5%] w-1 h-1 rounded-full bg-violet-400/50"
                        animate={{ y: [0, -18, 0], opacity: [0.3, 0.9, 0.3] }}
                        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
                    />
                </div>

                <motion.div
                    style={{ y, opacity }}
                    className="z-10 flex flex-col items-center space-y-6 sm:space-y-8 max-w-5xl"
                >
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.85, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        whileHover={{ scale: 1.05, y: -2 }}
                        className="inline-flex items-center gap-2 rounded-full
                            border border-accent/25 bg-accent/8 dark:bg-accent/10
                            px-3 sm:px-4 py-1.5 text-xs font-mono text-accent-bright
                            backdrop-blur-md cursor-default select-none
                            shadow-[0_2px_16px_rgba(94,106,210,0.12)]
                            hover:shadow-[0_4px_24px_rgba(94,106,210,0.2)]
                            hover:border-accent/40 hover:bg-accent/12
                            transition-all duration-300"
                    >
                        <motion.span
                            animate={{ rotate: [0, 15, -15, 0] }}
                            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                        >
                            <Sparkles className="h-3 w-3" />
                        </motion.span>
                        {t('home.hero.badge')}
                    </motion.div>

                    {/* Headline */}
                    <motion.h1
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.65, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
                        className="max-w-4xl text-4xl font-bold tracking-tight leading-[1.1] sm:text-5xl lg:text-7xl xl:text-[5rem]"
                    >
                        <span className="bg-gradient-to-b from-foreground via-foreground/85 to-foreground/60 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
                            {t('home.hero.title1')}
                        </span>
                        <br />
                        <span
                            className="bg-clip-text text-transparent bg-gradient-to-br from-indigo-800 via-purple-800 to-indigo-900 dark:from-[#5E6AD2] dark:via-[#8b5cf6] dark:to-[#4F46E5]"
                            style={{
                                backgroundSize: "200% 200%",
                                animation: "gradient-shift 4s ease infinite",
                            }}
                        >
                            {t('home.hero.title2')}
                        </span>
                    </motion.h1>

                    {/* Description */}
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.22 }}
                        className="max-w-xl text-base text-foreground-muted sm:text-lg lg:text-xl leading-relaxed"
                    >
                        {t('home.hero.description')}
                    </motion.p>

                    {/* CTA */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.32 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full"
                    >
                        <Link to="/signup" className="w-full sm:w-auto">
                            <motion.div
                                whileHover={{ scale: 1.03, y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                            >
                                <Button
                                    size="lg"
                                    className="h-12 w-full sm:w-auto px-8 text-sm font-semibold
                                        bg-accent hover:bg-accent-bright text-white
                                        shadow-[0_4px_24px_rgba(94,106,210,0.35)]
                                        hover:shadow-[0_8px_32px_rgba(94,106,210,0.5)]
                                        dark:shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.3)]
                                        transition-all duration-300 rounded-2xl border-0"
                                >
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    {t('home.hero.getStarted') || "Get Started Free"}
                                </Button>
                            </motion.div>
                        </Link>
                        <Link to="/chat" className="w-full sm:w-auto">
                            <motion.div
                                whileHover={{ scale: 1.03, y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                            >
                                <Button
                                    variant="secondary"
                                    size="lg"
                                    className="h-12 w-full sm:w-auto px-8 text-sm font-medium
                                        border border-border-base dark:border-white/10
                                        hover:border-accent/40
                                        bg-white/70 dark:bg-white/5
                                        hover:bg-accent/5 dark:hover:bg-white/8
                                        text-foreground-muted hover:text-accent
                                        shadow-sm hover:shadow-[0_4px_20px_rgba(94,106,210,0.12)]
                                        transition-all duration-300 rounded-2xl"
                                >
                                    Try the Chat
                                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </Button>
                            </motion.div>
                        </Link>
                    </motion.div>

                    {/* Social proof pill */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.55, duration: 0.5 }}
                        className="flex items-center gap-2 text-xs text-foreground-muted"
                    >
                        <div className="flex -space-x-1.5">
                            {['bg-indigo-400', 'bg-purple-400', 'bg-blue-400', 'bg-accent'].map((c, i) => (
                                <div key={i} className={`w-5 h-5 rounded-full border-2 border-white dark:border-background-base ${c}`} />
                            ))}
                        </div>
                        <span>Trusted by <strong className="text-foreground font-semibold">12,500+</strong> students</span>
                        <div className="flex items-center gap-0.5 text-amber-500">
                            {[...Array(5)].map((_, i) => <Star key={i} className="h-3 w-3 fill-current" />)}
                        </div>
                    </motion.div>
                </motion.div>
            </section>

            {/* ═══════════════════════════════════════════
                SECTION 2 — FEATURES GRID
            ═══════════════════════════════════════════ */}
            <section className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <motion.div
                    className="mb-12 text-center"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-[11px] font-mono text-accent mb-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        Features
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                        {t('home.features.title')}
                    </h2>
                    <p className="mt-4 text-foreground-muted max-w-xl mx-auto">
                        {t('home.features.subtitle')}
                    </p>
                </motion.div>

                <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-6 md:auto-rows-[185px]">

                    {/* Hero Feature Card */}
                    <motion.div
                        className="col-span-2 md:col-span-4 md:row-span-2"
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                    >
                        <Card className="h-full p-6 sm:p-8 flex flex-col justify-end group
                            text-foreground dark:text-white
                            border border-slate-200/80 dark:border-white/5
                            bg-gradient-to-br from-white to-slate-50/80 dark:from-white/[0.08] dark:to-white/[0.02]
                            hover:border-indigo-400/60 dark:hover:border-white/10
                            hover:shadow-[0_12px_48px_rgba(94,106,210,0.25)] dark:hover:shadow-[0_8px_40px_rgba(94,106,210,0.12)]
                            transition-all duration-500 overflow-hidden group-hover:-translate-y-1">

                            {/* Dark mode overlay */}
                            <div className="hidden dark:block absolute inset-0 bg-gradient-to-b from-transparent to-black/60 z-0 opacity-0 dark:opacity-100 transition-opacity" />

                            <Logo className="h-12 w-12 text-accent mb-4 z-10 group-hover:scale-110 group-hover:drop-shadow-[0_0_12px_rgba(94,106,210,0.5)] transition-all duration-300" />
                            <h3 className="text-2xl font-bold z-10 group-hover:text-indigo-900 dark:group-hover:text-accent transition-colors duration-300">
                                {t('home.features.card1.title')}
                            </h3>
                            <p className="mt-2 text-foreground-muted dark:text-gray-300 max-w-md z-10 group-hover:text-slate-800 dark:group-hover:text-white transition-colors duration-300">
                                {t('home.features.card1.desc')}
                            </p>

                            {/* Responsive decorative accent line */}
                            <div className="block dark:hidden mt-8 sm:mt-0 sm:absolute sm:bottom-0 sm:left-0 h-[3px] sm:h-[2px] w-12 sm:w-0 group-hover:w-24 sm:group-hover:w-full bg-gradient-to-r from-accent via-purple-400 to-accent transition-all duration-700 rounded-full" />
                        </Card>
                    </motion.div>

                    {/* Feature 2 — Zap */}
                    <motion.div
                        className="col-span-1 md:col-span-2 md:row-span-1"
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                    >
                        <Card className="h-full p-5 sm:p-6 flex flex-col justify-between group
                            text-foreground dark:text-white
                            border border-slate-200/80 dark:border-white/5
                            bg-gradient-to-br from-white to-amber-50/30 dark:from-white/[0.08] dark:to-white/[0.02]
                            hover:border-amber-400/80 dark:hover:border-white/10
                            hover:shadow-[0_12px_36px_rgba(245,158,11,0.20)] dark:hover:shadow-[0_6px_28px_rgba(245,158,11,0.10)]
                            transition-all duration-400 overflow-hidden group-hover:-translate-y-1">
                            <motion.div>
                                <Zap className="h-7 w-7 text-amber-500 dark:text-yellow-400 group-hover:drop-shadow-[0_0_12px_rgba(245,158,11,0.8)] transition-all duration-300" />
                            </motion.div>
                            <div>
                                <h3 className="text-base font-semibold group-hover:text-amber-800 dark:group-hover:text-yellow-400 transition-colors duration-300">
                                    {t('home.features.card2.title')}
                                </h3>
                                <p className="text-sm text-foreground-muted mt-1 group-hover:text-slate-800 dark:group-hover:text-white transition-colors duration-300">{t('home.features.card2.desc')}</p>
                            </div>
                        </Card>
                    </motion.div>

                    {/* Feature 3 — Brain */}
                    <motion.div
                        className="col-span-1 md:col-span-2 md:row-span-1"
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.15 }}
                    >
                        <Card className="h-full p-5 sm:p-6 flex flex-col justify-between group
                            text-foreground dark:text-white
                            border border-slate-200/80 dark:border-white/5
                            bg-gradient-to-br from-white to-purple-50/30 dark:from-white/[0.08] dark:to-white/[0.02]
                            hover:border-purple-400/80 dark:hover:border-white/10
                            hover:shadow-[0_12px_36px_rgba(139,92,246,0.20)] dark:hover:shadow-[0_6px_28px_rgba(139,92,246,0.10)]
                            transition-all duration-400 overflow-hidden group-hover:-translate-y-1">
                            <motion.div>
                                <BrainCircuit className="h-7 w-7 text-purple-500 dark:text-purple-400 group-hover:drop-shadow-[0_0_12px_rgba(139,92,246,0.8)] transition-all duration-300" />
                            </motion.div>
                            <div>
                                <h3 className="text-base font-semibold group-hover:text-purple-800 dark:group-hover:text-purple-400 transition-colors duration-300">
                                    {t('home.features.card3.title')}
                                </h3>
                                <p className="text-sm text-foreground-muted mt-1 group-hover:text-slate-800 dark:group-hover:text-white transition-colors duration-300">{t('home.features.card3.desc')}</p>
                            </div>
                        </Card>
                    </motion.div>

                    {/* Feature 4 — Wide Status Bar */}
                    <motion.div
                        className="col-span-2 md:col-span-6 md:row-span-1"
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                    >
                        <Card className="h-full p-5 sm:p-7 flex items-center justify-between group
                            text-foreground dark:text-white
                            border border-slate-200/80 dark:border-white/5
                            bg-gradient-to-r from-white via-slate-50/50 to-white dark:from-white/[0.08] dark:to-white/[0.02]
                            hover:border-emerald-400/80 dark:hover:border-white/10
                            hover:shadow-[0_12px_36px_rgba(16,185,129,0.15)] dark:hover:shadow-[0_4px_24px_rgba(16,185,129,0.08)]
                            transition-all duration-400 overflow-hidden group-hover:-translate-y-1">
                            <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                                <div>
                                    <h3 className="text-lg font-semibold group-hover:text-emerald-800 dark:group-hover:text-emerald-400 transition-colors duration-300">
                                        {t('home.features.card4.title')}
                                    </h3>
                                    <p className="text-sm text-foreground-muted group-hover:text-slate-800 dark:group-hover:text-white transition-colors duration-300">{t('home.features.card4.desc')}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                                    <span className="text-xs font-mono text-emerald-600 dark:text-emerald-500 font-semibold">
                                        {t('home.features.card4.system')}
                                    </span>
                                </div>
                            </div>
                            <Link to="/chat">
                                <Button variant="ghost" className="group/btn shrink-0 text-foreground-muted hover:text-accent hover:bg-accent/8 transition-all duration-300">
                                    {t('home.features.card4.btn')}
                                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                                </Button>
                            </Link>
                        </Card>
                    </motion.div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════
                SECTION 3 — FEATURES INCLUDED / PRICING
            ═══════════════════════════════════════════ */}
            <section className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mb-10 sm:mb-14 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="inline-flex items-center gap-2 rounded-full border border-green-500/25 bg-green-500/8 px-3 py-1 text-[11px] font-mono text-green-600 dark:text-green-400 mb-4"
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        Always Free
                    </motion.div>
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.05 }}
                        className="text-3xl font-bold tracking-tight sm:text-4xl"
                    >
                        <span className="bg-gradient-to-b from-foreground via-foreground/85 to-foreground/60 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
                            Everything You Need, Completely Free
                        </span>
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="mt-4 text-lg text-foreground-muted max-w-lg mx-auto"
                    >
                        All features are unlocked — no subscriptions, no paywalls.
                    </motion.p>
                </div>

                <div className="max-w-2xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 28 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.65, delay: 0.15 }}
                    >
                        <Card className="relative flex flex-col p-6 sm:p-9 group
                            border border-accent/20 hover:border-accent/35 dark:border-accent/20
                            bg-gradient-to-b from-white to-slate-50/60 dark:bg-accent/[0.02]
                            shadow-[0_4px_32px_rgba(94,106,210,0.08)]
                            hover:shadow-[0_12px_48px_rgba(94,106,210,0.16)]
                            transition-all duration-500 overflow-hidden">

                            {/* Decorative top beam */}
                            <div className="block dark:hidden absolute top-0 left-1/2 -translate-x-1/2 w-40 h-[2px] bg-gradient-to-r from-transparent via-accent/50 to-transparent rounded-full" />
                            {/* Subtle corner glow */}
                            <div className="block dark:hidden absolute -top-10 -right-10 w-36 h-36 rounded-full bg-accent/8 blur-2xl group-hover:bg-accent/14 transition-all duration-500" />
                            <div className="block dark:hidden absolute -bottom-10 -left-10 w-36 h-36 rounded-full bg-purple-400/6 blur-2xl group-hover:bg-purple-400/10 transition-all duration-500" />

                            <div className="mb-7 text-center relative z-10">
                                <motion.div
                                    whileHover={{ scale: 1.05 }}
                                    className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-4 py-1.5 text-[10px] font-mono font-semibold text-green-600 dark:text-green-400 mb-4 shadow-[0_2px_12px_rgba(16,185,129,0.1)]"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2 animate-pulse" />
                                    100% FREE — FOREVER
                                </motion.div>
                                <h3 className="text-2xl font-bold text-foreground">All Features Included</h3>
                                <p className="text-sm text-foreground-muted mt-1">Zero limits, zero cost</p>
                            </div>

                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 relative z-10">
                                <PricingFeature highlighted>Real-time Voice Interactions</PricingFeature>
                                <PricingFeature highlighted>Engineered with Sarvam: India's Own AI</PricingFeature>
                                <PricingFeature highlighted>Multilingual Support</PricingFeature>
                                <PricingFeature highlighted>Deep Concept Mapping</PricingFeature>
                                <PricingFeature highlighted>Multi-model Support</PricingFeature>
                                <PricingFeature highlighted>Fast and quick responses</PricingFeature>
                                <PricingFeature highlighted>Accurate and robust responses</PricingFeature>
                                <PricingFeature highlighted>Source grounding information</PricingFeature>
                            </ul>

                            <Link to="/signup" className="relative z-10">
                                <motion.div whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}>
                                    <Button className="w-full h-12 text-sm font-semibold
                                        bg-accent hover:bg-accent-bright text-white
                                        shadow-[0_4px_24px_rgba(94,106,210,0.3)]
                                        hover:shadow-[0_8px_32px_rgba(94,106,210,0.45)]
                                        transition-all duration-300 rounded-2xl border-0">
                                        Get Started Free
                                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                </motion.div>
                            </Link>
                        </Card>
                    </motion.div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════
                SECTION 4 — PERFORMANCE METRICS
            ═══════════════════════════════════════════ */}
            <section className="relative py-4">
                {/* Light mode section separator accent */}
                <div className="block dark:hidden absolute top-0 left-1/2 -translate-x-1/2 w-64 h-px bg-gradient-to-r from-transparent via-accent/25 to-transparent" />
                <div className="block dark:hidden absolute inset-0 bg-gradient-to-b from-transparent via-accent/[0.02] to-transparent pointer-events-none" />
                <PerformanceStats />
            </section>
        </PageTransition>
    );
}
