import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import { GraduationCap, LayoutGrid, MessageSquare, User, Settings, LogOut } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { useUI } from "../../context/UIContext";
import { Logo } from "../ui/Logo";
import GlobeChatIcon from "../icons/GlobeChatIcon";

export function Navbar() {
    const location = useLocation();
    const { t, language, setLanguage } = useLanguage();
    const { theme, setTheme } = useUI();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Auth Check
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const isLoggedIn = !!user;


    const NavLink = ({ to, icon: Icon, children }) => {
        const isActive = to === '/home' || to === '/'
            ? location.pathname === '/' || location.pathname === '/home'
            : location.pathname.startsWith(to);
        return (
            <Link
                to={to}
                className={cn(
                    "relative flex items-center space-x-2 text-sm font-medium transition-colors h-16 px-1",
                    isActive ? "text-indigo-600 dark:text-accent" : "text-slate-600 dark:text-foreground-muted hover:text-indigo-900 dark:hover:text-white"
                )}
            >
                <Icon className={cn("h-4 w-4 transition-colors", isActive ? "text-indigo-600 dark:text-accent" : "text-slate-400 dark:text-foreground-muted")} />
                <span>{children}</span>
                {isActive && (
                    <motion.div
                        layoutId="navbar-active-indicator"
                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-600 dark:bg-accent rounded-t-full"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                )}
            </Link>
        );
    };

    const BottomNavLink = ({ to, icon: Icon, label }) => {
        // Handle exact match for home, startsWith for others
        const isActive = to === '/home'
            ? location.pathname === to || location.pathname === '/'
            : location.pathname.startsWith(to);

        return (
            <Link
                to={to}
                className={cn(
                    "flex flex-col items-center justify-center w-16 h-full space-y-1.5 text-[10px] font-medium transition-all duration-200",
                    isActive ? "text-accent" : "text-foreground-muted hover:text-foreground"
                )}
            >
                <div className={cn(
                    "relative flex items-center justify-center p-1 rounded-full transition-all duration-200",
                    isActive ? "text-accent" : "text-foreground-muted group-hover:text-foreground"
                )}>
                    {isActive && (
                        <div className="absolute inset-0 bg-accent/20 rounded-full blur-md" />
                    )}
                    <Icon className="relative h-5 w-5 z-10" />
                </div>
                <span className={cn("tracking-wide z-10", isActive && "font-semibold text-accent")}>{label}</span>
            </Link>
        );
    };



    return (
        <>
            <nav className="fixed top-0 z-50 w-full border-b border-slate-200/50 dark:border-white/5 bg-white/10 dark:bg-[#0A0A0B]/20 backdrop-blur-md bg-gradient-to-r from-indigo-50/40 via-white/40 to-purple-50/40 dark:from-transparent dark:via-transparent dark:to-transparent shadow-[0_1px_2px_rgba(0,0,0,0.01),0_8px_32px_rgba(0,0,0,0.02)] dark:shadow-none">
                <div className="container relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                    <Link to="/home" className="flex items-center space-x-2">
                        <Logo className="h-8 w-8" style={{ color: '#5c67f2' }} />
                        <span className="text-xl font-bold tracking-tight text-foreground">DigiLab</span>
                    </Link>

                    {/* Desktop Nav - Centered */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden items-center space-x-6 md:flex">
                        <NavLink to="/home" icon={LayoutGrid}>{t('nav.home')}</NavLink>
                        {isLoggedIn && <NavLink to="/workspace" icon={GraduationCap}>{t('nav.dashboard')}</NavLink>}
                        <NavLink to="/chat" icon={GlobeChatIcon}>{t('nav.chat')}</NavLink>
                    </div>

                    <div className="flex items-center space-x-2 sm:space-x-4">
                        {/* Theme Toggle */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
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
                                        initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                        transition={{ duration: 0.2, ease: "easeOut" }}
                                        className="absolute right-0 mt-3 w-64 origin-top-right rounded-2xl border border-border-base bg-background-base/95 p-3 shadow-2xl backdrop-blur-xl dark:border-white/10"
                                    >
                                        {/* Language Selector */}
                                        <div className="mb-3 border-b border-border-base pb-3 dark:border-white/10">
                                            <p className="px-3 py-2 text-[11px] font-bold text-foreground-muted uppercase tracking-wider">{t('profile.language')}</p>
                                            <div className="grid grid-cols-2 gap-2 px-3">
                                                <button
                                                    onClick={() => { setLanguage('en'); setIsDropdownOpen(false); }}
                                                    className={cn("rounded-lg px-3 py-2 text-xs font-medium transition-colors", language === 'en' ? "bg-accent/20 text-accent" : "hover:bg-accent/10 text-foreground-muted hover:text-foreground")}
                                                >
                                                    English
                                                </button>
                                                <button
                                                    onClick={() => { setLanguage('hi'); setIsDropdownOpen(false); }}
                                                    className={cn("rounded-lg px-3 py-2 text-xs font-medium transition-colors", language === 'hi' ? "bg-accent/20 text-accent" : "hover:bg-accent/10 text-foreground-muted hover:text-foreground")}
                                                >
                                                    हिंदी
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex flex-col space-y-1">
                                            {!isLoggedIn ? (
                                                <>
                                                    <Link
                                                        to="/login"
                                                        className="flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent/10 transition-colors"
                                                        onClick={() => setIsDropdownOpen(false)}
                                                    >
                                                        <span className="mr-3 h-2 w-2 rounded-full bg-green-400"></span>
                                                        {t('nav.login')}
                                                    </Link>
                                                    <Link
                                                        to="/signup"
                                                        className="flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent/10 transition-colors"
                                                        onClick={() => setIsDropdownOpen(false)}
                                                    >
                                                        <span className="mr-3 h-2 w-2 rounded-full bg-blue-400"></span>
                                                        {t('nav.signup')}
                                                    </Link>
                                                </>
                                            ) : (
                                                <>
                                                    <Link
                                                        to="/profile"
                                                        className="flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent/10 transition-colors"
                                                        onClick={() => setIsDropdownOpen(false)}
                                                    >
                                                        <User className="mr-3 h-4 w-4 text-foreground-muted" />
                                                        {t('nav.profile')}
                                                    </Link>
                                                    <button
                                                        onClick={() => {
                                                            localStorage.removeItem("user");
                                                            localStorage.removeItem("token");
                                                            window.location.href = "/"; // Force reload/redirect
                                                        }}
                                                        className="flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-red-400 hover:bg-red-400/10 transition-colors"
                                                    >
                                                        <LogOut className="mr-3 h-4 w-4" />
                                                        {t('profile.signOut')}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Bottom Navigation for Mobile */}
            <div
                className="fixed bottom-0 left-0 right-0 z-50 block md:hidden border-t border-border-base dark:border-white/5 bg-background-base/90 backdrop-blur-xl"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
                <div className="flex items-center justify-around h-16 px-2">
                    <BottomNavLink to="/home" icon={LayoutGrid} label={t('nav.home')} />
                    {isLoggedIn && <BottomNavLink to="/workspace" icon={GraduationCap} label={t('nav.dashboard')} />}
                    <BottomNavLink to="/chat" icon={GlobeChatIcon} label={t('nav.chat')} />
                    <BottomNavLink to={isLoggedIn ? "/profile" : "/login"} icon={User} label={isLoggedIn ? t('nav.profile') : t('nav.login')} />
                </div>
            </div>
        </>
    );
}
