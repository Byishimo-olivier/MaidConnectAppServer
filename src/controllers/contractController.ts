import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from './notificationController';

export const createContract = async (req: AuthRequest, res: Response) => {
    try {
        const employerId = req.user?.userId;
        if (!employerId) return res.status(401).json({ message: 'Unauthorized' });

        const { maidId, title, description, startDate, endDate, salary, terms } = req.body;

        const contract = await prisma.contract.create({
            data: {
                employerId,
                maidId,
                title,
                description,
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : null,
                salary: Number(salary),
                terms,
                status: 'DRAFT'
            }
        });

        // Notify maid
        await createNotification(
            maidId,
            'New Contract Offer',
            `You have received a new contract offer: ${title}`,
            'CONTRACT'
        );

        res.status(201).json(contract);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create contract' });
    }
};

export const getMyContracts = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const role = req.user?.role;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const where = role === 'EMPLOYER' ? { employerId: userId } : { maidId: userId };

        const contracts = await prisma.contract.findMany({
            where,
            include: {
                employer: { select: { fullName: true } },
                maid: { select: { fullName: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(contracts);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch contracts' });
    }
};

export const updateContractStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user?.userId;

        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        // Verify ownership/permission logic could be added here

        const contract = await prisma.contract.update({
            where: { id: Number(id) },
            data: { status },
            include: {
                employer: { select: { fullName: true } },
                maid: { select: { fullName: true } }
            }
        });

        // Notify relevant party
        if (status === 'SIGNED' || status === 'ACTIVE') {
            await createNotification(
                contract.employerId,
                'Contract Update',
                `${contract.maid.fullName} has ${status.toLowerCase()} the contract: ${contract.title}`,
                'CONTRACT'
            );
        } else {
            await createNotification(
                contract.maidId,
                'Contract Update',
                `Your contract "${contract.title}" status is now ${status}.`,
                'CONTRACT'
            );
        }

        res.json(contract);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update contract' });
    }
};
