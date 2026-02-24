import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';

export const getNotifications = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        res.json(notifications);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch notifications' });
    }
};

export const getUnreadCount = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const count = await prisma.notification.count({
            where: { userId, read: false }
        });

        res.json({ count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to count notifications' });
    }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        await prisma.notification.updateMany({
            where: { id: parseInt(id as string), userId },
            data: { read: true }
        });

        res.json({ message: 'Marked as read' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update notification' });
    }
};

export const markAllAsRead = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        await prisma.notification.updateMany({
            where: { userId, read: false },
            data: { read: true }
        });

        res.json({ message: 'All marked as read' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update notifications' });
    }
};

// Helper to create notifications
export const createNotification = async (userId: number, title: string, message: string, type: string) => {
    try {
        await prisma.notification.create({
            data: { userId, title, message, type }
        });
    } catch (error) {
        console.error('Failed to create notification:', error);
    }
};
