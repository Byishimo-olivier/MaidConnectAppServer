import { Router } from 'express';
import {
    getAdminApplications,
    getAdminContracts,
    getAdminDisputes,
    getAdminJobs,
    getAdminOverview,
    getAdminPayments,
    getAdminPaymentsOverview,
    getAdminReviews,
    getAdminUsers,
    updateAdminApplicationStatus,
    updateAdminContractStatus,
    updateAdminDisputeStatus,
    updateAdminJobStatus,
    updateAdminUser,
    updateAdminUserRole,
    // CREATE operations
    createAdminUser,
    createAdminJob,
    createAdminContract,
    // DELETE operations
    deleteAdminUser,
    deleteAdminJob,
    deleteAdminApplication,
    deleteAdminContract,
    deleteAdminPayment,
    deleteAdminDispute,
    deleteAdminReview
} from '../controllers/adminController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticateToken, requireRole('ADMIN'));

// Overview
router.get('/overview', getAdminOverview);

// Users - CRUD
router.get('/users', getAdminUsers);
router.post('/users', createAdminUser);
router.patch('/users/:id', updateAdminUser);
router.patch('/users/:id/role', updateAdminUserRole);
router.delete('/users/:id', deleteAdminUser);

// Jobs - CRUD
router.get('/jobs', getAdminJobs);
router.post('/jobs', createAdminJob);
router.patch('/jobs/:id/status', updateAdminJobStatus);
router.delete('/jobs/:id', deleteAdminJob);

// Applications - CRUD
router.get('/applications', getAdminApplications);
router.patch('/applications/:id/status', updateAdminApplicationStatus);
router.delete('/applications/:id', deleteAdminApplication);

// Contracts - CRUD
router.get('/contracts', getAdminContracts);
router.post('/contracts', createAdminContract);
router.patch('/contracts/:id/status', updateAdminContractStatus);
router.delete('/contracts/:id', deleteAdminContract);

// Payments - Read & Delete
router.get('/payments/overview', getAdminPaymentsOverview);
router.get('/payments', getAdminPayments);
router.delete('/payments/:id', deleteAdminPayment);

// Disputes - Update & Delete
router.get('/disputes', getAdminDisputes);
router.patch('/disputes/:id/status', updateAdminDisputeStatus);
router.delete('/disputes/:id', deleteAdminDispute);

// Reviews - Read & Delete
router.get('/reviews', getAdminReviews);
router.delete('/reviews/:id', deleteAdminReview);

export default router;
