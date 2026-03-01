import { motion, useScroll, useTransform } from "framer-motion";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageTransition } from "../components/ui/PageTransition";
import { ArrowRight, BookOpen, BrainCircuit, Library, Sparkles, Zap, Check, Star, StarOff } from "lucide-react";
import { useUI } from "../context/UIContext";

function PricingFeature({ children, highlighted = false }) {
    return (
        <li className="flex items-center space-x-3 text-sm">
            <div className={`flex h-5 w-5 items-center justify-center rounded-full ${highlighted ? 'bg-accent/20 text-accent' : 'bg-accent/10 text-accent dark:bg-white/10 dark:text-foreground-muted'}`}>
                <Check className="h-3 w-3" />
            </div>
            <span className={highlighted ? "text-foreground" : "text-foreground-muted"}>{children}</span>
        </li>
    );
}

export function HomePage() {
    const { scrollY } = useScroll();
    const y = useTransform(scrollY, [0, 500], [0, 200]);
    const opacity = useTransform(scrollY, [0, 300], [1, 0]);
    const { isShootingStarsEnabled, toggleShootingStars, isBubblesEnabled, toggleBubbles } = useUI();
    const { t } = useLanguage();

    return (
        <PageTransition className="flex flex-col space-y-32 pb-24">
            {/* Hero Section */}
            <section className="relative flex min-h-[80vh] flex-col items-center justify-center text-center">
                <motion.div
                    style={{ y, opacity }}
                    className="z-10 flex flex-col items-center space-y-8"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                        className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-mono text-accent-bright backdrop-blur-md"
                    >
                        <Sparkles className="mr-2 h-3 w-3" />
                        {t('home.hero.badge')}
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="max-w-4xl text-5xl font-semibold tracking-tight sm:text-7xl lg:text-8xl"
                    >
                        <span className="bg-gradient-to-b from-foreground via-foreground/90 to-foreground/70 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
                            {t('home.hero.title1')}
                        </span>
                        <br />
                        <span className="bg-gradient-to-r from-[#5E6AD2] via-indigo-400 to-[#5E6AD2] bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
                            {t('home.hero.title2')}
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="max-w-2xl text-lg text-foreground-muted sm:text-xl"
                    >
                        {t('home.hero.description')}
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="flex flex-col space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0"
                    >
                        <Link to="/signup">
                            <Button size="lg" className="h-12 w-full px-8 text-base sm:w-auto">
                                <Sparkles className="mr-2 h-5 w-5" />
                                {t('home.hero.getStarted') || "Get Started"}
                            </Button>
                        </Link>
                    </motion.div>

                    {/* Shooting Star Toggle (Dark Mode) */}
                    <div className="mt-8 hidden dark:block animate-fade-in relative z-20">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={toggleShootingStars}
                            className="text-xs text-foreground-muted hover:text-white"
                        >
                            {isShootingStarsEnabled ? (
                                <>
                                    <StarOff className="mr-2 h-3 w-3" />
                                    {t('home.hero.starsOff')}
                                </>
                            ) : (
                                <>
                                    <Star className="mr-2 h-3 w-3" />
                                    {t('home.hero.starsOn')}
                                </>
                            )}
                        </Button>
                    </div>

                    {/* 3D Stars Toggle (Light Mode) */}
                    <div className="mt-8 block dark:hidden animate-fade-in relative z-20">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={toggleBubbles}
                            className="text-xs text-foreground-muted hover:text-foreground"
                        >
                            {isBubblesEnabled ? (
                                <>
                                    <StarOff className="mr-2 h-3 w-3" />
                                    {t('home.hero.3dOff')}
                                </>
                            ) : (
                                <>
                                    <Star className="mr-2 h-3 w-3" />
                                    {t('home.hero.3dOn')}
                                </>
                            )}
                        </Button>
                    </div>

                </motion.div>
            </section>

            {/* Features Grid */}
            <section className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mb-12 text-center">
                    <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                        {t('home.features.title')}
                    </h2>
                    <p className="mt-4 text-foreground-muted">
                        {t('home.features.subtitle')}
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-6 md:auto-rows-[180px]">
                    {/* Hero Card */}
                    <Card className="col-span-1 md:col-span-4 md:row-span-2 p-8 flex flex-col justify-end group text-foreground dark:text-white border-border-base dark:border-white/5">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60 z-0 opacity-0 dark:opacity-100 transition-opacity" />
                        <BookOpen className="h-12 w-12 text-accent mb-4 z-10" />
                        <h3 className="text-2xl font-semibold z-10">{t('home.features.card1.title')}</h3>
                        <p className="mt-2 text-foreground-muted dark:text-gray-300 max-w-md z-10 group-hover:text-foreground dark:group-hover:text-white transition-colors">
                            {t('home.features.card1.desc')}
                        </p>
                    </Card>

                    {/* Feature 2 */}
                    <Card className="col-span-1 md:col-span-2 md:row-span-1 p-6 flex flex-col justify-between text-foreground dark:text-white border-border-base dark:border-white/5">
                        <Zap className="h-8 w-8 text-yellow-500 dark:text-yellow-400" />
                        <div>
                            <h3 className="text-lg font-medium">{t('home.features.card2.title')}</h3>
                            <p className="text-sm text-foreground-muted dark:text-gray-400">{t('home.features.card2.desc')}</p>
                        </div>
                    </Card>

                    {/* Feature 3 */}
                    <Card className="col-span-1 md:col-span-2 md:row-span-1 p-6 flex flex-col justify-between text-foreground dark:text-white border-border-base dark:border-white/5">
                        <BrainCircuit className="h-8 w-8 text-purple-500 dark:text-purple-400" />
                        <div>
                            <h3 className="text-lg font-medium">{t('home.features.card3.title')}</h3>
                            <p className="text-sm text-foreground-muted dark:text-gray-400">{t('home.features.card3.desc')}</p>
                        </div>
                    </Card>

                    {/* Feature 4 (Wide) */}
                    <Card className="col-span-1 md:col-span-6 md:row-span-1 p-8 flex items-center justify-between text-foreground dark:text-white border-border-base dark:border-white/5">
                        <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-8">
                            <div>
                                <h3 className="text-xl font-semibold">{t('home.features.card4.title')}</h3>
                                <p className="text-foreground-muted dark:text-gray-400">{t('home.features.card4.desc')}</p>
                            </div>
                            <div className="flex space-x-2">
                                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                                <span className="text-xs font-mono text-green-600 dark:text-green-500">{t('home.features.card4.system')}</span>
                            </div>
                        </div>
                        <Button variant="ghost" className="group">
                            {t('home.features.card4.btn')} <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </Button>
                    </Card>
                </div>
            </section>

            {/* Pricing Section */}
            <section className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mb-16 text-center">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="text-3xl font-semibold tracking-tight sm:text-4xl"
                    >
                        <span className="bg-gradient-to-b from-foreground via-foreground/90 to-foreground/70 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
                            {t('home.pricing.title')}
                        </span>
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="mt-4 text-lg text-foreground-muted"
                    >
                        {t('home.pricing.subtitle')}
                    </motion.p>
                </div>

                <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-12 max-w-4xl mx-auto">
                    {/* Free Plan */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                    >
                        <Card className="flex flex-col h-full p-8 border-border-base dark:border-white/5 hover:border-accent/20 dark:hover:border-white/10 transition-colors">
                            <div className="mb-6">
                                <h3 className="text-xl font-medium text-foreground">{t('home.pricing.student.title')}</h3>
                                <div className="mt-4 flex items-baseline">
                                    <span className="text-4xl font-bold text-foreground">$0</span>
                                    <span className="ml-2 text-foreground-muted">/month</span>
                                </div>
                                <p className="mt-4 text-sm text-foreground-muted">{t('home.pricing.student.desc')}</p>
                            </div>
                            <ul className="flex-1 space-y-4 mb-8">
                                <PricingFeature>{t('pricing.feat.basicChat')}</PricingFeature>
                                <PricingFeature>{t('pricing.feat.queries')}</PricingFeature>
                                <PricingFeature>{t('pricing.feat.speed')}</PricingFeature>
                                <PricingFeature>{t('pricing.feat.public')}</PricingFeature>
                            </ul>
                            <Button variant="secondary" className="w-full">
                                {t('home.pricing.student.btn')}
                            </Button>
                        </Card>
                    </motion.div>

                    {/* Pro Plan */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                    >
                        <Card className="relative flex flex-col h-full p-8 border-accent/20 dark:border-accent/20 bg-white/40 backdrop-blur-xl shadow-xl dark:bg-accent/[0.02]">
                            {/* Glow Effect */}


                            <div className="mb-6 relative">
                                <div className="absolute -top-4 right-0 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[10px] font-mono font-medium text-accent-bright">
                                    {t('home.pricing.pro.recommended')}
                                </div>
                                <h3 className="text-xl font-medium text-foreground">{t('home.pricing.pro.title')}</h3>
                                <div className="mt-4 flex items-baseline">
                                    <span className="text-4xl font-bold text-foreground">$12</span>
                                    <span className="ml-2 text-foreground-muted">/month</span>
                                </div>
                                <p className="mt-4 text-sm text-foreground-muted">{t('home.pricing.pro.desc')}</p>
                            </div>
                            <ul className="flex-1 space-y-4 mb-8">
                                <PricingFeature highlighted>{t('pricing.feat.unlimited')}</PricingFeature>
                                <PricingFeature highlighted>{t('pricing.feat.planning')}</PricingFeature>
                                <PricingFeature highlighted>{t('pricing.feat.files')}</PricingFeature>
                                <PricingFeature highlighted>{t('pricing.feat.mapping')}</PricingFeature>
                                <PricingFeature>{t('pricing.feat.support')}</PricingFeature>
                            </ul>
                            <Button className="w-full shadow-[0_0_20px_-5px_rgba(94,106,210,0.4)]">
                                {t('home.pricing.pro.btn')}
                            </Button>
                        </Card>
                    </motion.div>
                </div>
            </section>
        </PageTransition>
    );
}
