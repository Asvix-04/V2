import * as React from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowLeft, BookOpen, ChevronDown, ChevronRight, ChevronLeft, Loader2, Plus, User as UserIcon, X,
    Star, StarOff, Menu, MessageSquareDashed, MessageSquare, Trash2, MoreVertical
} from "lucide-react";
import { MdSearch } from "react-icons/md";
import { cn } from "../../lib/utils";
import { DeepResearchLogo } from "../ui/DeepResearchLogo";
import GlobeChatIcon from "../icons/GlobeChatIcon";
import { Logo } from "../ui/Logo";

const IncognitoIcon = ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="11" fill="#1a1a1a" />
        <circle cx="12" cy="12" r="11" stroke="#4a5568" strokeWidth="1.2" />
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 7C10 7 8.3 8.1 7.4 9.8h9.2C15.7 8.1 14 7 12 7zM5 11v1h14v-1H5zm11 1.5c-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5 2.5-1.1 2.5-2.5-1.1-2.5-2.5-2.5zm-8 0c-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5 2.5-1.1 2.5-2.5-1.1-2.5-2.5-2.5zm3.5 3h1v1h-1v-1z"
            fill="white"
        />
    </svg>
);

export function Sidebar({
    mode = "chat",
    isSidebarOpen,
    setIsSidebarOpen,
    user,
    isGuest,
    isTeacher,
    sessions = [],
    starredChats = [],
    deepResearchChats = [],
    currentSessionId = null,
    onNewSession,
    onSelectSession,
    onDeleteSession,
    onDeleteResearch,
    onToggleStar,
    onRenameSubmit,
    onClearHistory,
    isIncognito = false,
    isDisappearingMode = false,
    setIsDisappearingMode,
    t,
    hasMoreSessions = false,
    isLoadingMoreSessions = false,
    onLoadMoreSessions = null,
    onIncognitoToggle = null
}) {
    // Internal UI-only states
    const [searchQuery, setSearchQuery] = React.useState("");
    const [isStarredOpen, setIsStarredOpen] = React.useState(false);
    const [isDeepResearchOpen, setIsDeepResearchOpen] = React.useState(false);
    const [activeMenuId, setActiveMenuId] = React.useState(null);
    const [renamingSessionId, setRenamingSessionId] = React.useState(null);
    const [renameValue, setRenameValue] = React.useState("");

    // Hover states for collapse buttons
    const [isLogoHovered, setIsLogoHovered] = React.useState(false);
    const [isCollapsedLogoHovered, setIsCollapsedLogoHovered] = React.useState(false);

    // Handle keydown for rename input
    const handleRenameKeyDown = (e, sessionId) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (onRenameSubmit) {
                onRenameSubmit(sessionId, renameValue);
            }
            setRenamingSessionId(null);
            setActiveMenuId(null);
        } else if (e.key === "Escape") {
            setRenamingSessionId(null);
            setActiveMenuId(null);
        }
    };

    // Filter sessions locally
    const filteredSessions = React.useMemo(() => {
        if (!searchQuery.trim()) return sessions;
        const query = searchQuery.toLowerCase();
        return sessions.filter(session => {
            const matchesTitle = session.title?.toLowerCase().includes(query);
            const firstUserMsg = session.messages?.find(m => m.role === "user")?.content?.toLowerCase() || "";
            return matchesTitle || firstUserMsg.includes(query);
        });
    }, [sessions, searchQuery]);

    // Translate fallback helper
    const translate = (key, fallback) => {
        if (t) {
            const val = t(key);
            if (val && val !== key) return val;
        }
        return fallback;
    };

    return (
        <>
            {/* Mobile Overlay */}
            <AnimatePresence>
                {isSidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsSidebarOpen(false)}
                        className={cn(
                            "fixed inset-0 z-[55] bg-black/50 lg:hidden",
                            mode === "chat" && !isIncognito && "lg:hidden"
                        )}
                    />
                )}
            </AnimatePresence>

            {/* Sidebar Container */}
            <div
                className={cn(
                    "fixed inset-y-0 left-0 z-[60] flex flex-col border-r border-slate-200/80 dark:border-white/5 bg-white dark:bg-zinc-950 h-full transition-[width,transform] duration-300 ease-in-out lg:relative shadow-[2px_0_20px_rgba(0,0,0,0.04)] dark:shadow-none",
                    isIncognito
                        ? "hidden lg:flex w-[72px] min-w-[72px] translate-x-0 lg:w-[72px] lg:min-w-[72px]"
                        : (isSidebarOpen
                            ? "w-[85vw] min-w-[280px] max-w-[320px] translate-x-0 lg:w-80 lg:min-w-[320px]"
                            : "-translate-x-full lg:translate-x-0 lg:w-[72px] lg:min-w-[72px]")
                )}
            >
                {/* ── Expanded Sidebar ──────────────────────────────────────── */}
                {!isIncognito && (
                    <div className={cn("flex flex-col h-full w-full overflow-hidden whitespace-nowrap", !isSidebarOpen && "lg:hidden")}>

                        {/* Top bar (Fixed) */}
                        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 dark:border-white/5 px-4 bg-white/90 dark:bg-zinc-950/80 sticky top-0 z-10 backdrop-blur-md">
                            <Link
                                to={isGuest ? "/home" : (isTeacher ? "/dashboard?mode=teacher" : "/dashboard")}
                                onClick={() => setIsSidebarOpen(false)}
                                className="flex items-center space-x-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 group"
                            >
                                <ArrowLeft className="h-4 w-4 shrink-0 group-hover:-translate-x-1 transition-transform" />
                                <span className="text-[15px] font-semibold">
                                    {isGuest ? translate("nav.home", "Home") : translate("chat.Dashboard", "Workspace")}
                                </span>
                            </Link>

                            {/* Desktop Collapse Button (with hover animation) */}
                            <button
                                onClick={() => setIsSidebarOpen(false)}
                                onMouseEnter={() => setIsLogoHovered(true)}
                                onMouseLeave={() => setIsLogoHovered(false)}
                                className="hidden lg:flex relative h-9 w-9 p-0 text-foreground-muted hover:text-accent hover:bg-accent/10 transition-all duration-300 rounded-xl items-center justify-center shrink-0 cursor-pointer overflow-hidden"
                                title="Collapse sidebar"
                            >
                                <div className="relative w-5 h-5 flex items-center justify-center">
                                    <Logo
                                        className={cn(
                                            "absolute w-5 h-5 transition-all duration-300 ease-in-out text-[#5c67f2]",
                                            isLogoHovered ? "opacity-0 scale-75 rotate-90" : "opacity-100 scale-100 rotate-0"
                                        )}
                                    />
                                    <ArrowLeft
                                        className={cn(
                                            "absolute w-5 h-5 text-accent transition-all duration-300 ease-in-out",
                                            isLogoHovered ? "opacity-100 scale-100 translate-x-0" : "opacity-0 scale-75 -translate-x-2"
                                        )}
                                    />
                                </div>
                            </button>

                            {/* Mobile/Tablet Collapse Button (standard touch-friendly, shows both Logo and ChevronLeft) */}
                            <button
                                onClick={() => setIsSidebarOpen(false)}
                                className="flex lg:hidden h-9 items-center gap-1.5 px-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all cursor-pointer shrink-0"
                                title="Collapse sidebar"
                            >
                                <Logo className="w-5 h-5 text-[#5c67f2] shrink-0" />
                                <ChevronLeft className="h-4 w-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                            </button>
                        </div>

                        {/* Middle Section (Scrollable) */}
                        <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-3.5 space-y-3">

                            {/* Disappearing Messages Toggle (Chat mode only) */}
                            {mode === "chat" && (
                                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors">
                                    <div className="flex items-center gap-2">
                                        <Loader2 className={cn("h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500", isDisappearingMode && "animate-spin text-orange-500 dark:text-orange-400")} />
                                        <div className="flex flex-col text-left">
                                            <span className="text-[15px] font-semibold text-zinc-700 dark:text-zinc-300">Disappearing</span>
                                            <span className="text-[10.5px] text-zinc-500 dark:text-zinc-500 font-normal">Auto-delete after 24h</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsDisappearingMode?.(!isDisappearingMode)}
                                        className={cn(
                                            "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                            isDisappearingMode ? "bg-orange-500" : "bg-zinc-300 dark:bg-zinc-700"
                                        )}
                                    >
                                        <span className={cn(
                                            "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                            isDisappearingMode ? "translate-x-3" : "translate-x-0"
                                        )} />
                                    </button>
                                </div>
                            )}

                            {/* Action Button (New Chat / New Research) */}
                            <button
                                onClick={() => {
                                    onNewSession();
                                    if (window.innerWidth < 1024) setIsSidebarOpen(false);
                                }}
                                className="w-full flex items-center justify-start gap-2 rounded-lg px-2 py-1.5 text-[15px] text-zinc-700 dark:text-zinc-300 hover:bg-slate-100/60 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors min-h-[36px] font-medium cursor-pointer"
                            >
                                <Plus className="h-4 w-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                                <span>{mode === "chat" ? translate("chat.newChat", "New Chat") : "New Research"}</span>
                            </button>

                            {/* Starred Chats (shared structure, only when pinned chats exist) */}
                            {(!isIncognito || mode !== "chat") && sessions.some(s => starredChats.includes(s.id)) && (
                                <div className="space-y-0.5">
                                    <button
                                        onClick={() => setIsStarredOpen(prev => !prev)}
                                        className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-slate-100/60 dark:hover:bg-white/5 rounded-lg transition-colors text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 group text-left cursor-pointer"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Star className="h-3.5 w-3.5 text-yellow-500 dark:text-yellow-400 shrink-0" />
                                            <span className="text-[13px] font-semibold uppercase tracking-wider">Starred Chats</span>

                                        </div>
                                        {isStarredOpen
                                            ? <ChevronDown className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                                            : <ChevronRight className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                                        }
                                    </button>

                                    <AnimatePresence initial={false}>
                                        {isStarredOpen && (
                                            <motion.div
                                                key="starred-body"
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2, ease: "easeInOut" }}
                                                className="overflow-visible"
                                            >
                                                <div className="px-1 pb-1">
                                                    {sessions
                                                        .filter(s => starredChats.includes(s.id))
                                                        .map((session) => (
                                                            <div key={session.id} className="relative group">
                                                                {mode === "chat" ? (
                                                                    <>
                                                                        <button
                                                                            onClick={() => {
                                                                                if (renamingSessionId !== session.id) {
                                                                                    onSelectSession(session.id);
                                                                                    if (window.innerWidth < 1024) setIsSidebarOpen(false);
                                                                                }
                                                                            }}
                                                                            className={cn(
                                                                                "flex w-full items-center space-x-2 rounded-lg px-2 py-1 text-[15px] transition-all duration-200 min-h-[34px] cursor-pointer mt-0.5",
                                                                                currentSessionId === session.id
                                                                                    ? "bg-accent/10 text-accent font-medium ring-1 ring-accent/30"
                                                                                    : "text-zinc-700 dark:text-zinc-300 hover:bg-accent/5 hover:text-zinc-900 dark:hover:text-zinc-100 hover:ring-1 hover:ring-accent/20"
                                                                            )}
                                                                        >
                                                                            <Star className="h-3 w-3 shrink-0 text-yellow-500 dark:text-yellow-400" />
                                                                            {renamingSessionId === session.id ? (
                                                                                <input
                                                                                    autoFocus
                                                                                    value={renameValue}
                                                                                    onChange={(e) => setRenameValue(e.target.value)}
                                                                                    onKeyDown={(e) => handleRenameKeyDown(e, session.id)}
                                                                                    onBlur={() => {
                                                                                        if (onRenameSubmit) onRenameSubmit(session.id, renameValue);
                                                                                        setRenamingSessionId(null);
                                                                                    }}
                                                                                    className="flex-1 min-w-0 bg-white dark:bg-zinc-800 border border-accent/50 rounded px-1.5 py-0.5 text-xs focus:outline-none text-zinc-900 dark:text-zinc-100"
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                />
                                                                            ) : (
                                                                                <span className="truncate flex-1 min-w-0 text-left overflow-hidden text-ellipsis whitespace-nowrap block">{session.title || "Chat session"}</span>
                                                                            )}

                                                                            {renamingSessionId !== session.id && (
                                                                                <div className="flex items-center max-sm:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0">
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setActiveMenuId(activeMenuId === session.id ? null : session.id);
                                                                                        }}
                                                                                        className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 min-w-[24px] min-h-[24px] flex items-center justify-center"
                                                                                    >
                                                                                        <MoreVertical className="h-3.5 w-3.5" />
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </button>
                                                                        <AnimatePresence>
                                                                            {activeMenuId === session.id && (
                                                                                <motion.div
                                                                                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                                                                    transition={{ duration: 0.15 }}
                                                                                    className="absolute right-4 top-8 z-[60] w-36 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden animate-in fade-in"
                                                                                >
                                                                                    <div className="flex flex-col p-1">
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                if (onToggleStar) onToggleStar(session.id, e);
                                                                                                setActiveMenuId(null);
                                                                                            }}
                                                                                            className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                                                                                        >
                                                                                            <span>Unstar Chat</span>
                                                                                            <StarOff className="h-3.5 w-3.5" />
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                setRenameValue(session.title || "");
                                                                                                setRenamingSessionId(session.id);
                                                                                                setActiveMenuId(null);
                                                                                            }}
                                                                                            className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                                                                                        >
                                                                                            <span>Rename</span>
                                                                                        </button>
                                                                                        <div className="h-px bg-zinc-200 dark:bg-white/10 my-1 mx-2" />
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                if (onDeleteSession) onDeleteSession(session.id, e);
                                                                                                setActiveMenuId(null);
                                                                                            }}
                                                                                            className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors cursor-pointer"
                                                                                        >
                                                                                            <span>Delete</span>
                                                                                            <Trash2 className="h-3.5 w-3.5" />
                                                                                        </button>
                                                                                    </div>
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </>
                                                                ) : (
                                                                    <Link
                                                                        to={`/chat?sessionId=${session.id}`}
                                                                        onClick={() => { if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                                                                        className="flex w-full items-center space-x-2 rounded-lg px-2 py-1 text-[15px] transition-all duration-200 min-h-[34px] mt-0.5 text-zinc-700 dark:text-zinc-300 hover:bg-accent/5 hover:text-zinc-900 dark:hover:text-zinc-100 hover:ring-1 hover:ring-accent/20"
                                                                    >
                                                                        <Star className="h-3 w-3 shrink-0 text-yellow-500 dark:text-yellow-400" />
                                                                        <span className="truncate flex-1 min-w-0 text-left overflow-hidden text-ellipsis whitespace-nowrap block">{session.title || "Chat session"}</span>
                                                                    </Link>
                                                                )}
                                                            </div>
                                                        ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            {/* Deep Research Section (Collapsible, only when research topics exist) */}
                            {!isGuest && (!isIncognito || mode !== "chat") && deepResearchChats.length > 0 && (
                                <div className="space-y-0.5 overflow-hidden">
                                    <button
                                        onClick={() => setIsDeepResearchOpen(prev => !prev)}
                                        className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-slate-100/60 dark:hover:bg-white/5 rounded-lg transition-colors text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 group text-left cursor-pointer"
                                    >
                                        <div className="flex items-center gap-2">
                                            <DeepResearchLogo className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
                                            <span className="text-[13px] font-semibold uppercase tracking-wider">Deep Research</span>

                                        </div>
                                        {isDeepResearchOpen
                                            ? <ChevronDown className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                                            : <ChevronRight className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                                        }
                                    </button>

                                    <AnimatePresence initial={false}>
                                        {isDeepResearchOpen && (
                                            <motion.div
                                                key="deep-research-body"
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2, ease: "easeInOut" }}
                                                className="overflow-hidden"
                                            >
                                                <div className="px-1 pb-1">
                                                    {deepResearchChats.map((session) => (
                                                        <div key={session.id} className="relative group">
                                                            <Link
                                                                to={`/deep-research?session=${session.id}`}
                                                                onClick={() => { if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                                                                className={cn(
                                                                    "flex w-full items-center space-x-2 rounded-lg px-2 py-1 text-[15px] transition-all duration-200 min-h-[34px] mt-0.5",
                                                                    mode === "research" && currentSessionId === session.id
                                                                        ? "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 font-medium ring-1 ring-indigo-500/30"
                                                                        : "text-zinc-700 dark:text-zinc-300 hover:bg-indigo-500/5 hover:text-zinc-900 dark:hover:text-zinc-100 hover:ring-1 hover:ring-indigo-500/20"
                                                                )}
                                                            >
                                                                <DeepResearchLogo className="h-3.5 w-3.5 shrink-0" />
                                                                <span className="truncate flex-1 min-w-0 text-left overflow-hidden text-ellipsis whitespace-nowrap block">{session.title || "Research Session"}</span>
                                                                {mode === "research" && onDeleteResearch && (
                                                                    <button
                                                                        onClick={(e) => onDeleteResearch(session.id, e)}
                                                                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 transition-opacity rounded text-zinc-400 min-h-[24px] min-w-[24px] flex items-center justify-center cursor-pointer"
                                                                        title="Delete"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </button>
                                                                )}
                                                            </Link>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            {/* Recent regular chats header & Search */}
                            <div className="space-y-2 pt-1">
                                {!isIncognito || mode !== "chat" ? (
                                    <>
                                        {/* Search Box */}
                                        <div className="relative px-2 mb-2">
                                            <div className="relative flex items-center">
                                                <MdSearch className="absolute left-3 text-zinc-400 h-4 w-4" />
                                                <input
                                                    id={mode === "chat" ? "sidebar-search" : "sidebar-search-dr"}
                                                    type="text"
                                                    placeholder="Search chats..."
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/5 rounded-lg pl-8 pr-3 py-1 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-accent/50 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 transition-all"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between px-2 py-0.5">
                                            <h3 className="text-[11.5px] font-semibold text-zinc-400 uppercase tracking-wider">Recent Chats</h3>
                                            {mode === "chat" && onClearHistory && (
                                                <button
                                                    onClick={onClearHistory}
                                                    className="text-zinc-400 hover:text-red-500 transition-colors p-0.5 rounded cursor-pointer"
                                                    title="Clear all history"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    /* Incognito Active display (Chat Mode only) */
                                    <div className="px-4 py-6 text-center flex flex-col items-center justify-center">
                                        <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800/50 flex items-center justify-center mb-2.5">
                                            <IncognitoIcon className="h-5 w-5 text-zinc-400" />
                                        </div>
                                        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-0.5">
                                            Incognito Mode Active
                                        </p>
                                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 max-w-[180px] leading-relaxed">
                                            Chats are temporary and not saved to history.
                                        </p>
                                    </div>
                                )}

                                {/* Recent regular sessions list */}
                                {(!isIncognito || mode !== "chat") && (
                                    filteredSessions.length > 0 ? (
                                        <div className="space-y-0.5">
                                            {filteredSessions
                                                .filter(s => !starredChats.includes(s.id))
                                                .map((session) => (
                                                    <div key={session.id} className="relative group px-1">
                                                        {mode === "chat" ? (
                                                            <>
                                                                <button
                                                                    onClick={() => {
                                                                        if (renamingSessionId !== session.id) {
                                                                            onSelectSession(session.id);
                                                                            if (window.innerWidth < 1024) setIsSidebarOpen(false);
                                                                        }
                                                                    }}
                                                                    className={cn(
                                                                        "flex w-full items-center space-x-2 rounded-lg px-2 py-1 text-[15px] transition-all duration-200 min-h-[34px] cursor-pointer",
                                                                        currentSessionId === session.id
                                                                            ? "bg-accent/10 text-accent font-medium ring-1 ring-accent/30"
                                                                            : "text-zinc-700 dark:text-zinc-300 hover:bg-accent/5 hover:text-zinc-900 dark:hover:text-zinc-100 hover:ring-1 hover:ring-accent/20"
                                                                    )}
                                                                >
                                                                    <MessageSquare className={cn("h-3.5 w-3.5 shrink-0 transition-colors duration-200", currentSessionId === session.id ? "text-accent" : "text-zinc-400 group-hover:text-accent/70")} />

                                                                    {renamingSessionId === session.id ? (
                                                                        <input
                                                                            autoFocus
                                                                            value={renameValue}
                                                                            onChange={(e) => setRenameValue(e.target.value)}
                                                                            onKeyDown={(e) => handleRenameKeyDown(e, session.id)}
                                                                            onBlur={() => {
                                                                                if (onRenameSubmit) onRenameSubmit(session.id, renameValue);
                                                                                setRenamingSessionId(null);
                                                                            }}
                                                                            className="flex-1 min-w-0 bg-white dark:bg-zinc-800 border border-accent/50 rounded px-1.5 py-0.5 text-xs focus:outline-none text-zinc-900 dark:text-zinc-100"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        />
                                                                    ) : (
                                                                        <span className="truncate flex-1 min-w-0 text-left overflow-hidden text-ellipsis whitespace-nowrap block">{session.title || "Chat session"}</span>
                                                                    )}

                                                                    {renamingSessionId !== session.id && (
                                                                        <div className="flex items-center max-sm:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0">
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setActiveMenuId(activeMenuId === session.id ? null : session.id);
                                                                                }}
                                                                                className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 min-w-[24px] min-h-[24px] flex items-center justify-center cursor-pointer"
                                                                                title="Menu"
                                                                            >
                                                                                <MoreVertical className="h-3.5 w-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </button>

                                                                <AnimatePresence>
                                                                    {activeMenuId === session.id && (
                                                                        <motion.div
                                                                            initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                            exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                                                            transition={{ duration: 0.15 }}
                                                                            className="absolute right-4 top-8 z-[60] w-36 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden animate-in fade-in"
                                                                        >
                                                                            <div className="flex flex-col p-1">
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        const willBeStarred = !starredChats.includes(session.id);
                                                                                        if (onToggleStar) onToggleStar(session.id, e);
                                                                                        if (willBeStarred) {
                                                                                            setIsStarredOpen(true);
                                                                                        }
                                                                                        setActiveMenuId(null);
                                                                                    }}
                                                                                    className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                                                                                >
                                                                                    <span>Star Chat</span>
                                                                                    <Star className="h-3.5 w-3.5" />
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setRenameValue(session.title || "");
                                                                                        setRenamingSessionId(session.id);
                                                                                        setActiveMenuId(null);
                                                                                    }}
                                                                                    className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                                                                                >
                                                                                    <span>Rename</span>
                                                                                </button>
                                                                                <div className="h-px bg-zinc-200 dark:bg-white/10 my-1 mx-2" />
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        if (onDeleteSession) onDeleteSession(session.id, e);
                                                                                        setActiveMenuId(null);
                                                                                    }}
                                                                                    className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors cursor-pointer"
                                                                                >
                                                                                    <span>Delete</span>
                                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                                </button>
                                                                            </div>
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </>
                                                        ) : (
                                                            <Link
                                                                to={`/chat?sessionId=${session.id}`}
                                                                className="flex w-full items-center space-x-2 rounded-lg px-2 py-1 text-[15px] transition-all duration-200 min-h-[34px] text-zinc-700 dark:text-zinc-300 hover:bg-accent/5 hover:text-zinc-900 dark:hover:text-zinc-100 hover:ring-1 hover:ring-accent/20"
                                                            >
                                                                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-zinc-400 group-hover:text-accent/70 transition-colors duration-200" />
                                                                <span className="truncate flex-1 min-w-0 text-left overflow-hidden text-ellipsis whitespace-nowrap block">{session.title || "Chat session"}</span>
                                                            </Link>
                                                        )}
                                                    </div>
                                                ))
                                            }
                                            {hasMoreSessions && (
                                                <div className="pt-2 px-1 flex justify-center">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (onLoadMoreSessions) onLoadMoreSessions();
                                                        }}
                                                        disabled={isLoadingMoreSessions}
                                                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/10 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer disabled:opacity-50 transition-colors"
                                                    >
                                                        {isLoadingMoreSessions ? (
                                                            <>
                                                                <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                                                                <span>Loading...</span>
                                                            </>
                                                        ) : (
                                                            <span>Show More Chats</span>
                                                        )}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="px-4 py-6 text-center flex flex-col items-center justify-center">
                                            <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800/50 flex items-center justify-center mb-2.5">
                                                <MessageSquareDashed className="h-5 w-5 text-zinc-400" />
                                            </div>
                                            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-0.5">
                                                {searchQuery ? "No matching chats found" : "No conversations yet"}
                                            </p>
                                            {!searchQuery && (
                                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 max-w-[180px] leading-relaxed">
                                                    Start a new chat to begin learning.
                                                </p>
                                            )}
                                        </div>
                                    )
                                )}
                            </div>
                        </div>

                        {/* Profile Card Bottom Bar (Fixed) */}
                        <div className="mt-auto border-t border-slate-200/80 dark:border-white/5 p-3.5 bg-slate-50/80 dark:bg-zinc-950/50 shrink-0">
                            <Link
                                to="/profile"
                                onClick={() => setIsSidebarOpen(false)}
                                className="flex w-full items-center gap-3 rounded-xl p-2.5 transition-all hover:bg-blue-50/60 dark:hover:bg-white/5 group bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-white/5 shadow-sm hover:shadow-md hover:border-blue-200/60 duration-205 cursor-pointer"
                            >
                                <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 ring-2 ring-blue-100 dark:ring-blue-900/30 group-hover:ring-blue-200 dark:group-hover:ring-blue-900/50 transition-all overflow-hidden shrink-0">
                                    {user?.profilePhoto ? (
                                        <img src={user.profilePhoto} alt="Avatar" className="h-full w-full object-cover" />
                                    ) : (
                                        <UserIcon className="h-4 w-4" />
                                    )}
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                        {user?.name || "Guest User"}
                                    </p>
                                    <p className="text-[13px] text-zinc-500 dark:text-zinc-400 truncate capitalize">
                                        {user?.role || "Learning Member"}
                                    </p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                            </Link>
                        </div>
                    </div>
                )}

                {/* ── Collapsed Rail ────────────────────────────────────────── */}
                <div
                    className={cn(
                        "hidden flex-col h-full w-full items-center py-4 opacity-0 transition-all duration-300",
                        (isIncognito || !isSidebarOpen) && "flex lg:flex opacity-100",
                        mode === "chat" && isIncognito
                            ? "border-r"
                            : "bg-slate-50/50 dark:bg-transparent border-r border-slate-200/60 dark:border-transparent"
                    )}
                    style={mode === "chat" && isIncognito ? {
                        background: 'linear-gradient(180deg, #131e2b 0%, #111928 100%)',
                        borderColor: 'rgba(255,255,255,0.06)'
                    } : undefined}
                >
                    {/* Brand Logo Expand Trigger Button */}
                    {isIncognito ? (
                        <button
                            onClick={onIncognitoToggle}
                            onMouseEnter={() => setIsCollapsedLogoHovered(true)}
                            onMouseLeave={() => setIsCollapsedLogoHovered(false)}
                            className="relative h-10 w-10 transition-all duration-200 rounded-xl flex items-center justify-center shrink-0 mb-6 cursor-pointer overflow-hidden text-slate-400 hover:text-slate-200 hover:bg-white/6"
                            title="Turn off incognito"
                        >
                            <div className="relative w-5 h-5 flex items-center justify-center">
                                <Logo
                                    className={cn(
                                        "absolute w-5 h-5 transition-all duration-300 ease-in-out text-[#5c67f2]",
                                        isCollapsedLogoHovered ? "opacity-0 scale-75 rotate-90" : "opacity-100 scale-100 rotate-0"
                                    )}
                                />
                                <ArrowLeft
                                    className={cn(
                                        "absolute w-5 h-5 text-accent transition-all duration-300 ease-in-out",
                                        isCollapsedLogoHovered ? "opacity-100 scale-100 translate-x-0" : "opacity-0 scale-75 -translate-x-2"
                                    )}
                                />
                            </div>
                        </button>
                    ) : (
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            onMouseEnter={() => setIsCollapsedLogoHovered(true)}
                            onMouseLeave={() => setIsCollapsedLogoHovered(false)}
                            className={cn(
                                "relative h-10 w-10 transition-all duration-200 rounded-xl flex items-center justify-center shrink-0 mb-6 cursor-pointer overflow-hidden",
                                "text-slate-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-white/5 hover:shadow-sm"
                            )}
                            title="Expand sidebar"
                        >
                            <div className="relative w-5 h-5 flex items-center justify-center">
                                <Logo
                                    className={cn(
                                        "absolute w-5 h-5 transition-all duration-300 ease-in-out text-[#5c67f2]",
                                        isCollapsedLogoHovered ? "opacity-0 scale-75 rotate-90" : "opacity-100 scale-100 rotate-0"
                                    )}
                                />
                                <ChevronRight
                                    className={cn(
                                        "absolute w-5 h-5 text-accent transition-all duration-300 ease-in-out",
                                        isCollapsedLogoHovered ? "opacity-100 scale-100 translate-x-0" : "opacity-0 scale-75 -translate-x-2"
                                    )}
                                />
                            </div>
                        </button>
                    )}

                    {/* Disappearing Messages Toggle (Chat mode only) */}
                    {!isIncognito && mode === "chat" && (
                        <button
                            onClick={() => setIsDisappearingMode?.(!isDisappearingMode)}
                            className={cn(
                                "h-10 w-10 flex items-center justify-center rounded-xl transition-all duration-200 shrink-0 mb-4 cursor-pointer",
                                isDisappearingMode
                                    ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 shadow-sm"
                                    : "text-slate-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-white/5 hover:shadow-sm"
                            )}
                            title={isDisappearingMode ? "Disappearing Mode: ON" : "Disappearing Mode: OFF"}
                        >
                            <Loader2 className={cn("h-5 w-5", isDisappearingMode && "animate-spin")} />
                        </button>
                    )}

                    {/* Action Button */}
                    {!isIncognito && (
                        <button
                            onClick={onNewSession}
                            className={cn(
                                "h-10 w-10 flex items-center justify-center rounded-xl transition-all duration-200 shrink-0 shadow-sm hover:shadow-md cursor-pointer",
                                mode === "chat"
                                    ? "bg-gradient-to-br from-blue-50 to-indigo-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:from-blue-100 hover:to-indigo-100 dark:hover:bg-blue-900/40 border border-blue-200/80 dark:border-blue-900/50"
                                    : "bg-gradient-to-br from-indigo-50 to-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:from-indigo-100 hover:to-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200/80 dark:border-indigo-900/50"
                            )}
                            title={mode === "chat" ? "New Chat" : "New Research"}
                        >
                            <Plus className="h-5 w-5" />
                        </button>
                    )}

                    {/* Starred shortcut button */}
                    {!isIncognito && sessions.some(s => starredChats.includes(s.id)) && (
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="h-10 w-10 flex items-center justify-center rounded-xl transition-all duration-200 shrink-0 mt-4 text-yellow-500 hover:text-yellow-600 dark:text-yellow-400 dark:hover:text-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 hover:shadow-sm cursor-pointer"
                            title="Starred Chats"
                        >
                            <Star className="h-5 w-5" />
                        </button>
                    )}

                    {/* Deep Research shortcut button */}
                    {!isIncognito && deepResearchChats.length > 0 && (
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="h-10 w-10 flex items-center justify-center rounded-xl transition-all duration-200 shrink-0 mt-4 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 hover:bg-indigo-950/30 hover:shadow-sm cursor-pointer"
                            title="Deep Research Chats"
                        >
                            <DeepResearchLogo className="h-5 w-5" />
                        </button>
                    )}

                    {/* Search shortcut button */}
                    {!isIncognito && (
                        <button
                            onClick={() => {
                                setIsSidebarOpen(true);
                                setTimeout(() => {
                                    document.getElementById(mode === "chat" ? "sidebar-search" : "sidebar-search-dr")?.focus();
                                }, 300);
                            }}
                            className={cn(
                                "h-10 w-10 flex items-center justify-center rounded-xl transition-all duration-200 shrink-0 mt-4 cursor-pointer",
                                "text-slate-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-white/5 hover:shadow-sm"
                            )}
                            title="Search chats"
                        >
                            <MdSearch className="h-5 w-5" />
                        </button>
                    )}

                    {/* User profile avatar shortcut */}
                    {!isIncognito && (
                        <div className="mt-auto">
                            <Link
                                to="/profile"
                                className="h-10 w-10 flex items-center justify-center rounded-full ring-2 transition-all overflow-hidden bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 ring-blue-100 dark:ring-blue-900/30 hover:ring-blue-200 dark:hover:ring-blue-900/50 cursor-pointer"
                                title="Profile"
                            >
                                {user?.profilePhoto ? (
                                    <img src={user.profilePhoto} alt="Avatar" className="h-full w-full object-cover" />
                                ) : (
                                    <UserIcon className="h-5 w-5" />
                                )}
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
