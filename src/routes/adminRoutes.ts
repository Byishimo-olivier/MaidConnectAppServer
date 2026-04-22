import { Router } from 'express';
import {
    getAdminApplications,
    getAdminContracts,
    getAdminDisputes,
    getAdminJobs,
    getAdminOverview,
    getAdminPayments,
    getAdminReviews,
    getAdminUsers,
    updateAdminApplicationStatus,
    updateAdminContractStatus,
    updateAdminDisputeStatus,
    updateAdminJobStatus,
    updateAdminUserRole
} from '../controllers/adminController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticateToken, requireRole('ADMIN'));

router.get('/overview', getAdminOverview);

router.get('/users', getAdminUsers);
router.patch('/users/:id/role', updateAdminUserRole);

router.get('/jobs', getAdminJobs);
router.patch('/jobs/:id/status', updateAdminJobStatus);

router.get('/applications', getAdminApplications);
router.patch('/applications/:id/status', updateAdminApplicationStatus);

router.get('/contracts', getAdminContracts);
router.patch('/contracts/:id/status', updateAdminContractStatus);

router.get('/payments', getAdminPayments);

router.get('/disputes', getAdminDisputes);
router.patch('/disputes/:id/status', updateAdminDisputeStatus);

router.get('/reviews', getAdminReviews);

export default router;
