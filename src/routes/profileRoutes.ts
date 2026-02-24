import { Router } from 'express';
import { getMyProfile, updateProfile, getMaidProfiles, getMaidProfileById, getActivityFeed } from '../controllers/profileController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/me', authenticateToken, getMyProfile);
router.put('/me', authenticateToken, updateProfile);
router.get('/activity', authenticateToken, getActivityFeed);
router.get('/maids', getMaidProfiles);
router.get('/maid/:id', authenticateToken, getMaidProfileById);

export default router;
