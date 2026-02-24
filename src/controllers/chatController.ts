import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';

export const getConversations = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const conversations = await prisma.conversation.findMany({
            where: {
                participants: {
                    some: { id: userId }
                }
            },
            include: {
                participants: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImage: true,
                        role: true,
                        publicKey: true
                    }
                },
                _count: {
                    select: {
                        messages: {
                            where: {
                                isRead: false,
                                senderId: { not: userId }
                            }
                        }
                    }
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            },
            orderBy: { lastMessageAt: 'desc' }
        });

        // Map unread count to a cleaner property name
        const result = conversations.map(c => ({
            ...c,
            unreadCount: c._count?.messages || 0
        }));

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch conversations' });
    }
};

export const getMessages = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const messages = await prisma.message.findMany({
            where: { conversationId: parseInt(id as string) },
            orderBy: { createdAt: 'asc' },
            include: {
                sender: {
                    select: { id: true, fullName: true }
                }
            }
        });

        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch messages' });
    }
};

export const startConversation = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { recipientId } = req.body;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        // Check if conversation already exists
        const existing = await prisma.conversation.findFirst({
            where: {
                AND: [
                    { participants: { some: { id: userId } } },
                    { participants: { some: { id: parseInt(recipientId) } } }
                ]
            },
            include: {
                participants: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImage: true,
                        publicKey: true
                    }
                }
            }
        });

        if (existing) return res.json(existing);

        const conversation = await prisma.conversation.create({
            data: {
                participants: {
                    connect: [{ id: userId }, { id: parseInt(recipientId) }]
                }
            },
            include: {
                participants: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImage: true,
                        publicKey: true
                    }
                }
            }
        });

        res.json(conversation);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to start conversation' });
    }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params; // conversationId
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        await prisma.message.updateMany({
            where: {
                conversationId: parseInt(id as string),
                senderId: { not: userId },
                isRead: false
            },
            data: { isRead: true }
        });

        res.json({ message: 'Conversation marked as read' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to mark as read' });
    }
};

export const getUnreadChatCount = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const count = await prisma.message.count({
            where: {
                conversation: {
                    participants: { some: { id: userId } }
                },
                senderId: { not: userId },
                isRead: false
            }
        });

        res.json({ count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch unread count' });
    }
};

export const savePublicKey = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { publicKey } = req.body;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        await prisma.user.update({
            where: { id: userId },
            data: { publicKey }
        });

        res.json({ message: 'Public key saved' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to save public key' });
    }
};
