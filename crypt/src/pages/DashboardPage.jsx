import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { FileUpload } from "../components/ui/FileUpload";
import { PageTransition } from "../components/ui/PageTransition";
import { useDocuments } from "../context/DocumentContext";
import { FileText, Layout, Lightbulb, MessageSquare, Plus, Search, Settings, ArrowRight, Map, RotateCcw, Trash2, ChevronDown, ChevronUp, Star } from "lucide-react";
import { Logo } from "../components/ui/Logo";
import GlobeChatIcon from "../components/icons/GlobeChatIcon";
import api from "../lib/api";

export function DashboardPage() {
    const [searchParams] = useSearchParams();
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const mode = searchParams.get("mode") || user.role || "student"; // Default to student
    const isTeacher = mode === "teacher";
    const { documents, addDocument } = useDocuments();

    // Get 3 most recent documents
    const recentDocs = documents.slice(0, 3);

    const [sessions, setSessions] = useState([]);
    const [starredSessions, setStarredSessions] = useState([]);
    const [deletedSessions, setDeletedSessions] = useState([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(true);
    const [isLoadingDeleted, setIsLoadingDeleted] = useState(true);
    const [showDeleted, setShowDeleted] = useState(false);

    const fetchSessions = async () => {
        if (user && user.id) {
            try {
                const res = await api.get('/chat/sessions');
                if (res.data) {
                    setSessions(res.data.slice(0, 3)); // Only show top 3
                    
                    try {
                        const starredIds = JSON.parse(localStorage.getItem('starredChats') || '[]');
                        const starred = res.data.filter(s => starredIds.includes(s.id));
                        setStarredSessions(starred.slice(0, 3));
                    } catch (e) {
                        setStarredSessions([]);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch sessions for dashboard:", err);
            } finally {
                setIsLoadingSessions(false);
            }
        } else {
            setIsLoadingSessions(false);
        }
    };

    const fetchDeletedSessions = async () => {
        if (user && user.id) {
            try {
                const res = await api.get('/chat/sessions-deleted');
                if (res.data) {
                    setDeletedSessions(res.data);
                }
            } catch (err) {
                console.error("Failed to fetch deleted sessions:", err);
            } finally {
                setIsLoadingDeleted(false);
            }
        } else {
            setIsLoadingDeleted(false);
        }
    };

    useEffect(() => {
        fetchSessions();
        if (!isTeacher) {
            fetchDeletedSessions();
        }
    }, []);

    // Live-sync starred sessions when starredChats is updated from another tab (e.g. ChatPage)
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'starredChats') {
                try {
                    const starredIds = JSON.parse(e.newValue || '[]');
                    setSessions(prevSessions => {
                        const starred = prevSessions.filter(s => starredIds.includes(s.id));
                        setStarredSessions(starred.slice(0, 3));
                        return prevSessions;
                    });
                } catch {
                    setStarredSessions([]);
                }
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const handleRestore = async (sessionId) => {
        try {
            await api.post(`/chat/sessions/${sessionId}/restore`);
            // Refresh counts
            fetchSessions();
            fetchDeletedSessions();
        } catch (err) {
            console.error("Failed to restore session:", err);
            alert("Failed to restore chat session.");
        }
    };

    const handleExport = () => {
        alert("Downloading Report... (Mock Action)");
    };

    return (
        <PageTransition className="space-y-8 pb-12">
            {/* Header */}
            <div className="flex flex-col justify-between space-y-4 md:flex-row md:items-center md:space-y-0">
                <div>
                    <h1 className="text-3xl font-semibold text-foreground">
                        My Dashboard
                    </h1>
                    <p className="text-foreground-muted">
                        Manage your documents, chats, and learning progress.
                    </p>
                </div>
                <div className="flex w-full flex-col space-y-3 md:w-auto md:flex-row md:space-x-4 md:space-y-0">
                    <Input 
                        placeholder="Search topics..." 
                        className="w-full md:w-64 rounded-full transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 hover:border-accent/40 focus-visible:shadow-md focus-visible:-translate-y-0.5" 
                    />
                    {isTeacher && (
                        <Link to="/chat?mode=classroom-plan" className="w-full md:w-auto">
                            <Button className="w-full">
                                <Plus className="mr-2 h-4 w-4" /> New Plan
                            </Button>
                        </Link>
                    )}
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-1 md:gap-6 lg:grid-cols-4 lg:gap-6">
                {/* Sidebar / Stats */}
                <div className="contents md:block space-y-0 md:space-y-6 lg:col-span-1">
                    <div className="order-1 col-span-1 md:order-none md:col-span-1">
                        <Card className="p-3 sm:p-4 md:p-4 space-y-3 sm:space-y-4 border-border-base dark:border-white/5 h-full flex flex-col justify-center">
                            <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left space-y-2 sm:space-y-0 sm:space-x-3">
                                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-accent/10 dark:bg-white/5 flex items-center justify-center shrink-0">
                                    <Settings className="h-4 w-4 sm:h-5 sm:w-5 text-foreground-muted" />
                                </div>
                                <div>
                                    <h3 className="text-[11px] sm:text-sm md:text-base font-medium text-foreground">Quick Stats</h3>
                                    <p className="text-[9px] sm:text-[10px] md:text-xs text-foreground-muted">Last 7 days</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:gap-4 pt-2">
                                <div className="text-center p-1.5 sm:p-2 rounded-lg bg-accent/5 dark:bg-white/5 flex flex-col justify-center">
                                    <div className="text-lg sm:text-2xl font-bold text-accent">85%</div>
                                    <div className="text-[8px] sm:text-[10px] uppercase tracking-wider text-foreground-muted">Mastery</div>
                                </div>
                                <div className="text-center p-1.5 sm:p-2 rounded-lg bg-accent/5 dark:bg-white/5 flex flex-col justify-center">
                                    <div className="text-lg sm:text-2xl font-bold text-foreground dark:text-white">12</div>
                                    <div className="text-[8px] sm:text-[10px] uppercase tracking-wider text-foreground-muted">Hours</div>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="order-6 col-span-2 md:order-none md:col-span-1 mt-6 md:mt-0">
                        <Card className="p-4 border-border-base dark:border-white/5">
                            <h4 className="mb-4 text-sm font-medium text-foreground-muted">RECENT CHATS</h4>
                            <ul className="space-y-3">
                                {isLoadingSessions ? (
                                    <li className="text-sm text-foreground-muted p-2">Loading activity...</li>
                                ) : sessions.length > 0 ? (
                                    sessions.map((session) => (
                                        <Link to={`/chat?sessionId=${session.id}`} key={session.id}>
                                            <li className="flex items-center space-x-3 text-sm group cursor-pointer hover:bg-accent/10 dark:hover:bg-white/5 p-2 rounded-md transition-colors">
                                                <div className="h-2 w-2 rounded-full bg-accent/50 group-hover:bg-accent transition-colors" />
                                                <span className="text-foreground group-hover:text-foreground dark:group-hover:text-white transition-colors truncate">
                                                    {session.title || "Chat Session"}
                                                </span>
                                            </li>
                                        </Link>
                                    ))
                                ) : (
                                    <li className="text-sm text-foreground-muted p-2 italic">
                                        {isTeacher ? "No recent activity" : "No recent chats"}
                                    </li>
                                )}
                            </ul>
                        </Card>
                    </div>

                    <div className="order-7 col-span-2 md:order-none md:col-span-1 mt-6 md:mt-0">
                        <Card className="p-4 border-border-base dark:border-white/5">
                            <h4 className="mb-4 text-sm font-medium text-foreground-muted uppercase tracking-wider">Starred Chats</h4>
                            <ul className="space-y-3">
                                {isLoadingSessions ? (
                                    <li className="text-sm text-foreground-muted p-2">Loading starred...</li>
                                ) : starredSessions.length > 0 ? (
                                    starredSessions.map((session) => (
                                        <Link to={`/chat?sessionId=${session.id}`} key={session.id}>
                                            <li className="flex items-center space-x-3 text-sm group cursor-pointer hover:bg-accent/10 dark:hover:bg-white/5 p-2 rounded-md transition-colors">
                                                <Star className="h-4 w-4 text-yellow-500 group-hover:text-yellow-600 transition-colors shrink-0" />
                                                <span className="text-foreground group-hover:text-foreground dark:group-hover:text-white transition-colors truncate">
                                                    {session.title || "Chat Session"}
                                                </span>
                                            </li>
                                        </Link>
                                    ))
                                ) : (
                                    <li className="text-sm text-foreground-muted p-2 italic">
                                        No starred chats
                                    </li>
                                )}
                            </ul>
                        </Card>
                    </div>
                </div>

                {/* Content Area */}
                <div className="contents md:block space-y-0 md:space-y-6 lg:col-span-3">
                    {/* Action / Suggestion Cards */}
                    <div className="contents md:grid md:grid-cols-3 md:gap-6">
                        <Link to="/roadmaps" className="order-2 col-span-1 md:order-none md:col-span-1">
                            <Card className="p-3 sm:p-4 md:p-6 cursor-pointer hover:bg-accent/5 dark:hover:bg-white/5 transition-colors group h-full border-border-base dark:border-white/5 flex flex-col items-center md:items-start text-center md:text-left justify-center">
                                <Map className="h-6 w-6 md:h-8 md:w-8 text-accent mb-2 md:mb-4 group-hover:scale-110 transition-transform" />
                                <h3 className="font-semibold text-xs sm:text-sm md:text-base text-foreground">My Roadmaps</h3>
                                <p className="text-[10px] sm:text-xs md:text-sm text-foreground-muted mt-1 md:mt-2 line-clamp-2 md:line-clamp-none">View and manage your learning roadmaps.</p>
                            </Card>
                        </Link>

                        <Link to="/chat?mode=deep-dive" className="order-3 col-span-1 md:order-none md:col-span-1">
                            <Card className="p-3 sm:p-4 md:p-6 cursor-pointer hover:bg-accent/5 dark:hover:bg-white/5 transition-colors group h-full border-border-base dark:border-white/5 flex flex-col items-center md:items-start text-center md:text-left justify-center">
                                <GlobeChatIcon className="h-6 w-6 md:h-8 md:w-8 text-purple-400 mb-2 md:mb-4 group-hover:scale-110 transition-transform" />
                                <h3 className="font-semibold text-xs sm:text-sm md:text-base text-foreground">Start New Chat</h3>
                                <p className="text-[10px] sm:text-xs md:text-sm text-foreground-muted mt-1 md:mt-2 line-clamp-2 md:line-clamp-none">Ask questions to the AI.</p>
                            </Card>
                        </Link>

                        <div className={`order-4 col-span-1 md:order-none md:col-span-1 transition-all duration-300 h-full ${!isTeacher && showDeleted ? 'col-span-2 md:col-span-2 md:row-span-2' : ''}`}>
                            <Card className={`p-3 sm:p-4 md:p-6 border-border-base dark:border-white/5 flex flex-col h-full`}>
                                <div
                                    className="flex flex-col h-full cursor-pointer"
                                    onClick={() => !isTeacher && setShowDeleted(!showDeleted)}
                                >
                                    <div className="flex items-center justify-center md:justify-between mb-2 md:mb-4">
                                        <FileText className={`h-6 w-6 md:h-8 md:w-8 ${isTeacher ? 'text-green-400' : 'text-orange-400'} group-hover:scale-110 transition-transform`} />
                                        {!isTeacher && (
                                            <div className="hidden md:flex items-center space-x-2">
                                                <span className="text-xs font-medium px-2 py-1 rounded-full bg-orange-400/10 text-orange-400">
                                                    {deletedSessions.length} Deleted
                                                </span>
                                                {showDeleted ? <ChevronUp className="h-4 w-4 text-foreground-muted" /> : <ChevronDown className="h-4 w-4 text-foreground-muted" />}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-center md:items-start text-center md:text-left">
                                        <h3 className="font-semibold text-xs sm:text-sm md:text-base text-foreground flex items-center justify-center">
                                            {isTeacher ? "Export Reports" : "Retrieve Chats"}
                                            {!isTeacher && (
                                                <span className="ml-1 md:hidden">
                                                    {showDeleted ? <ChevronUp className="h-3 w-3 text-foreground-muted" /> : <ChevronDown className="h-3 w-3 text-foreground-muted" />}
                                                </span>
                                            )}
                                        </h3>
                                        <p className="text-[10px] sm:text-xs md:text-sm text-foreground-muted mt-1 md:mt-2 line-clamp-2 md:line-clamp-none">
                                            {isTeacher ? "Access your saved content." : "Retrieve or restore your deleted chats."}
                                        </p>
                                    </div>

                                    {!isTeacher && showDeleted && (
                                        <div className="mt-6 space-y-3 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar" onClick={(e) => e.stopPropagation()}>
                                            <h4 className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">Retrieve Chats</h4>
                                            {isLoadingDeleted ? (
                                                <p className="text-sm text-foreground-muted py-4">Loading chats...</p>
                                            ) : deletedSessions.length > 0 ? (
                                                deletedSessions.map((session) => (
                                                    <div key={session.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/5 border border-white/5 hover:bg-accent/10 transition-colors">
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-sm font-medium text-foreground truncate">{session.title || "Untitled Chat"}</span>
                                                            <span className="text-[10px] text-foreground-muted">
                                                                Deleted on {new Date(session.deletedAt).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-8 w-8 p-0 text-accent hover:text-accent-bright hover:bg-accent/10"
                                                            onClick={() => handleRestore(session.id)}
                                                            title="Restore Chat"
                                                        >
                                                            <RotateCcw className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="flex flex-col items-center justify-center py-8 text-foreground-muted opacity-60">
                                                    <RotateCcw className="h-8 w-8 mb-2" />
                                                    <p className="text-sm">No chats to retrieve</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </Card>
                        </div>
                    </div>

                    {/* File Upload Section - Available to All */}
                    <div className="order-5 col-span-2 md:order-none md:col-span-1 grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mt-6 md:mt-0">
                        <Card className="p-6 border-border-base dark:border-white/5">
                            <h3 className="text-lg font-semibold text-foreground mb-4">Upload Documents</h3>
                            <FileUpload onUpload={addDocument} />
                        </Card>

                        <Card className="p-6 border-border-base dark:border-white/5 flex flex-col">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-foreground">Recent Uploads</h3>
                                <Link to="/documents">
                                    <Button variant="ghost" size="sm" className="text-accent hover:text-accent-bright">
                                        View All <ArrowRight className="ml-1 h-3 w-3" />
                                    </Button>
                                </Link>
                            </div>
                            <div className="flex-1 space-y-2">
                                {recentDocs.length > 0 ? (
                                    recentDocs.map(doc => (
                                        <div key={doc.id} className="flex items-center space-x-3 p-2 rounded-md bg-accent/5 hover:bg-accent/10 transition-colors">
                                            <div className="h-8 w-8 rounded bg-accent/20 flex items-center justify-center text-accent">
                                                <FileText className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                                                <p className="text-[10px] text-foreground-muted">
                                                    {(doc.size / 1024 / 1024).toFixed(1)} MB • {new Date(doc.date).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-foreground-muted opacity-60">
                                        <FileText className="h-8 w-8 mb-2" />
                                        <p className="text-sm">No recent documents</p>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>

                    {/* Students Also Ask Section */}
                    <div className="order-7 col-span-2 md:order-none md:col-span-1 mt-6 md:mt-0">
                        <Card className="p-6 min-h-[400px] border-border-base dark:border-white/5">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-semibold text-foreground">
                                    Students Also Ask
                                </h3>
                                <span className="text-xs text-foreground-muted bg-accent/10 px-2 py-1 rounded-full text-accent font-medium">Manually Curated</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[
                                    "What are the 5Ws and 1H in news reporting?",
                                    "Explain the difference between misinformation and disinformation.",
                                    "What is media convergence?",
                                    "How does media literacy relate to information literacy?",
                                    "What is development communication?",
                                    "What are the levels of digital inequality?"
                                ].map((question, i) => (
                                    <Link
                                        to={`/chat?prompt=${encodeURIComponent(question)}`}
                                        key={i}
                                        className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-accent/20 transition-all group"
                                    >
                                        <div className="flex items-center space-x-4">
                                            <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                                                <Lightbulb className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <h4 className="font-medium text-sm text-foreground group-hover:text-accent transition-colors line-clamp-2">
                                                    {question}
                                                </h4>
                                            </div>
                                        </div>
                                        <div className="h-8 w-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all bg-accent/10 text-accent shrink-0">
                                            <ArrowRight className="h-4 w-4" />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </PageTransition>
    );
}
