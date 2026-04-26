import { Router } from 'express';
import {
    verifyProfileUnlock,
    verifyJobPostingPayment,
    checkUnlockStatus,
    initiateDeposit,
    initiatePayout,
    initiateRefund,
    handlePawaPayWebhook,
    getDepositStatus,
    resendDepositCallback,
    getPayoutStatus,
    getRefundStatus,
    getGatewayBalance
} from '../controllers/paymentController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/deposit', authenticateToken, initiateDeposit);
router.get('/deposit/:depositId', authenticateToken, getDepositStatus);
router.get('/balance', authenticateToken, getGatewayBalance);
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
router.post('/verify-job-posting', authenticateToken, verifyJobPostingPayment);
router.get('/status/:maidId', authenticateToken, checkUnlockStatus);

export default router;
