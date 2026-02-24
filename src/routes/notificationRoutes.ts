import { Router } from 'express';
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead } from '../controllers/notificationController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, getNotifications);
router.get('/unread-count', authenticateToken, getUnreadCount);
router.put('/:id/read', authenticateToken, markAsRead);
router.put('/read-all', authenticateToken, markAllAsRead);

export default router;
