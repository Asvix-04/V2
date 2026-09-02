import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { useNavigate, Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageTransition } from "../components/ui/PageTransition";
import { ArrowRight, BookOpen, BrainCircuit, Library, Sparkles, Zap, Check, Star, StarOff, Languages, GraduationCap, ChevronDown, ShieldCheck, Scale, Search, Brain, CheckCircle, FileSearch, Columns, Newspaper, BadgeCheck, Lightbulb } from "lucide-react";
import { Logo } from "../components/ui/Logo";
import { FeaturesSection } from "../components/FeaturesSection";
import { PerformanceStats } from "../components/PerformanceStats";
import heroBgLight from "../assets/hero-bg-light.jpg";
import heroBgDark from "../assets/hero-bg-dark.jpg";

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

const floatingFeatures = [

    {
        icon: BrainCircuit,
        title: "Academically Accurate",
        description: "Reliable, context-aware AI built specifically for education.",
        bgGradient: "from-indigo-500/20 to-purple-500/5 dark:from-indigo-500/20 dark:to-purple-500/2",
        iconColor: "text-indigo-600 dark:text-indigo-400",
        glowColor: "group-hover:shadow-indigo-500/20",
        cardBg: "bg-indigo-50/90 dark:bg-indigo-950/20",
        cardBorder: "border-indigo-200/50 dark:border-indigo-500/20"
    },
    {
        icon: GraduationCap,
        title: "Education Focused",
        description: "Purpose-built for students, teachers, and institutions.",
        bgGradient: "from-purple-500/20 to-pink-500/5 dark:from-purple-500/20 dark:to-pink-500/2",
        iconColor: "text-purple-600 dark:text-purple-400",
        glowColor: "group-hover:shadow-purple-500/20",
        cardBg: "bg-purple-50/90 dark:bg-purple-950/20",
        cardBorder: "border-purple-200/50 dark:border-purple-500/20"
    },
    {
        icon: Languages,
        title: "Multilingual Learning",
        description: "Learn naturally across Indian and global languages.",
        bgGradient: "from-emerald-500/20 to-teal-500/5 dark:from-emerald-500/20 dark:to-teal-500/2",
        iconColor: "text-emerald-600 dark:text-emerald-400",
        glowColor: "group-hover:shadow-emerald-500/20",
        cardBg: "bg-emerald-50/90 dark:bg-emerald-950/20",
        cardBorder: "border-emerald-200/50 dark:border-emerald-500/20"
    },
    {
        icon: Zap,
        title: "Lightning Fast",
        description: "Instant AI-powered responses for seamless learning.",
        bgGradient: "from-amber-500/20 to-orange-500/5 dark:from-amber-500/20 dark:to-orange-500/2",
        iconColor: "text-amber-500 dark:text-amber-400",
        glowColor: "group-hover:shadow-amber-500/20",
        cardBg: "bg-amber-50/90 dark:bg-amber-950/20",
        cardBorder: "border-amber-200/50 dark:border-amber-500/20"
    }

];

const mediaLiteracyCards = [
    {
        icon: ShieldCheck,
        title: "Verify Information",
        description: "Verify online claims, news, and digital content using trusted evidence and AI-assisted analysis before accepting or sharing information.",
        iconColor: "text-indigo-600 dark:text-indigo-400",
        iconBg: "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200/50 dark:border-indigo-500/20",
        hoverBorder: "hover:border-indigo-300/60 dark:hover:border-indigo-500/25",
        hoverShadow: "hover:shadow-[0_8px_32px_rgba(99,102,241,0.12)] dark:hover:shadow-[0_4px_24px_rgba(99,102,241,0.08)]",
        gradientTo: "to-indigo-50/25 dark:to-indigo-500/[0.02]"
    },
    {
        icon: Scale,
        title: "Detect Bias",
        description: "Recognize how headlines, wording, visuals, and framing influence opinions and identify different forms of bias in media.",
        iconColor: "text-purple-600 dark:text-purple-400",
        iconBg: "bg-purple-50 dark:bg-purple-500/10 border-purple-200/50 dark:border-purple-500/20",
        hoverBorder: "hover:border-purple-300/60 dark:hover:border-purple-500/25",
        hoverShadow: "hover:shadow-[0_8px_32px_rgba(168,85,247,0.12)] dark:hover:shadow-[0_4px_24px_rgba(168,85,247,0.08)]",
        gradientTo: "to-purple-50/25 dark:to-purple-500/[0.02]"
    },
    {
        icon: Search,
        title: "Evaluate Sources",
        description: "Assess the credibility of websites, news outlets, social platforms, and digital sources before relying on their information.",
        iconColor: "text-blue-600 dark:text-blue-400",
        iconBg: "bg-blue-50 dark:bg-blue-500/10 border-blue-200/50 dark:border-blue-500/20",
        hoverBorder: "hover:border-blue-300/60 dark:hover:border-blue-500/25",
        hoverShadow: "hover:shadow-[0_8px_32px_rgba(59,130,246,0.12)] dark:hover:shadow-[0_4px_24px_rgba(59,130,246,0.08)]",
        gradientTo: "to-blue-50/25 dark:to-blue-500/[0.02]"
    },
    {
        icon: Brain,
        title: "Think Critically",
        description: "Compare perspectives, question assumptions, and make informed decisions using evidence rather than misinformation.",
        iconColor: "text-amber-600 dark:text-amber-400",
        iconBg: "bg-amber-50 dark:bg-amber-500/10 border-amber-200/50 dark:border-amber-500/20",
        hoverBorder: "hover:border-amber-300/60 dark:hover:border-amber-500/25",
        hoverShadow: "hover:shadow-[0_8px_32px_rgba(245,158,11,0.12)] dark:hover:shadow-[0_4px_24px_rgba(245,158,11,0.08)]",
        gradientTo: "to-amber-50/25 dark:to-amber-500/[0.02]"
    }
];

