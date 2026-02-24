import { Router } from 'express';
import { createDispute, getMyDisputes } from '../controllers/disputeController';
import { createReview, getUserReviews } from '../controllers/reviewController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Disputes
router.post('/disputes', authenticateToken, createDispute);
router.get('/disputes', authenticateToken, getMyDisputes);

// Reviews
router.post('/reviews', authenticateToken, createReview);
router.get('/users/:userId/reviews', getUserReviews);

export default router;
