import { Response } from 'express';
import axios from 'axios';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from './notificationController';

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;

export const verifyProfileUnlock = async (req: AuthRequest, res: Response) => {
    try {
        const employerId = req.user?.userId;
        if (!employerId) return res.status(401).json({ message: 'Unauthorized' });

        const { transaction_id, maidId } = req.body;

        if (!transaction_id || !maidId) {
            return res.status(400).json({ message: 'Missing transaction_id or maidId' });
        }

        // 1. Verify transaction with Flutterwave
        const response = await axios.get(
            `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
            {
                headers: {
                    Authorization: `Bearer ${FLW_SECRET_KEY}`
                }
            }
        ) as any;

        const { status, currency, amount, customer } = response.data.data;

        // 2. Check if transaction was successful
        if (status === 'successful') {
            // 3. Save Payment Record & Create unlock record in a transaction
            const [payment, unlock] = await prisma.$transaction([
                prisma.payment.create({
                    data: {
                        transactionId: String(transaction_id),
                        employerId,
                        maidId: Number(maidId),
                        amount: Number(amount),
                        currency: String(currency),
                        status: 'SUCCESSFUL',
                        type: 'PROFILE_UNLOCK'
                    }
                }),
                prisma.unlockedProfile.create({
                    data: {
                        employerId,
                        maidId: Number(maidId)
                    }
                })
            ]);

            // 4. Notify both parties
            const maid = await prisma.user.findUnique({ where: { id: Number(maidId) } });

            // Notify Employer
            await createNotification(
                employerId,
                'Payment Successful',
                `You have successfully unlocked ${maid?.fullName || 'a profile'}. You can now view their full contact details.`,
                'PAYMENT'
            );

            // Notify Maid
            await createNotification(
                Number(maidId),
                'New Interest in your Profile',
                'An employer has unlocked your contact details and may contact you soon!',
                'SYSTEM'
            );

            return res.json({
                message: 'Profile unlocked successfully',
                unlock,
                paymentId: payment.id
            });
        } else {
            return res.status(400).json({ message: 'Payment verification failed', status });
        }
    } catch (error: any) {
        console.error('Payment Verification Error:', error.response?.data || error.message);
        res.status(500).json({
            message: 'Internal server error during verification',
            debug: error.response?.data?.message || error.message
        });
    }
};

export const checkUnlockStatus = async (req: AuthRequest, res: Response) => {
    try {
        const employerId = req.user?.userId;
        if (!employerId) return res.status(401).json({ message: 'Unauthorized' });

        const { maidId } = req.params;

        const unlock = await prisma.unlockedProfile.findUnique({
            where: {
                employerId_maidId: {
                    employerId,
                    maidId: Number(maidId)
                }
            }
        });

        res.json({ unlocked: !!unlock });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to check unlock status' });
    }
};