const capabilityPills = [
    { label: "Fact Checking", icon: CheckCircle, color: "text-indigo-500 bg-indigo-500/5 border-indigo-500/20 dark:border-indigo-500/30 hover:border-indigo-500/40" },
    { label: "Bias Detection", icon: Scale, color: "text-purple-500 bg-purple-500/5 border-purple-500/20 dark:border-purple-500/30 hover:border-purple-500/40" },
    { label: "Source Evaluation", icon: FileSearch, color: "text-blue-500 bg-blue-500/5 border-blue-500/20 dark:border-blue-500/30 hover:border-blue-500/40" },
    { label: "Media Analysis", icon: Columns, color: "text-emerald-500 bg-emerald-500/5 border-emerald-500/20 dark:border-emerald-500/30 hover:border-emerald-500/40" },
    { label: "Critical Thinking", icon: BrainCircuit, color: "text-amber-500 bg-amber-500/5 border-amber-500/20 dark:border-amber-500/30 hover:border-amber-500/40" }
];

function FAQItem({ question, answer }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border-b border-slate-200/50 dark:border-white/[0.06] py-4">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between text-left focus:outline-none group cursor-pointer"
            >
                <span className="text-sm sm:text-base font-semibold text-foreground group-hover:text-accent transition-colors duration-200">
                    {question}
                </span>
                <span className="ml-6 flex h-7 items-center shrink-0">
                    <motion.div
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <ChevronDown className={`h-4 w-4 sm:h-5 sm:w-5 ${isOpen ? "text-accent" : "text-foreground-muted"}`} />
                    </motion.div>
                </span>
            </button>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <p className="mt-2.5 text-xs sm:text-sm text-foreground-muted leading-relaxed">
                            {answer}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function FAQSection() {
    const faqs = [
        {
            question: "What is DigiLab?",
            answer: "DigiLab is an AI-assisted Media Literacy platform designed for students. It helps learners verify information, evaluate sources, recognize media bias, and develop critical thinking skills through interactive learning experiences."
        },
        {
            question: "Why is Media Literacy important?",
            answer: "Students encounter information from news websites, social media, search engines, and AI tools every day. Media Literacy helps them distinguish facts from misinformation, evaluate credibility, and make informed decisions before believing or sharing content."
        },
        {
            question: "How does DigiLab help students?",
            answer: "DigiLab combines Media Literacy principles with AI-assisted analysis to help students verify claims, compare perspectives, analyze media messages, evaluate source credibility, and strengthen critical thinking through practical learning."
        },
        {
            question: "Does DigiLab replace independent thinking?",
            answer: "No. DigiLab is designed to support critical thinking—not replace it. The platform encourages students to question information, evaluate evidence, and reach their own informed conclusions."
        },
        {
            question: "Can DigiLab help identify misinformation and bias?",
            answer: "Yes. DigiLab helps students analyze media content, recognize different forms of bias, evaluate source reliability, and understand how information is presented before accepting or sharing it."
        },
        {
            question: "Who is DigiLab designed for?",
            answer: "DigiLab is built primarily for students and educators who want to strengthen Media Literacy, improve information evaluation skills, and become more responsible digital learners."
        }
    ];

    return (
        <section className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24 border-t border-slate-200/50 dark:border-white/[0.05]">
            <div className="mx-auto max-w-3xl text-center mb-10 sm:mb-14">
                <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-mono text-accent mb-4">
                    Got Questions?
                </div>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    <span className="bg-gradient-to-b from-foreground via-foreground/90 to-foreground/75 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
                        Frequently Asked{" "}
                    </span>
                    <span
                        className="bg-clip-text text-transparent bg-gradient-to-br
                            from-[#0057B8]
                            via-[#1D75E8]
                            to-[#5EA9FF]
                            dark:from-[#2F80ED]
                            dark:via-[#4F9DFF]
                            dark:to-[#7DBBFF]"
                        style={{ backgroundSize: "200% 200%", animation: "gradient-shift 5s ease infinite" }}
                    >
                        Questions
                    </span>
                </h2>
                <p className="mt-4 text-sm sm:text-base text-foreground-muted">
                    Learn more about how DigiLab helps students develop Media Literacy, evaluate information, and build critical thinking skills through AI-assisted learning.
                </p>
            </div>
            <div className="mx-auto max-w-3xl border-t border-slate-200/50 dark:border-white/[0.06] pt-4 sm:pt-6">
                {faqs.map((faq, idx) => (
                    <FAQItem key={idx} question={faq.question} answer={faq.answer} />
                ))}
            </div>
        </section>
    );
}

export function HomePage() {
    const { scrollY } = useScroll();
    const y = useTransform(scrollY, [0, 500], [0, 150]);
    const opacity = useTransform(scrollY, [0, 300], [1, 0]);
    const bgY = useTransform(
        scrollY,
        [0, 1200],
        [0, 35]
    );
    const bgOpacity = useTransform(
        scrollY,
        [0, 600],
        [1, 0.65]
    );
    const { t } = useLanguage();
    const navigate = useNavigate();

    const [isDark, setIsDark] = useState(() => {
        if (typeof document !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return true;
    });

    useEffect(() => {
        setIsDark(document.documentElement.classList.contains('dark'));
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    setIsDark(document.documentElement.classList.contains('dark'));
                }
            });
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const heroBackground = isDark ? heroBgDark : heroBgLight;

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
        <PageTransition className="flex flex-col space-y-16 sm:space-y-24 md:space-y-32 pb-28 md:pb-24">

            {/* ═══════════════════════════════════════════
                SECTION 1 — HERO
            ═══════════════════════════════════════════ */}
            <section className="relative flex min-h-[45svh] lg:min-h-[100vh] w-full flex-col justify-start pt-[72px] sm:pt-20 lg:justify-center lg:pt-0">
                <div className="absolute inset-0 -z-20 overflow-hidden">
                    <motion.img
                        src={heroBackground}
                        alt="Hero Background"
                        style={{ y: bgY, opacity: bgOpacity }}
                        className="absolute inset-0 w-full h-full object-cover object-[85%_center] scale-[0.65] origin-right lg:object-center lg:scale-100 lg:origin-center"
                    />
                </div>

                {/* Subtle overlay for text readability */}
                <div className="absolute inset-0 bg-white/10 dark:bg-black/20 pointer-events-none" />

                {/* Light-mode only hero ambient glow */}
                <div className="block dark:hidden absolute inset-0 pointer-events-none overflow-hidden">
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
                    className="z-10 w-full max-w-7xl mx-auto px-5 lg:px-8 pb-[90px] sm:pb-[110px] lg:pb-0"
                >
                    {/* On mobile: text block constrained to left ~50%, right side shows hero image */}
                    <div className="flex flex-col items-start sm:items-center lg:items-start text-left sm:text-center lg:text-left space-y-3 sm:space-y-5 max-w-[48%] sm:max-w-2xl">
                        {/* Badge */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.85, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            whileHover={{ scale: 1.05, y: -2 }}
                            className="inline-flex items-center gap-1 sm:gap-2 rounded-full
                                border border-accent/25 bg-accent/8 dark:bg-accent/10
                                px-2 sm:px-4 py-0.5 sm:py-1.5 text-[9px] sm:text-xs font-mono text-accent-bright
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
                            className="max-w-4xl text-[16px] font-bold tracking-tight leading-[1.1] sm:text-5xl lg:text-7xl xl:text-[5rem]"
                        >
                            <span className="bg-gradient-to-b from-foreground via-foreground/85 to-foreground/60 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
                                From
                            </span>
                            <br />
                            <span className="bg-gradient-to-b from-foreground via-foreground/85 to-foreground/60 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
                                Questions
                            </span>
                            <br />
                            <span
                                className="bg-clip-text text-transparent bg-gradient-to-br
from-[#0057B8]
via-[#1D75E8]
to-[#5EA9FF]
dark:from-[#2F80ED]
dark:via-[#4F9DFF]
dark:to-[#7DBBFF]"
                                style={{
                                    backgroundSize: "200% 200%",
                                    animation: "gradient-shift 4s ease infinite",
                                }}
                            >
                                to Mastery
                            </span>
                        </motion.h1>

                        {/* Description */}
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.22 }}
                            className="hidden sm:block max-w-xl text-base text-foreground-muted sm:text-lg lg:text-xl leading-relaxed"
                        >
                            {(() => {
                                const text = t('home.hero.description');
                                const target = "Media Literacy";
                                const idx = text.indexOf(target);
                                if (idx !== -1) {
                                    return (
                                        <>
                                            {text.substring(0, idx)}
                                            <span className="text-blue-600 dark:text-blue-400 font-semibold inline-block whitespace-nowrap">
                                                {target}
                                            </span>
                                            {text.substring(idx + target.length)}
                                        </>
                                    );
                                }
                                return text;
                            })()}
                        </motion.p>
                        {/* Social proof pill — hidden on mobile to save vertical space */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.55, duration: 0.5 }}
                            className="hidden sm:flex items-center justify-start sm:justify-center lg:justify-start gap-2 text-xs text-foreground-muted"
                        >
                            <div className="flex -space-x-1.5">
                                {['bg-indigo-400', 'bg-purple-400', 'bg-green-300', 'bg-orange-300'].map((c, i) => (
                                    <div key={i} className={`w-5 h-5 rounded-full border-2 border-white dark:border-background-base ${c}`} />
                                ))}
                            </div>
                            <span>Trusted by <strong className="text-foreground font-semibold">12,500+</strong> students</span>
                            <div className="flex items-center gap-0.5 text-amber-500">
                                {[...Array(5)].map((_, i) => <Star key={i} className="h-3 w-3 fill-current" />)}
                            </div>
                        </motion.div>

                        {/* CTA */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.32 }}
                            className="flex flex-row flex-wrap items-center sm:items-center lg:items-start justify-start sm:justify-center lg:justify-start gap-2 sm:gap-3 w-full"
                        >
                            <Link to="/signup" className="w-auto">
                                <motion.div
                                    whileHover={{ scale: 1.03, y: -2 }}
                                    whileTap={{ scale: 0.97 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                >
                                    <Button
                                        size="lg"
                                        className="
h-[32px] sm:h-12
w-auto
px-2.5 sm:px-8
text-[10px] sm:text-sm
font-semibold
text-white

bg-gradient-to-r
from-[#0057B8]
via-[#1D75E8]
to-[#3B82F6]

hover:from-[#0047A0]
hover:via-[#1669D8]
hover:to-[#2563EB]

shadow-[0_6px_24px_rgba(0,87,184,0.35)]
hover:shadow-[0_10px_36px_rgba(29,122,224,0.45)]
dark:shadow-[0_0_0_1px_rgba(59,130,246,0.45),0_6px_20px_rgba(29,122,224,0.35)]

transition-all
duration-300
rounded-xl
sm:rounded-2xl
border-0
"
                                    >
                                        <Sparkles className="mr-1 h-2.5 w-2.5 sm:h-4 sm:w-4" />
                                        {t('home.hero.getStarted') || "Get Started Free"}
                                    </Button>
                                </motion.div>
                            </Link>

                            <Link to="/chat" className="w-auto">
                                <motion.div
                                    whileHover={{ scale: 1.03, y: -2 }}
                                    whileTap={{ scale: 0.97 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                >
                                    <Button
                                        variant="secondary"
                                        size="lg"
                                        className="h-[32px] sm:h-12 w-auto px-2.5 sm:px-8 text-[10px] sm:text-sm font-medium
                                            border border-border-base dark:border-white/10
                                            hover:border-accent/40
                                            bg-white/70 dark:bg-white/5
                                            hover:bg-accent/5 dark:hover:bg-white/8
                                            text-foreground-muted hover:text-accent
                                            shadow-sm hover:shadow-[0_4px_20px_rgba(94,106,210,0.12)]
                                            transition-all duration-300 rounded-xl sm:rounded-2xl"
                                    >
                                        Try the Chat
                                        <ArrowRight className="ml-1 h-2.5 w-2.5 sm:h-4 sm:w-4 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                </motion.div>
                            </Link>
                        </motion.div>

                        {/* Tagline for mobile/tablet screens only — positioned after CTA buttons */}
                        <motion.p
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.36 }}
                            className="block sm:hidden text-[10px] text-foreground-muted leading-relaxed"
                        >
                            {(() => {
                                const text = t('home.hero.description');
                                const target = "Media Literacy";
                                const idx = text.indexOf(target);
                                if (idx !== -1) {
                                    return (
                                        <>
                                            {text.substring(0, idx)}
                                            <span className="text-blue-600 dark:text-blue-400 font-semibold inline-block">
                                                {target}
                                            </span>
                                            {text.substring(idx + target.length)}
                                        </>
                                    );
                                }
                                return text;
                            })()}
                        </motion.p>

                        {/* Social proof pill for mobile/tablet screens only — positioned after tagline */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.4, duration: 0.5 }}
                            className="flex sm:hidden flex-col items-start gap-1 text-[9px] text-foreground-muted"
                        >
                            <div className="flex -space-x-1">
                                {['bg-indigo-400', 'bg-purple-400', 'bg-green-300', 'bg-orange-300'].map((c, i) => (
                                    <div key={i} className={`w-3.5 h-3.5 rounded-full border border-white dark:border-background-base ${c}`} />
                                ))}
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span>Trusted by <strong className="text-foreground font-semibold">12.5k+</strong> students</span>
                                <div className="flex items-center gap-0.5 text-amber-500">
                                    {[...Array(5)].map((_, i) => <Star key={i} className="h-2.5 w-2.5 fill-current" />)}
                                </div>
                            </div>
                        </motion.div>

                    </div>
                </motion.div>
                {/* ═══════════════════════════════════════════
                     FLOATING FEATURE CARDS (LAST CHILD OF HERO)
                 ═══════════════════════════════════════════ */}
                <div className="absolute left-0 right-0 z-30 w-full bottom-0 translate-y-[50%] sm:translate-y-[25%] md:translate-y-[30%]">
                    <div className="max-w-7xl mx-auto w-full">
                        <motion.ul
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                            className="grid grid-cols-4 md:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-6 list-none m-0 px-3 sm:px-6 lg:px-8"
                        >
                            {floatingFeatures.map((feature, idx) => {
                                const IconComponent = feature.icon;
                                return (
                                    <li
                                        key={idx}
                                        tabIndex={0}
                                        className={`group relative flex flex-col items-start md:flex-row md:items-center space-y-2 md:space-y-0 md:space-x-4 p-3 md:p-6 rounded-2xl md:rounded-[32px]
                                            ${feature.cardBg}
                                            border ${feature.cardBorder}
                                            shadow-lg md:shadow-xl hover:shadow-2xl hover:shadow-accent/5 dark:hover:shadow-accent/5
                                            transition-all duration-300 hover:-translate-y-1.5 focus-visible:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                                            min-h-[140px] md:min-h-[135px] backdrop-blur-xl`}
                                    >
                                        <div className={`flex items-center justify-center w-8 h-8 md:w-12 md:h-12 rounded-full shrink-0 border bg-gradient-to-br ${feature.bgGradient} transition-all duration-300 ${feature.glowColor} group-hover:scale-105 group-hover:shadow-md`}>
                                            <IconComponent className={`w-3.5 h-3.5 md:w-5 md:h-5 ${feature.iconColor} transition-transform duration-300 group-hover:scale-110`} />
                                        </div>
                                        <div className="w-full flex-1 min-w-0 flex flex-col">
                                            <h3 className="text-[11px] md:text-[17px] font-semibold text-foreground tracking-tight mb-0.5 select-none leading-snug">
                                                {feature.title}
                                            </h3>
                                            <p className="text-[10px] md:text-sm text-foreground-muted leading-snug select-none overflow-hidden line-clamp-none">
                                                {feature.description}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </motion.ul>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════
                SECTION 1.5 — MEDIA LITERACY OVERVIEW
            ═══════════════════════════════════════════ */}
            <section className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-8 sm:pt-24 sm:pb-12 border-t border-slate-200/50 dark:border-white/[0.05]">
                <div className="mx-auto max-w-3xl text-center mb-12 sm:mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/8 dark:bg-accent/10 px-3 py-1 text-[11px] font-mono text-accent-bright mb-4"
                    >
                        Media Literacy
                    </motion.div>
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.05 }}
                        className="text-3xl font-bold tracking-tight sm:text-4xl"
                    >
                        <span className="bg-gradient-to-b from-foreground via-foreground/85 to-foreground/60 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
                            Why{" "}
                        </span>
                        <span
                            className="bg-clip-text text-transparent bg-gradient-to-br
                                from-[#0057B8]
                                via-[#1D75E8]
                                to-[#5EA9FF]
                                dark:from-[#2F80ED]
                                dark:via-[#4F9DFF]
                                dark:to-[#7DBBFF]"
                            style={{ backgroundSize: "200% 200%", animation: "gradient-shift 5s ease infinite" }}
                        >
                            Media Literacy
                        </span>
                        <span className="bg-gradient-to-b from-foreground via-foreground/85 to-foreground/60 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
                            {" "}Matters
                        </span>
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="mt-4 text-sm sm:text-base text-foreground-muted max-w-3xl mx-auto leading-relaxed"
                    >
                        Every day, students encounter news articles, social media content, AI-generated information, and digital media. DigiLab helps them verify information, evaluate sources, recognize bias, and develop critical thinking skills before believing, sharing, or acting on information.
                    </motion.p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    {mediaLiteracyCards.map((card, idx) => {
                        const Icon = card.icon;
                        return (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: idx * 0.1 }}
                                className="h-full"
                            >
                                <Card className="h-full flex flex-col p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-white/[0.03] dark:to-white/[0.01] border border-slate-200/70 dark:border-white/[0.06] hover:border-accent/30 dark:hover:border-accent/30 hover:shadow-lg dark:hover:shadow-[0_4px_24px_rgba(99,102,241,0.06)] transition-all duration-300 group cursor-default">
                                    <div className={`inline-flex w-10 h-10 items-center justify-center rounded-xl border ${card.iconBg} mb-4 shrink-0 transition-transform duration-300 group-hover:scale-105`}>
                                        <Icon className={`h-5 w-5 ${card.iconColor}`} />
                                    </div>
                                    <h3 className="text-lg font-bold text-foreground tracking-tight mb-2">
                                        {card.title}
                                    </h3>
                                    <p className="text-sm text-foreground-muted leading-relaxed flex-1">
                                        {card.description}
                                    </p>
                                </Card>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Capability strip row of premium pills */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                    className="flex flex-wrap items-center justify-center gap-3 mt-12 max-w-4xl mx-auto"
                >
                    {capabilityPills.map((pill, idx) => {
                        const Icon = pill.icon;
                        return (
                            <div
                                key={idx}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold backdrop-blur-md transition-all duration-300 cursor-default select-none ${pill.color}`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                <span>{pill.label}</span>
                            </div>
                        );
                    })}
                </motion.div>
            </section>

            {/* ═══════════════════════════════════════════
                SECTION 1.6 — HOW DIGILAB WORKS
            ═══════════════════════════════════════════ */}
            <section className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-8 pb-16 sm:pt-12 sm:pb-24 border-t border-slate-200/50 dark:border-white/[0.05]">
                <div className="mx-auto max-w-3xl text-center mb-12 sm:mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/8 dark:bg-accent/10 px-3 py-1 text-[11px] font-mono text-accent-bright mb-4"
                    >
                        HOW DIGILAB WORKS
                    </motion.div>
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.05 }}
                        className="text-3xl font-bold tracking-tight sm:text-4xl"
                    >
                        <span className="bg-gradient-to-b from-foreground via-foreground/85 to-foreground/60 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
                            Learn.{" "}
                        </span>
                        <span
                            className="bg-clip-text text-transparent bg-gradient-to-br
                                from-[#0057B8]
                                via-[#1D75E8]
                                to-[#5EA9FF]
                                dark:from-[#2F80ED]
                                dark:via-[#4F9DFF]
                                dark:to-[#7DBBFF]"
                            style={{ backgroundSize: "200% 200%", animation: "gradient-shift 5s ease infinite" }}
                        >
                            Analyze
                        </span>
                        <span className="bg-gradient-to-b from-foreground via-foreground/85 to-foreground/60 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
                            . Verify.
                        </span>
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="mt-4 text-sm sm:text-base text-foreground-muted max-w-2xl mx-auto leading-relaxed"
                    >
                        DigiLab guides students through a practical Media Literacy workflow—helping them understand information, evaluate credibility, recognize bias, and build confident critical thinking skills using AI-assisted analysis.
                    </motion.p>
                </div>

                <div className="relative mt-12 max-w-5xl mx-auto">
                    {/* Visual Connector dashed line for desktop layout */}
                    <div className="hidden md:block absolute top-[52px] left-[16%] right-[16%] h-0 border-t border-dashed border-slate-200/80 dark:border-white/[0.08] -z-10" />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {[
                            {
                                icon: Newspaper,
                                title: "Explore Information",
                                description: "Read articles, news reports, social media posts, and digital content from different sources.",
                                colorClass: "text-indigo-600 dark:text-indigo-400 border-indigo-200/50 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10"
                            },
                            {
                                icon: BadgeCheck,
                                title: "Analyze & Verify",
                                description: "Use DigiLab to evaluate sources, detect bias, verify claims, and understand how information is presented.",
                                colorClass: "text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10"
                            },
                            {
                                icon: Lightbulb,
                                title: "Think Critically",
                                description: "Compare perspectives, draw evidence-based conclusions, and make informed decisions before believing or sharing information.",
                                colorClass: "text-purple-600 dark:text-purple-400 border-purple-200/50 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-500/10"
                            }
                        ].map((step, idx) => {
                            const StepIcon = step.icon;
                            return (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.5, delay: idx * 0.15 }}
                                    className="h-full"
                                >
                                    <Card className="h-full flex flex-col items-center text-center p-6 bg-gradient-to-br from-white to-slate-50/50 dark:from-white/[0.03] dark:to-white/[0.01] border border-slate-200/70 dark:border-white/[0.06] hover:border-accent/30 dark:hover:border-accent/30 hover:shadow-lg dark:hover:shadow-[0_4px_24px_rgba(99,102,241,0.06)] transition-all duration-300 group cursor-default">
                                        <div className={`inline-flex w-12 h-12 items-center justify-center rounded-xl border ${step.colorClass} mb-4 shrink-0 transition-transform duration-300 group-hover:scale-105`}>
                                            <StepIcon className="h-6 w-6" />
                                        </div>
                                        <h3 className="text-base font-bold text-foreground mb-2">
                                            {step.title}
                                        </h3>
                                        <p className="text-xs sm:text-sm text-foreground-muted leading-relaxed flex-1">
                                            {step.description}
                                        </p>
                                    </Card>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                {/* Bottom Highlight Supporting Text */}
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.5 }}
                    className="mt-12 text-center"
                >
                    <p className="text-xs sm:text-sm text-foreground-muted font-medium italic">
                        "Media Literacy is not about what to think—it's about learning how to think critically."
                    </p>
                </motion.div>
            </section>

            {/* ═══════════════════════════════════════════
                SECTION 2 — FEATURES GRID
            ═══════════════════════════════════════════ */}
            <FeaturesSection />

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
                        MEDIA LITERACY FOR EVERYONE
                    </motion.div>
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.05 }}
                        className="text-3xl font-bold tracking-tight sm:text-4xl"
                    >
                        <span className="bg-gradient-to-b from-foreground via-foreground/85 to-foreground/60 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
                            Helping{" "}
                        </span>
                        <span
                            className="bg-clip-text text-transparent bg-gradient-to-br
                                from-[#0057B8]
                                via-[#1D75E8]
                                to-[#5EA9FF]
                                dark:from-[#2F80ED]
                                dark:via-[#4F9DFF]
                                dark:to-[#7DBBFF]"
                            style={{ backgroundSize: "200% 200%", animation: "gradient-shift 5s ease infinite" }}
                        >
                            Students
                        </span>
                        <span className="bg-gradient-to-b from-foreground via-foreground/85 to-foreground/60 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
                            {" "}Navigate the Digital World
                        </span>
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="mt-4 text-lg text-foreground-muted max-w-2xl mx-auto"
                    >
                        Media literacy is an essential skill in today's digital world. DigiLab helps learners verify information, evaluate sources, recognize bias, and build critical thinking skills through AI-assisted learning.
                    </motion.p>
                </div>

                <div className="max-w-5xl mx-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

                        {/* Left column: Rich content panels */}
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                            className="lg:col-span-5 space-y-6 text-left"
                        >
                            <div className="space-y-3">
                                <h4 className="text-xl sm:text-2xl font-bold text-foreground">AI for Media Literacy.</h4>
                                <p className="text-sm sm:text-base text-foreground-muted leading-relaxed">
                                    Everything you need to analyze, verify, compare, and understand digital information—all in one intelligent workspace.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50/50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04]">
                                    <div className="mt-1 shrink-0 p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                        <ShieldCheck className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h5 className="text-sm sm:text-base font-semibold text-foreground">Cross-Reference Sources</h5>
                                        <p className="text-xs sm:text-sm text-foreground-muted mt-1 leading-relaxed">
                                            Evaluate online claims against trusted academic databases, credible scientific records, and historical context.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50/50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04]">
                                    <div className="mt-1 shrink-0 p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                        <Scale className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h5 className="text-sm sm:text-base font-semibold text-foreground">Detect Propaganda & Bias</h5>
                                        <p className="text-xs sm:text-sm text-foreground-muted mt-1 leading-relaxed">
                                            Unmask emotionally charged language, logical fallacies, and hidden agendas in reporting and social content.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50/50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04]">
                                    <div className="mt-1 shrink-0 p-2 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400">
                                        <GraduationCap className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h5 className="text-sm sm:text-base font-semibold text-foreground">Curriculum Alignment</h5>
                                        <p className="text-xs sm:text-sm text-foreground-muted mt-1 leading-relaxed">
                                            Enhance your assignments by integrating facts that directly corroborate with your course study units.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Right column: Original expanded card */}
                        <motion.div
                            initial={{ opacity: 0, x: 30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="lg:col-span-7 w-full"
                        >
                            <Card className="relative flex flex-col p-6 sm:p-9 group
                                border border-accent/20 hover:border-accent/35 dark:border-accent/20
                                bg-gradient-to-b from-white to-slate-50/60 dark:bg-accent/[0.02]
                                shadow-[0_4px_32px_rgba(94,106,210,0.08)]
                                hover:shadow-[0_12px_48px_rgba(94,106,210,0.16)]
                                transition-all duration-500 overflow-hidden w-full">

                                {/* Decorative top beam */}
                                <div className="block dark:hidden absolute top-0 left-1/2 -translate-x-1/2 w-40 h-[2px] bg-gradient-to-r from-transparent via-accent/50 to-transparent rounded-full" />
                                {/* Subtle corner glow */}
                                <div className="block dark:hidden absolute -top-10 -right-10 w-36 h-36 rounded-full bg-accent/8 blur-2xl group-hover:bg-accent/14 transition-all duration-500" />
                                <div className="block dark:hidden absolute -bottom-10 -left-10 w-36 h-36 rounded-full bg-purple-400/6 blur-2xl group-hover:bg-purple-400/10 transition-all duration-500" />

                                <div className="mb-7 text-center relative z-10">
                                    <h3 className="text-2xl font-bold text-foreground">Core Media Literacy Skills</h3>
                                    <p className="text-sm text-foreground-muted mt-1">Key skills for information analysis</p>
                                </div>

                                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-8 relative z-10">
                                    <PricingFeature highlighted>Information Verification</PricingFeature>
                                    <PricingFeature highlighted>Source Credibility Analysis</PricingFeature>
                                    <PricingFeature highlighted>Bias Detection</PricingFeature>
                                    <PricingFeature highlighted>Fact Checking</PricingFeature>
                                    <PricingFeature highlighted>Critical Thinking</PricingFeature>
                                    <PricingFeature highlighted>Responsible Media Consumption</PricingFeature>
                                    <PricingFeature highlighted>Digital Citizenship</PricingFeature>
                                    <PricingFeature highlighted>AI-Assisted Learning</PricingFeature>
                                </ul>

                                <Link to="/signup" className="relative z-10">
                                    <motion.div whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}>
                                        <Button className="w-full h-12 text-sm font-semibold
                                            bg-accent hover:bg-accent-bright text-white
                                            shadow-[0_4px_24px_rgba(94,106,210,0.3)]
                                            hover:shadow-[0_8px_32px_rgba(94,106,210,0.45)]
                                            transition-all duration-300 rounded-2xl border-0">
                                            Explore Media Literacy
                                            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                        </Button>
                                    </motion.div>
                                </Link>
                            </Card>
                        </motion.div>

                    </div>
                </div>
            </section>
            {/* ═══════════════════════════════════════════
                SECTION 4 — PERFORMANCE METRICS
            ═══════════════════════════════════════════ */}



            {/* ═══════════════════════════════════════════
                SECTION 5 — FAQ SECTION
            ═══════════════════════════════════════════ */}
            <FAQSection />
        </PageTransition>
    );
}
