import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';

export const createDispute = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const { contractId, reason, description } = req.body;

        const contract = await prisma.contract.findUnique({ where: { id: Number(contractId) } });
        if (!contract) return res.status(404).json({ message: 'Contract not found' });

        // Identify respondent
        let respondentId: number;
        let complainantId: number;

        if (contract.employerId === userId) {
            complainantId = userId;
            respondentId = contract.maidId;
        } else if (contract.maidId === userId) {
            complainantId = userId;
            respondentId = contract.employerId;
        } else {
            return res.status(403).json({ message: 'Not part of this contract' });
        }

        const dispute = await prisma.dispute.create({
            data: {
                contractId: Number(contractId),
                complainantId,
                respondentId,
                reason,
                description,
                status: 'OPEN'
            }
        });

        res.status(201).json(dispute);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to file dispute' });
    }
};

export const getMyDisputes = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const disputes = await prisma.dispute.findMany({
            where: {
                OR: [
                    { complainantId: userId },
                    { respondentId: userId }
                ]
            },
            include: {
                contract: { select: { title: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(disputes);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch disputes' });
    }
};
