const Roadmap = require('../models/Roadmap');
const UserProgress = require('../models/UserProgress');

exports.createRoadmap = async (req, res) => {
    try {
        const { title, description, topics } = req.body;

        if (!title || !description || !topics || !Array.isArray(topics)) {
            return res.status(400).json({ message: 'Title, description, and topics array are required' });
        }

        // Basic validation for topics
        if (topics.length === 0) {
            return res.status(400).json({ message: 'Roadmap must have at least one topic' });
        }

        const roadmapData = {
            title,
            description,
            topics: topics.map((t, index) => ({
                id: t.id || `topic_${Date.now()}_${index}`,
                title: t.title,
                prompt: t.prompt || `Explain ${t.title}`
            }))
        };

        const newRoadmap = await Roadmap.create(roadmapData);
        res.status(201).json(newRoadmap);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.getAllRoadmaps = async (req, res) => {
    try {
        let roadmaps = await Roadmap.getAll();

        // Auto-seed if empty
        if (roadmaps.length === 0) {
            const seedRoadmaps = [
                {
                    title: "React Mastery",
                    description: "A comprehensive guide to becoming a React expert, from basics to advanced patterns.",
                    topics: [
                        { id: "react_1", title: "React Basics", prompt: "Explain Components, JSX, Props, and State." },
                        { id: "react_2", title: "Hooks Deep Dive", prompt: "Master useState, useEffect, useContext, and custom hooks." },
                        { id: "react_3", title: "State Management", prompt: "Compare Context API, Redux, and Zustand." },
                        { id: "react_4", title: "Performance Optimization", prompt: "Learn about React.memo, useMemo, useCallback, and code splitting." },
                        { id: "react_5", title: "Advanced Patterns", prompt: "Explore HOCs, Render Props, and Compound Components." }
                    ]
                },
                {
                    title: "Full Stack Development",
                    description: "Master the art of building web applications from front to back.",
                    topics: [
                        { id: "fs_1", title: "HTML & CSS Basics", prompt: "Explain the fundamental structure of HTML and styling with CSS." },
                        { id: "fs_2", title: "JavaScript Essentials", prompt: "Cover variables, functions, loops, and ES6 features." },
                        { id: "fs_3", title: "Node.js & Express API", prompt: "Building a simple API with Node.js and Express." },
                        { id: "fs_4", title: "Database Integration", prompt: "Connecting to databases like MongoDB or Firebase." }
                    ]
                }
            ];

            for (const rm of seedRoadmaps) {
                await Roadmap.create(rm);
            }
            roadmaps = await Roadmap.getAll(); // Fetch again
        }

        res.json(roadmaps);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.getRoadmapById = async (req, res) => {
    try {
        const roadmap = await Roadmap.getById(req.params.id);
        if (!roadmap) {
            return res.status(404).json({ message: 'Roadmap not found' });
        }
        res.json(roadmap);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.getUserProgress = async (req, res) => {
    try {
        const userId = req.user.id; // Assumes auth middleware populates req.user
        const progress = await UserProgress.getUserProgress(userId);
        res.json(progress);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.enrollInRoadmap = async (req, res) => {
    try {
        const userId = req.user.id;
        const { roadmapId } = req.body;

        if (!roadmapId) {
            return res.status(400).json({ message: 'Roadmap ID is required' });
        }

        const roadmap = await Roadmap.getById(roadmapId);
        if (!roadmap) {
            return res.status(404).json({ message: 'Roadmap not found' });
        }

        const progress = await UserProgress.enroll(userId, roadmapId);
        res.json(progress);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.updateTopicProgress = async (req, res) => {
    try {
        const userId = req.user.id;
        const { roadmapId, topicId, completed } = req.body;

        if (!roadmapId || !topicId) {
            return res.status(400).json({ message: 'Roadmap ID and Topic ID are required' });
        }

        const result = await UserProgress.updateTopicProgress(userId, roadmapId, topicId, completed);
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.deleteRoadmap = async (req, res) => {
    try {
        const { id } = req.params;

        const roadmap = await Roadmap.getById(id);
        if (!roadmap) {
            return res.status(404).json({ message: 'Roadmap not found' });
        }

        await Roadmap.delete(id);
        res.json({ message: 'Roadmap deleted successfully', id });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};
