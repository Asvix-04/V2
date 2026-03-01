import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const RoadmapContext = createContext();

export const useRoadmaps = () => useContext(RoadmapContext);

export const RoadmapProvider = ({ children }) => {
    const [roadmaps, setRoadmaps] = useState([]);
    const [currentRoadmap, setCurrentRoadmap] = useState(null);
    const [userProgress, setUserProgress] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const API_URL = 'http://localhost:5001/api/roadmaps'; // Hardcoded for now, should come from env

    const token = localStorage.getItem('token'); // Simplistic token retrieval
    const config = {
        headers: {
            Authorization: `Bearer ${token}`
        }
    };

    const fetchRoadmaps = async () => {
        try {
            const res = await axios.get(API_URL, config);
            setRoadmaps(res.data);
        } catch (err) {
            console.error('Error fetching roadmaps:', err);
            setError(err.message);
        }
    };

    const fetchUserProgress = async () => {
        try {
            const res = await axios.get(`${API_URL}/user/progress`, config);
            setUserProgress(res.data);

            // Determine active roadmap if any, or just pick the first one with progress
            // For simplicty, let's find the one most recently accessed
            if (res.data.length > 0) {
                // Sort by lastAccessed desc
                const sorted = [...res.data].sort((a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed));
                const activeProgress = sorted[0];
                const activeRoadmap = roadmaps.find(r => r.id === activeProgress.roadmapId);
                // We might need to fetch roadmaps first or ensure synchronization
                if (activeRoadmap) setCurrentRoadmap(activeRoadmap);
            }

        } catch (err) {
            console.error('Error fetching progress:', err);
        }
    };

    useEffect(() => {
        if (token) {
            Promise.all([fetchRoadmaps(), fetchUserProgress()]).then(() => {
                setLoading(false);
            });
        } else {
            setLoading(false);
        }
    }, [token]);

    // Recalculate current roadmap when roadmaps or progress change
    useEffect(() => {
        if (userProgress.length > 0 && roadmaps.length > 0 && !currentRoadmap) {
            const sorted = [...userProgress].sort((a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed));
            const activeProgress = sorted[0];
            const active = roadmaps.find(r => r.id === activeProgress.roadmapId);
            if (active) setCurrentRoadmap(active);
        }
    }, [userProgress, roadmaps]);


    const enroll = async (roadmapId) => {
        try {
            const userStr = localStorage.getItem("user");
            if (!userStr) throw new Error("No user found - please log in");
            const user = JSON.parse(userStr);
            const freshToken = user.token;
            if (!freshToken) throw new Error("No token found - please log in again");

            const res = await axios.post(`${API_URL}/enroll`, { roadmapId }, {
                headers: { Authorization: `Bearer ${freshToken}` }
            });
            const newProgress = res.data;

            setUserProgress(prev => {
                const existing = prev.find(p => p.roadmapId === roadmapId);
                if (existing) return prev;
                return [...prev, newProgress];
            });

            const roadmap = roadmaps.find(r => r.id === roadmapId);
            setCurrentRoadmap(roadmap);
            return newProgress;
        } catch (err) {
            console.error(err);
            throw err;
        }
    };

    const updateTopicProgress = async (roadmapId, topicId, completed) => {
        try {
            const userStr = localStorage.getItem("user");
            if (!userStr) throw new Error("No user found - please log in");
            const user = JSON.parse(userStr);
            const freshToken = user.token;
            if (!freshToken) throw new Error("No token found - please log in again");

            const res = await axios.put(`${API_URL}/progress`, { roadmapId, topicId, completed }, {
                headers: { Authorization: `Bearer ${freshToken}` }
            });
            const updatedProgress = res.data;

            setUserProgress(prev =>
                prev.map(p => p.roadmapId === roadmapId ? updatedProgress : p)
            );
        } catch (err) {
            console.error(err);
            throw err;
        }
    };

    const getProgressForRoadmap = (roadmapId) => {
        return userProgress.find(p => p.roadmapId === roadmapId);
    };

    const createRoadmap = async (data) => {
        try {
            const userStr = localStorage.getItem("user");
            if (!userStr) throw new Error("No user found - please log in");

            const user = JSON.parse(userStr);
            const freshToken = user.token;
            if (!freshToken) throw new Error("No token found - please log in again");

            const res = await axios.post(API_URL, data, {
                headers: { Authorization: `Bearer ${freshToken}` }
            });
            const newRoadmap = res.data;
            setRoadmaps(prev => [...prev, newRoadmap]);
            return newRoadmap;
        } catch (err) {
            console.error("Error creating roadmap:", err);
            throw err;
        }
    };

    const deleteRoadmap = async (roadmapId) => {
        try {
            const userStr = localStorage.getItem("user");
            if (!userStr) throw new Error("No user found - please log in");

            const user = JSON.parse(userStr);
            const freshToken = user.token;
            if (!freshToken) throw new Error("No token found - please log in again");

            await axios.delete(`${API_URL}/${roadmapId}`, {
                headers: { Authorization: `Bearer ${freshToken}` }
            });
            setRoadmaps(prev => prev.filter(r => r.id !== roadmapId));
            setUserProgress(prev => prev.filter(p => p.roadmapId !== roadmapId));
        } catch (err) {
            console.error("Error deleting roadmap:", err);
            throw err;
        }
    };

    return (
        <RoadmapContext.Provider value={{
            roadmaps,
            currentRoadmap,
            userProgress,
            loading,
            enroll,
            updateTopicProgress,
            getProgressForRoadmap,
            createRoadmap,
            deleteRoadmap,
            setCurrentRoadmap
        }}>
            {children}
        </RoadmapContext.Provider>
    );
};

