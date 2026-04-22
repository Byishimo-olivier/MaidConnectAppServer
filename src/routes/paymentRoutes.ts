import { Router } from 'express';
import {
    verifyProfileUnlock,
    checkUnlockStatus,
    initiateDeposit,
    initiatePayout,
    initiateRefund,
    handlePawaPayWebhook,
    getDepositStatus,
    resendDepositCallback,
    getPayoutStatus,
    getRefundStatus
} from '../controllers/paymentController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/deposit', authenticateToken, initiateDeposit);
router.get('/deposit/:depositId', authenticateToken, getDepositStatus);
router.post('/deposit/resend-callback/:depositId', authenticateToken, resendDepositCallback);
router.post('/payout', authenticateToken, initiatePayout);
router.get('/payout/:payoutId', authenticateToken, getPayoutStatus);
router.post('/refund', authenticateToken, initiateRefund);
router.get('/refund/:refundId', authenticateToken, getRefundStatus);
router.post('/webhook/deposit', handlePawaPayWebhook);
router.post('/webhook/payout', handlePawaPayWebhook);
router.post('/webhook/refund', handlePawaPayWebhook);
router.head('/webhook/deposit', (_req, res) => res.sendStatus(200));
router.head('/webhook/payout', (_req, res) => res.sendStatus(200));
router.head('/webhook/refund', (_req, res) => res.sendStatus(200));
router.post('/verify-unlock', authenticateToken, verifyProfileUnlock);
router.get('/status/:maidId', authenticateToken, checkUnlockStatus);

export default router;
