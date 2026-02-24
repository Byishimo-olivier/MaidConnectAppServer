import { Router } from 'express';
import { createContract, getMyContracts, updateContractStatus } from '../controllers/contractController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/', authenticateToken, createContract);
router.get('/', authenticateToken, getMyContracts);
router.patch('/:id/status', authenticateToken, updateContractStatus);

export default router;
