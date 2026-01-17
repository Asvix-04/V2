import { useSearchParams, Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { FileUpload } from "../components/ui/FileUpload";
import { PageTransition } from "../components/ui/PageTransition";
import { useDocuments } from "../context/DocumentContext";
import { BookOpen, FileText, Layout, Lightbulb, MessageSquare, Plus, Search, Settings, ArrowRight } from "lucide-react";

export function DashboardPage() {
    const [searchParams] = useSearchParams();
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const mode = searchParams.get("mode") || user.role || "student"; // Default to student
    const isTeacher = mode === "teacher";
    const { documents, addDocument } = useDocuments();

    // Get 3 most recent documents
    const recentDocs = documents.slice(0, 3);

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

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
                {/* Sidebar / Stats */}
                <div className="space-y-6 lg:col-span-1">
                    <Card className="p-4 space-y-4 border-border-base dark:border-white/5">
                        <div className="flex items-center space-x-3">
                            <div className="h-10 w-10 rounded-full bg-accent/10 dark:bg-white/5 flex items-center justify-center">
                                <Settings className="h-5 w-5 text-foreground-muted" />
                            </div>
                            <div>
                                <h3 className="font-medium text-foreground">Quick Stats</h3>
                                <p className="text-xs text-foreground-muted">Last 7 days</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <div className="text-center p-2 rounded-lg bg-accent/5 dark:bg-white/5">
                                <div className="text-2xl font-bold text-accent">85%</div>
                                <div className="text-[10px] uppercase tracking-wider text-foreground-muted">Mastery</div>
                            </div>
                            <div className="text-center p-2 rounded-lg bg-accent/5 dark:bg-white/5">
                                <div className="text-2xl font-bold text-foreground dark:text-white">12</div>
                                <div className="text-[10px] uppercase tracking-wider text-foreground-muted">Hours</div>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-4 border-border-base dark:border-white/5">
                        <h4 className="mb-4 text-sm font-medium text-foreground-muted">RECENT ACTIVITY</h4>
                        <ul className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <Link to={`/chat?session=${i}`} key={i}>
                                    <li className="flex items-center space-x-3 text-sm group cursor-pointer hover:bg-accent/10 dark:hover:bg-white/5 p-2 rounded-md transition-colors">
                                        <div className="h-2 w-2 rounded-full bg-accent/50 group-hover:bg-accent transition-colors" />
                                        <span className="text-foreground group-hover:text-foreground dark:group-hover:text-white transition-colors">
                                            {isTeacher ? `Updated syllabus for Week ${i}` : `Completed Module ${i}: Thermodynamics`}
                                        </span>
                                    </li>
                                </Link>
                            ))}
                        </ul>
                    </Card>
                </div>

                {/* Content Area */}
                <div className="space-y-6 lg:col-span-3">
                    {/* Action / Suggestion Cards */}
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                        <Link to="/chat?mode=overview">
                            <Card className="p-6 cursor-pointer hover:bg-accent/5 dark:hover:bg-white/5 transition-colors group h-full border-border-base dark:border-white/5">
                                <Layout className="h-8 w-8 text-accent mb-4 group-hover:scale-110 transition-transform" />
                                <h3 className="font-semibold text-foreground">Browse Topics</h3>
                                <p className="text-sm text-foreground-muted mt-2">Explore related academic concepts.</p>
                            </Card>
                        </Link>

                        <Link to="/chat?mode=deep-dive">
                            <Card className="p-6 cursor-pointer hover:bg-accent/5 dark:hover:bg-white/5 transition-colors group h-full border-border-base dark:border-white/5">
                                <MessageSquare className="h-8 w-8 text-purple-400 mb-4 group-hover:scale-110 transition-transform" />
                                <h3 className="font-semibold text-foreground">Start New Chat</h3>
                                <p className="text-sm text-foreground-muted mt-2">Ask questions to the AI.</p>
                            </Card>
                        </Link>

                        <div onClick={handleExport}>
                            <Card className="p-6 cursor-pointer hover:bg-accent/5 dark:hover:bg-white/5 transition-colors group h-full border-border-base dark:border-white/5">
                                <FileText className="h-8 w-8 text-green-400 mb-4 group-hover:scale-110 transition-transform" />
                                <h3 className="font-semibold text-foreground">{isTeacher ? "Export Reports" : "Review Notes"}</h3>
                                <p className="text-sm text-foreground-muted mt-2">Access your saved content.</p>
                            </Card>
                        </div>
                    </div>

                    {/* File Upload Section - Available to All */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

                    {/* Recent Plans / Courses List */}
                    <Card className="p-6 min-h-[400px] border-border-base dark:border-white/5">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold text-foreground">
                                {isTeacher ? "Your Lesson Plans" : "Current Courses"}
                            </h3>
                            <Button variant="ghost" size="sm" onClick={() => alert("Feature coming soon!")}>View All</Button>
                        </div>

                        <div className="space-y-4">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors group">
                                    <div className="flex items-center space-x-4">
                                        <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent font-bold">
                                            {isTeacher ? "Ph" : "CS"}
                                        </div>
                                        <div>
                                            <h4 className="font-medium text-foreground group-hover:text-accent-bright transition-colors">
                                                {isTeacher ? "Physics 101: Mechanics" : "Computer Science: Algorithms"}
                                            </h4>
                                            <p className="text-sm text-foreground-muted">Last edited 2 hours ago</p>
                                        </div>
                                    </div>
                                    <Link to={`/chat?context=course_${i}`}>
                                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-all">
                                            Open
                                        </Button>
                                    </Link>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            </div>
        </PageTransition>
    );
}
