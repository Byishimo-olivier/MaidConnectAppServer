import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';

export const createReview = async (req: AuthRequest, res: Response) => {
    try {
        const reviewerId = req.user?.userId;
        if (!reviewerId) return res.status(401).json({ message: 'Unauthorized' });

        const { contractId, rating, comment } = req.body;

        const contract = await prisma.contract.findUnique({ where: { id: Number(contractId) } });
        if (!contract) return res.status(404).json({ message: 'Contract not found' });

        if (contract.status !== 'COMPLETED') {
            return res.status(400).json({ message: 'Contract must be completed to leave a review' });
        }

        let revieweeId: number;
        if (contract.employerId === reviewerId) {
            revieweeId = contract.maidId;
        } else if (contract.maidId === reviewerId) {
            revieweeId = contract.employerId;
        } else {
            return res.status(403).json({ message: 'Not involved in this contract' });
        }

        const review = await prisma.review.create({
            data: {
                contractId: Number(contractId),
                reviewerId,
                revieweeId,
                rating: Number(rating),
                comment
            }
        });

        res.status(201).json(review);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to submit review' });
    }
};

export const getUserReviews = async (req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.params;
        const reviews = await prisma.review.findMany({
            where: { revieweeId: Number(userId) },
            include: { reviewer: { select: { fullName: true, profileImage: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(reviews);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch reviews' });
    }
};
