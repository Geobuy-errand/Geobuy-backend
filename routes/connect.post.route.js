const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const postController = require('../controllers/connect.post.controller');

// ============================================================
// USER ROUTES
// ============================================================
router.get('/', authMiddleware, postController.getUserPosts);
router.get('/status', authMiddleware, postController.getConnectionStatus);

// ============================================================
// ADMIN ROUTES
// ============================================================
router.post('/', authMiddleware, requireRole('admin'), postController.createPost);
router.get('/admin/all', authMiddleware, requireRole('admin'), postController.adminGetAllPosts);
router.put('/admin/:id', authMiddleware, requireRole('admin'), postController.adminUpdatePost);
router.delete('/admin/:id', authMiddleware, requireRole('admin'), postController.adminDeletePost);

module.exports = router;