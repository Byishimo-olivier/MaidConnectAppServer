import { Router } from 'express';
import { createJob, getJobs, getMyJobs, updateMyJobStatus, applyForJob, getEmployerApplications, getApplicationById, updateApplicationStatus, getMaidApplications } from '../controllers/jobController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/', authenticateToken, createJob);
router.get('/', getJobs);
router.get('/my-jobs', authenticateToken, getMyJobs);
router.patch('/:jobId/status', authenticateToken, updateMyJobStatus);
router.get('/maid/applications', authenticateToken, getMaidApplications);
router.get('/employer/applications', authenticateToken, getEmployerApplications);
router.get('/applications/:id', authenticateToken, getApplicationById);
router.put('/applications/:id/status', authenticateToken, updateApplicationStatus);
router.post('/:jobId/apply', authenticateToken, applyForJob);


export default router;
