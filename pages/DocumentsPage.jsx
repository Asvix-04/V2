import * as React from "react";
import { Link } from "react-router-dom";
import { PageTransition } from "../components/ui/PageTransition";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ArrowLeft, FileText, Search, Trash2, File, Calendar, HardDrive } from "lucide-react";
import { useDocuments } from "../context/DocumentContext";

export function DocumentsPage() {
    const { documents, removeDocument } = useDocuments();
    const [searchQuery, setSearchQuery] = React.useState("");

    const filteredDocs = documents.filter(doc =>
        doc.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    return (
        <PageTransition className="space-y-8 pb-12">
            {/* Header */}
            <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
                <div className="flex items-center space-x-4">
                    <Link to="/dashboard?mode=teacher">
                        <Button variant="ghost" size="icon" className="rounded-full">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-semibold text-foreground">Course Materials</h1>
                        <p className="text-foreground-muted">Manage your uploaded documents and resources.</p>
                    </div>
                </div>

                <div className="relative w-full md:w-96">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <Search className="h-4 w-4 text-foreground-muted" />
                    </div>
                    <Input
                        placeholder="Search documents..."
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Documents Grid */}
            {filteredDocs.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredDocs.map((doc) => (
                        <Card key={doc.id} className="group relative flex flex-col p-4 border-border-base dark:border-white/5 hover:bg-accent/5 transition-all duration-300 hover:-translate-y-1">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
                                <FileText className="h-6 w-6" />
                            </div>

                            <div className="flex-1 space-y-1">
                                <h3 className="font-medium text-foreground truncate" title={doc.name}>
                                    {doc.name}
                                </h3>
                                <div className="flex items-center space-x-2 text-xs text-foreground-muted">
                                    <span className="flex items-center">
                                        <HardDrive className="mr-1 h-3 w-3" />
                                        {(doc.size / 1024 / 1024).toFixed(2)} MB
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center">
                                        <Calendar className="mr-1 h-3 w-3" />
                                        {formatDate(doc.date)}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-border-base dark:border-white/5 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-400 hover:text-red-500 hover:bg-red-500/10"
                                    onClick={() => removeDocument(doc.id)}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" /> Remove
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="h-16 w-16 rounded-full bg-surface flex items-center justify-center mb-4">
                        <File className="h-8 w-8 text-foreground-muted" />
                    </div>
                    <h3 className="text-xl font-medium text-foreground">No documents found</h3>
                    <p className="text-foreground-muted mt-2 max-w-sm">
                        {searchQuery
                            ? `No documents matching "${searchQuery}"`
                            : "Upload materials in the Dashboard to see them here."}
                    </p>
                    {searchQuery && (
                        <Button
                            variant="link"
                            className="mt-4 text-accent"
                            onClick={() => setSearchQuery("")}
                        >
                            Clear search
                        </Button>
                    )}
                </div>
            )}
        </PageTransition>
    );
}
