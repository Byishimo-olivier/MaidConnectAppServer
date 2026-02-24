import { Router } from 'express';
import { getConversations, getMessages, startConversation, savePublicKey, markAsRead, getUnreadChatCount } from '../controllers/chatController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/conversations', authenticateToken, getConversations);
router.get('/messages/:id', authenticateToken, getMessages);
router.post('/start', authenticateToken, startConversation);
router.post('/mark-as-read/:id', authenticateToken, markAsRead);
router.get('/unread-count', authenticateToken, getUnreadChatCount);
router.post('/public-key', authenticateToken, savePublicKey);

export default router;
