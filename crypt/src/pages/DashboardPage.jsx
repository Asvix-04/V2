import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { PageTransition } from "../components/ui/PageTransition";
import {
    FileText, Lightbulb, Plus, Settings, ArrowRight,
    RotateCcw, ChevronDown, ChevronUp
} from "lucide-react";
import { PerformanceStats } from "../components/PerformanceStats";
import api from "../lib/api";

const STUDENT_QUESTIONS = [
    "What are the 5Ws and 1H in news reporting?",
    "Explain the difference between misinformation and disinformation.",
    "What is media convergence?",
    "How does media literacy relate to information literacy?",
    "What is development communication?",
    "What are the levels of digital inequality?",
];

export function DashboardPage() {
    const [searchParams] = useSearchParams();
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const mode = searchParams.get("mode") || user.role || "student";
    const isTeacher = mode === "teacher";

    const [deletedSessions, setDeletedSessions] = useState([]);
    const [isLoadingDeleted, setIsLoadingDeleted] = useState(true);
    const [showDeleted, setShowDeleted] = useState(false);

    const fetchDeletedSessions = async () => {
        if (user && user.id) {
            try {
                const res = await api.get('/chat/sessions-deleted');
                if (res.data) setDeletedSessions(res.data);
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
        if (!isTeacher) fetchDeletedSessions();
    }, []);

    const handleRestore = async (sessionId) => {
        try {
            await api.post(`/chat/sessions/${sessionId}/restore`);
            fetchDeletedSessions();
        } catch (err) {
            console.error("Failed to restore session:", err);
            alert("Failed to restore chat session.");
        }
    };

    return (
        <PageTransition className="space-y-10 pb-12">
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="flex flex-col justify-between space-y-4 md:flex-row md:items-center md:space-y-0">
                <div>
                    <h1 className="text-3xl font-semibold text-foreground">My Workspace</h1>
                    <p className="text-foreground-muted">
                        Explore curated questions, monitor system performance, and manage your chats.
                    </p>
                </div>
                <div className="flex space-x-4">
                    <Input placeholder="Search topics..." className="w-64" />
                    {isTeacher && (
                        <Link to="/chat?mode=classroom-plan">
                            <Button>
                                <Plus className="mr-2 h-4 w-4" /> New Plan
                            </Button>
                        </Link>
                    )}
                </div>
            </div>

            {/* ── Students Also Ask (moved up) ───────────────────── */}
            <section>
                <Card className="p-6 border-border-base dark:border-white/5">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-semibold text-foreground">Students Also Ask</h2>
                            <p className="text-xs text-foreground-muted mt-1">
                                Hand-picked questions to jump-start your learning.
                            </p>
                        </div>
                        <span className="text-xs text-accent font-medium bg-accent/10 px-2 py-1 rounded-full">
                            Manually Curated
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {STUDENT_QUESTIONS.map((question, i) => (
                            <Link
                                to={`/chat?prompt=${encodeURIComponent(question)}`}
                                key={i}
                                className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-accent/20 transition-all group"
                            >
                                <div className="flex items-center space-x-3 min-w-0">
                                    <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                                        <Lightbulb className="h-4 w-4" />
                                    </div>
                                    <h4 className="font-medium text-sm text-foreground group-hover:text-accent transition-colors line-clamp-2">
                                        {question}
                                    </h4>
                                </div>
                                <div className="h-8 w-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all bg-accent/10 text-accent shrink-0 ml-2">
                                    <ArrowRight className="h-4 w-4" />
                                </div>
                            </Link>
                        ))}
                    </div>
                </Card>
            </section>

            {/* ── Performance Stats (live metrics) ───────────────── */}
            <section>
                <div className="mb-4">
                    <h2 className="text-xl font-semibold text-foreground">System Performance</h2>
                    <p className="text-xs text-foreground-muted mt-1">
                        Live response times, success rate, and health timeline.
                    </p>
                </div>
                <PerformanceStats />
            </section>

            {/* ── Utility row: Quick Stats + Retrieve Chats ──────── */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Quick Stats */}
                <Card className="p-5 space-y-4 border-border-base dark:border-white/5 lg:col-span-1">
                    <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 rounded-full bg-accent/10 dark:bg-white/5 flex items-center justify-center">
                            <Settings className="h-5 w-5 text-foreground-muted" />
                        </div>
                        <div>
                            <h3 className="font-medium text-foreground">Quick Stats</h3>
                            <p className="text-xs text-foreground-muted">Last 7 days</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 rounded-lg bg-accent/5 dark:bg-white/5">
                            <div className="text-2xl font-bold text-accent">85%</div>
                            <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1">Mastery</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-accent/5 dark:bg-white/5">
                            <div className="text-2xl font-bold text-foreground dark:text-white">12</div>
                            <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1">Hours</div>
                        </div>
                    </div>
                </Card>

                {/* Retrieve Chats */}
                <Card className="p-5 border-border-base dark:border-white/5 lg:col-span-2 flex flex-col">
                    <div
                        className="flex flex-col cursor-pointer"
                        onClick={() => !isTeacher && setShowDeleted(!showDeleted)}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-3">
                                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isTeacher ? 'bg-green-400/10 text-green-400' : 'bg-orange-400/10 text-orange-400'}`}>
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="font-medium text-foreground">
                                        {isTeacher ? "Export Reports" : "Retrieve Chats"}
                                    </h3>
                                    <p className="text-xs text-foreground-muted">
                                        {isTeacher
                                            ? "Access your saved content."
                                            : "Retrieve or restore your deleted chats."}
                                    </p>
                                </div>
                            </div>
                            {!isTeacher && (
                                <div className="flex items-center space-x-2">
                                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-orange-400/10 text-orange-400">
                                        {deletedSessions.length} Deleted
                                    </span>
                                    {showDeleted
                                        ? <ChevronUp className="h-4 w-4 text-foreground-muted" />
                                        : <ChevronDown className="h-4 w-4 text-foreground-muted" />}
                                </div>
                            )}
                        </div>

                        {!isTeacher && showDeleted && (
                            <div
                                className="mt-3 space-y-2 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {isLoadingDeleted ? (
                                    <p className="text-sm text-foreground-muted py-4">Loading chats...</p>
                                ) : deletedSessions.length > 0 ? (
                                    deletedSessions.map((session) => (
                                        <div
                                            key={session.id}
                                            className="flex items-center justify-between p-3 rounded-lg bg-accent/5 border border-white/5 hover:bg-accent/10 transition-colors"
                                        >
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-medium text-foreground truncate">
                                                    {session.title || "Untitled Chat"}
                                                </span>
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
            </section>
        </PageTransition>
    );
}
