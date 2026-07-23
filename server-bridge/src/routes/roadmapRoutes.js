const express = require('express');
const router = express.Router();
const roadmapController = require('../controllers/roadmapController');
const { protect } = require('../middleware/authMiddleware'); // Assuming authMiddleware exists and exports protect

router.post('/', protect, roadmapController.createRoadmap);
router.get('/', protect, roadmapController.getAllRoadmaps);
router.get('/user/progress', protect, roadmapController.getUserProgress);
router.get('/:id', protect, roadmapController.getRoadmapById);
router.post('/enroll', protect, roadmapController.enrollInRoadmap);
router.put('/progress', protect, roadmapController.updateTopicProgress);
router.delete('/:id', protect, roadmapController.deleteRoadmap);

module.exports = router;
