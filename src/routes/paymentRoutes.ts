import { Router } from 'express';
import { verifyProfileUnlock, checkUnlockStatus } from '../controllers/paymentController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/verify-unlock', authenticateToken, verifyProfileUnlock);
router.get('/status/:maidId', authenticateToken, checkUnlockStatus);

export default router;
