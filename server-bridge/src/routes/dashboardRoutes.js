const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');

// @desc    Get Teacher Statistics
// @route   GET /api/dashboard/teacher-stats
// @access  Private (Teacher only)
router.get('/teacher-stats', protect, authorize('teacher'), (req, res) => {
    res.json({
        message: 'Welcome to the Teacher Dashboard',
        analytics: {
            classes: 5,
            totalStudents: 120,
            averageAttendance: '92%'
        }
    });
});

// @desc    Get Student Progress
// @route   GET /api/dashboard/student-progress
// @access  Private (Student only)
router.get('/student-progress', protect, authorize('student'), (req, res) => {
    res.json({
        message: 'Welcome to the Student Dashboard',
        progress: {
            completedModules: 12,
            currentGrade: 'A',
            nextAssignmentDue: '2023-11-15'
        }
    });
});

// @desc    Get Common Data
// @route   GET /api/dashboard/common
// @access  Private (Both)
router.get('/common', protect, (req, res) => {
    res.json({
        message: `Hello ${req.user.name}, this is common data for all roles.`,
        role: req.user.role
    });
});

module.exports = router;
