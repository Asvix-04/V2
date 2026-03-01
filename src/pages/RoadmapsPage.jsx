import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Flag, CheckCircle, ChevronRight, BookOpen, Search, Plus, X, ChevronDown, ChevronUp, Layers, Sparkles, Trash2 } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { PageTransition } from "../components/ui/PageTransition";
import { useRoadmaps } from "../context/RoadmapContext";
import { AnimatePresence, motion } from "framer-motion";

// Separate component for roadmap card to properly use hooks
function RoadmapCard({ roadmap, progress, onEnroll, onUpdateTopic, onDelete }) {
    const navigate = useNavigate();
    const [isExpanded, setIsExpanded] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const completedCount = progress ? progress.completedTopicIds.length : 0;
    const totalCount = roadmap.topics.length;
    const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    const handleStartLearning = async () => {
        await onEnroll();
        // Navigate to chat with first topic
        navigate(`/chat?roadmapId=${roadmap.id}&topicId=${roadmap.topics[0].id}`);
    };

    const handleDelete = async () => {
        try {
            await onDelete();
            setShowDeleteConfirm(false);
        } catch (err) {
            console.error("Error deleting:", err);
        }
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
        >
            <Card className={`h-full flex flex-col p-0 overflow-hidden border-border-base dark:border-white/5 hover:border-accent/50 transition-all duration-300 group ${isExpanded ? 'ring-1 ring-accent/20' : ''}`}>
                {/* Card Header */}
                <div className="p-6 pb-4 flex-1 flex flex-col relative">
                    <div className="absolute top-0 right-0 p-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-foreground-muted hover:text-red-500 transition-colors"
                            title="Delete roadmap"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="flex justify-between items-start mb-4">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center text-accent ring-1 ring-accent/20">
                            <Layers className="h-5 w-5" />
                        </div>
                        {/* Always show progress badge */}
                        <div className={`flex items-center space-x-1 text-xs px-2 py-1 rounded-full border ${progress
                                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                : 'bg-white/5 text-foreground-muted border-white/10'
                            }`}>
                            <CheckCircle className="h-3 w-3" />
                            <span className="font-medium">{percent}%</span>
                        </div>
                    </div>

                    <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-accent transition-colors">{roadmap.title}</h3>
                    <p className="text-sm text-foreground-muted line-clamp-2 leading-relaxed">
                        {roadmap.description}
                    </p>
                </div>

                {/* Progress Bar - Always visible */}
                <div className="px-6 pb-4">
                    <div className="relative w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percent}%` }}
                            className="absolute top-0 left-0 h-full bg-accent rounded-full"
                        />
                    </div>
                    <div className="flex justify-between mt-1.5 text-xs text-foreground-muted">
                        <span>{completedCount} of {totalCount} topics</span>
                        {progress && <span>In Progress</span>}
                    </div>
                </div>

                {/* Card Footer / Actions */}
                <div className="p-6 pt-0 mt-auto space-y-4">
                    {progress ? (
                        <div className="flex gap-2">
                            <Link to={`/chat?roadmapId=${roadmap.id}&topicId=${roadmap.topics[0].id}`} className="flex-1">
                                <Button className="w-full bg-white/5 hover:bg-white/10 border-white/5 text-foreground" variant="outline" size="sm">
                                    Continue
                                </Button>
                            </Link>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="px-2 text-foreground-muted hover:text-foreground"
                                onClick={() => setIsExpanded(!isExpanded)}
                            >
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                        </div>
                    ) : (
                        <Button
                            className="w-full bg-accent text-white hover:bg-accent-bright shadow-lg shadow-accent/20"
                            onClick={handleStartLearning}
                        >
                            Start Learning
                        </Button>
                    )}
                </div>

                {/* Expanded Content */}
                <AnimatePresence>
                    {isExpanded && progress && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-white/5 bg-black/20"
                        >
                            <div className="p-4 space-y-1">
                                {roadmap.topics.map((topic) => {
                                    const isDone = progress.completedTopicIds.includes(topic.id);
                                    return (
                                        <div
                                            key={topic.id}
                                            className="flex items-center group/item p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                                            onClick={() => onUpdateTopic(roadmap.id, topic.id, !isDone)}
                                        >
                                            <div className={`mr-3 h-4 w-4 rounded-full border flex items-center justify-center transition-all ${isDone ? 'bg-accent border-accent' : 'border-white/20 group-hover/item:border-accent'}`}>
                                                {isDone && <CheckCircle className="h-3 w-3 text-white" />}
                                            </div>
                                            <span className={`text-sm transition-colors ${isDone ? 'text-foreground-muted line-through' : 'text-foreground'}`}>
                                                {topic.title}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Delete Confirmation Modal */}
                <AnimatePresence>
                    {showDeleteConfirm && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-background-base/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center rounded-[32px]"
                        >
                            <Trash2 className="h-10 w-10 text-red-500 mb-4" />
                            <h4 className="text-lg font-bold text-foreground mb-2">Delete Roadmap?</h4>
                            <p className="text-sm text-foreground-muted mb-6">This action cannot be undone.</p>
                            <div className="flex gap-3">
                                <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    className="bg-red-500 hover:bg-red-600 text-white"
                                    onClick={handleDelete}
                                >
                                    Delete
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </Card>
        </motion.div>
    );
}

export function RoadmapsPage() {
    const { roadmaps, enroll, getProgressForRoadmap, updateTopicProgress, createRoadmap, deleteRoadmap } = useRoadmaps();
    const [searchTerm, setSearchTerm] = useState("");
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Create Form State
    const [newTitle, setNewTitle] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [newTopics, setNewTopics] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    const handleCreate = async () => {
        if (!newTitle || !newDesc || !newTopics) return;
        setIsCreating(true);
        try {
            const topicsList = newTopics.split(',').map(t => ({ title: t.trim() })).filter(t => t.title);

            await createRoadmap({
                title: newTitle,
                description: newDesc,
                topics: topicsList
            });
            setShowCreateModal(false);
            setNewTitle(""); setNewDesc(""); setNewTopics("");
        } catch (e) {
            console.error("Error creating roadmap:", e);
        } finally {
            setIsCreating(false);
        }
    };

    const filteredRoadmaps = roadmaps.filter(r =>
        r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <PageTransition className="min-h-screen pb-20">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                <div>
                    <h1 className="text-4xl font-bold text-foreground mb-2">
                        Explore Paths
                    </h1>
                    <p className="text-lg text-foreground-muted max-w-2xl">
                        Discover structured learning journeys tailored to master new skills effectively.
                    </p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted peer-focus:text-accent transition-colors" />
                        <Input
                            placeholder="Find a roadmap..."
                            className="pl-10 bg-white/5 border-white/10 focus:border-accent/50 focus:bg-white/10 transition-all rounded-full"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button onClick={() => setShowCreateModal(true)} className="rounded-full shadow-lg shadow-accent/20 bg-accent hover:bg-accent-bright text-white px-6">
                        <Plus className="mr-2 h-4 w-4" /> New Path
                    </Button>
                </div>
            </div>

            {/* Grid */}
            {filteredRoadmaps.length > 0 ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredRoadmaps.map((roadmap) => (
                        <RoadmapCard
                            key={roadmap.id}
                            roadmap={roadmap}
                            progress={getProgressForRoadmap(roadmap.id)}
                            onEnroll={() => enroll(roadmap.id)}
                            onUpdateTopic={updateTopicProgress}
                            onDelete={() => deleteRoadmap(roadmap.id)}
                        />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center mb-6 ring-1 ring-white/10">
                        <Search className="h-8 w-8 text-foreground-muted" />
                    </div>
                    <h3 className="text-2xl font-bold text-foreground mb-2">No paths found</h3>
                    <p className="text-foreground-muted max-w-md mx-auto mb-8">
                        We couldn't find any roadmaps matching your search. Why not create your own custom learning path?
                    </p>
                    <Button onClick={() => setShowCreateModal(true)} variant="outline">
                        Create New Roadmap
                    </Button>
                </div>
            )}

            {/* Create Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0"
                            onClick={() => setShowCreateModal(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative bg-white w-full max-w-lg rounded-2xl border border-gray-200 shadow-2xl overflow-hidden"
                        >
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-xl text-gray-900">Create Roadmap</h3>
                                    <p className="text-xs text-gray-500">Define your learning journey</p>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setShowCreateModal(false)} className="rounded-full hover:bg-gray-100">
                                    <X className="h-5 w-5 text-gray-500" />
                                </Button>
                            </div>

                            <div className="p-6 space-y-5">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700 ml-1">Title</label>
                                    <Input
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                        placeholder="e.g. Advanced System Design"
                                        className="bg-gray-50 border-gray-200 focus:border-accent/50"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700 ml-1">Description</label>
                                    <Input
                                        value={newDesc}
                                        onChange={(e) => setNewDesc(e.target.value)}
                                        placeholder="Briefly describe what this roadmap covers..."
                                        className="bg-gray-50 border-gray-200 focus:border-accent/50"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700 ml-1">
                                        Topics
                                        <span className="ml-2 text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full">Comma separated</span>
                                    </label>
                                    <textarea
                                        className="flex min-h-[100px] w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                                        value={newTopics}
                                        onChange={(e) => setNewTopics(e.target.value)}
                                        placeholder="Introduction, Core Concepts, Advanced Techniques, Real-world Projects..."
                                    />
                                </div>
                            </div>

                            <div className="p-6 pt-2 flex justify-end gap-3 bg-gray-50">
                                <Button variant="ghost" onClick={() => setShowCreateModal(false)} className="text-gray-600 hover:bg-gray-100">Cancel</Button>
                                <Button
                                    onClick={handleCreate}
                                    disabled={!newTitle || !newDesc || !newTopics || isCreating}
                                    className="bg-accent hover:bg-accent-bright min-w-[120px]"
                                >
                                    {isCreating ? "Creating..." : "Create Path"}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </PageTransition>
    );
}
