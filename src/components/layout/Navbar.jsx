import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import { BookOpen, GraduationCap, LayoutGrid, MessageSquare, User, Settings, LogOut } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";

export function Navbar() {
    const location = useLocation();
    const { t, language, setLanguage } = useLanguage();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Auth Check
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const isLoggedIn = !!user;


    const NavLink = ({ to, icon: Icon, children }) => {
        const isActive = location.pathname === to;
        return (
            <Link
                to={to}
                className={cn(
                    "flex items-center space-x-2 text-sm font-medium transition-colors hover:text-accent-bright",
                    isActive ? "text-accent" : "text-foreground-muted"
                )}
            >
                <Icon className="h-4 w-4" />
                <span>{children}</span>
            </Link>
        );
    };



    return (
        <nav className="fixed top-0 z-50 w-full border-b border-border-base dark:border-white/5 bg-background-base/80 backdrop-blur-xl">
            <div className="container relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                <Link to="/home" className="flex items-center space-x-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
                        <BookOpen className="h-5 w-5 text-accent" />
                    </div>
                    <span className="text-lg font-semibold tracking-tight">DigiLab</span>
                </Link>

                {/* Desktop Nav - Centered */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden items-center space-x-6 md:flex">
                    <NavLink to="/home" icon={LayoutGrid}>{t('nav.home')}</NavLink>
                    {isLoggedIn && <NavLink to="/dashboard" icon={GraduationCap}>{t('nav.dashboard')}</NavLink>}
                    <NavLink to="/chat" icon={MessageSquare}>{t('nav.chat')}</NavLink>
                </div>

                <div className="flex items-center space-x-2 sm:space-x-4">
                    {/* Theme Toggle */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            const html = document.documentElement;
                            if (html.classList.contains('dark')) {
                                html.classList.remove('dark');
                                localStorage.setItem('theme', 'light');
                            } else {
                                html.classList.add('dark');
                                localStorage.setItem('theme', 'dark');
                            }
                        }}
                        className="text-foreground-muted hover:text-foreground"
                    >
                        {/* Sun Icon (Visible in Dark) */}
                        <svg className="hidden h-5 w-5 dark:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        {/* Moon Icon (Visible in Light) */}
                        <svg className="block h-5 w-5 dark:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                    </Button>



                    {/* Settings Dropdown */}
                    <div className="relative">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 rounded-full p-0"
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        >
                            <Settings className="h-5 w-5" />
                        </Button>

                        <AnimatePresence>
                            {isDropdownOpen && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: -5, x: "-50%" }}
                                    animate={{ opacity: 1, scale: 1, y: 0, x: "-50%" }}
                                    exit={{ opacity: 0, scale: 0.95, y: -5, x: "-50%" }}
                                    transition={{ duration: 0.2, ease: "easeOut" }}
                                    className="absolute left-1/2 mt-2 w-56 rounded-xl border border-border-base bg-background-base/95 p-2 shadow-lg backdrop-blur-xl dark:border-white/10"
                                >
                                    {/* Language Selector */}
                                    <div className="mb-2 border-b border-border-base pb-2 dark:border-white/10">
                                        <p className="px-2 py-1.5 text-xs font-semibold text-foreground-muted uppercase">{t('profile.language')}</p>
                                        <div className="grid grid-cols-2 gap-1 px-2">
                                            <button
                                                onClick={() => { setLanguage('en'); setIsDropdownOpen(false); }}
                                                className={cn("rounded-md px-2 py-1.5 text-xs font-medium transition-colors", language === 'en' ? "bg-accent/20 text-accent" : "hover:bg-accent/10 text-foreground-muted hover:text-foreground")}
                                            >
                                                English
                                            </button>
                                            <button
                                                onClick={() => { setLanguage('hi'); setIsDropdownOpen(false); }}
                                                className={cn("rounded-md px-2 py-1.5 text-xs font-medium transition-colors", language === 'hi' ? "bg-accent/20 text-accent" : "hover:bg-accent/10 text-foreground-muted hover:text-foreground")}
                                            >
                                                हिंदी
                                            </button>
                                        </div>
                                    </div>

                                    {!isLoggedIn ? (
                                        <>
                                            <Link
                                                to="/login"
                                                className="flex w-full items-center rounded-lg px-2 py-2 text-sm text-foreground hover:bg-accent/10"
                                                onClick={() => setIsDropdownOpen(false)}
                                            >
                                                <span className="mr-2 h-2 w-2 rounded-full bg-green-400"></span>
                                                {t('nav.login')}
                                            </Link>
                                            <Link
                                                to="/signup"
                                                className="flex w-full items-center rounded-lg px-2 py-2 text-sm text-foreground hover:bg-accent/10"
                                                onClick={() => setIsDropdownOpen(false)}
                                            >
                                                <span className="mr-2 h-2 w-2 rounded-full bg-blue-400"></span>
                                                {t('nav.signup')}
                                            </Link>
                                        </>
                                    ) : (
                                        <>
                                            <Link
                                                to="/profile"
                                                className="flex w-full items-center rounded-lg px-2 py-2 text-sm text-foreground hover:bg-accent/10"
                                                onClick={() => setIsDropdownOpen(false)}
                                            >
                                                <User className="mr-2 h-4 w-4" />
                                                {t('nav.profile')}
                                            </Link>
                                            <button
                                                onClick={() => {
                                                    localStorage.removeItem("user");
                                                    localStorage.removeItem("token");
                                                    window.location.href = "/login"; // Force reload/redirect
                                                }}
                                                className="flex w-full items-center rounded-lg px-2 py-2 text-sm text-red-400 hover:bg-red-400/10"
                                            >
                                                <LogOut className="mr-2 h-4 w-4" />
                                                {t('profile.signOut')}
                                            </button>
                                        </>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </nav>
    );
}
