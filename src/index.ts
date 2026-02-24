import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/authRoutes';
import jobRoutes from './routes/jobRoutes';
import profileRoutes from './routes/profileRoutes';
import contractRoutes from './routes/contractRoutes';
import notificationRoutes from './routes/notificationRoutes';
import paymentRoutes from './routes/paymentRoutes';
import chatRoutes from './routes/chatRoutes';
import miscRoutes from './routes/miscRoutes';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 8000;
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow all for development
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api', miscRoutes);

app.get('/', (req: Request, res: Response) => {
    res.send('House Maid Recruiting System Backend is running');
});

import prisma from './utils/prisma';

// Socket.io connection
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join', (userId) => {
        socket.join(`user:${userId}`);
        console.log(`User ${userId} joined room user:${userId}`);
    });

    socket.on('send_message', async (data) => {
        const { conversationId, senderId, content, encryptedKey, senderKey, recipientId } = data;

        console.log(`[E2EE Persistence] Storing message from ${senderId} to ${recipientId}. senderKey present: ${!!senderKey}`);

        try {
            // 1. Save message to database - cast as any to bypass stale generated types if prisma generate failed
            const message = await (prisma.message as any).create({
                data: {
                    conversationId: parseInt(conversationId),
                    senderId: parseInt(senderId),
                    content,
                    encryptedKey,
                    senderKey
                },
                include: {
                    sender: {
                        select: { id: true, fullName: true }
                    }
                }
            });

            // 2. Update conversation lastMessageAt
            await prisma.conversation.update({
                where: { id: parseInt(conversationId) },
                data: { lastMessageAt: new Date() }
            });

            // 3. Emit to recipient and sender
            io.to(`user:${recipientId}`).emit('new_message', message);
            io.to(`user:${senderId}`).emit('message_sent', message);

            console.log(`Message from ${senderId} to ${recipientId} via room user:${recipientId}`);
        } catch (error) {
            console.error('Socket.io Error saving message:', error);
        }
    });

    socket.on('typing', (data) => {
        const { recipientId, conversationId, isTyping } = data;
        io.to(`user:${recipientId}`).emit('user_typing', { conversationId, isTyping });
    });

    socket.on('read_messages', (data) => {
        const { conversationId, senderId, readerId } = data;
        io.to(`user:${senderId}`).emit('messages_read', { conversationId, readerId });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

httpServer.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
