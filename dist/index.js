"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const jobRoutes_1 = __importDefault(require("./routes/jobRoutes"));
const profileRoutes_1 = __importDefault(require("./routes/profileRoutes"));
const contractRoutes_1 = __importDefault(require("./routes/contractRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const paymentRoutes_1 = __importDefault(require("./routes/paymentRoutes"));
const chatRoutes_1 = __importDefault(require("./routes/chatRoutes"));
const miscRoutes_1 = __importDefault(require("./routes/miscRoutes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 8000;
const clientOrigin = process.env.CLIENT_ORIGIN || '*';
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: clientOrigin,
        methods: ["GET", "POST"]
    }
});
app.use((0, cors_1.default)({ origin: clientOrigin }));
app.use(express_1.default.json());
app.use('/api/auth', authRoutes_1.default);
app.use('/api/jobs', jobRoutes_1.default);
app.use('/api/profile', profileRoutes_1.default);
app.use('/api/contracts', contractRoutes_1.default);
app.use('/api/notifications', notificationRoutes_1.default);
app.use('/api/payments', paymentRoutes_1.default);
app.use('/api/chat', chatRoutes_1.default);
app.use('/api', miscRoutes_1.default);
app.get('/', (req, res) => {
    res.send('House Maid Recruiting System Backend is running');
});
const prisma_1 = __importDefault(require("./utils/prisma"));
// Socket.io connection
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    socket.on('join', (userId) => {
        socket.join(`user:${userId}`);
        console.log(`User ${userId} joined room user:${userId}`);
    });
    socket.on('send_message', (data) => __awaiter(void 0, void 0, void 0, function* () {
        const { conversationId, senderId, content, encryptedKey, senderKey, recipientId } = data;
        console.log(`[E2EE Persistence] Storing message from ${senderId} to ${recipientId}. senderKey present: ${!!senderKey}`);
        try {
            // 1. Save message to database - cast as any to bypass stale generated types if prisma generate failed
            const message = yield prisma_1.default.message.create({
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
            yield prisma_1.default.conversation.update({
                where: { id: parseInt(conversationId) },
                data: { lastMessageAt: new Date() }
            });
            // 3. Emit to recipient and sender
            io.to(`user:${recipientId}`).emit('new_message', message);
            io.to(`user:${senderId}`).emit('message_sent', message);
            console.log(`Message from ${senderId} to ${recipientId} via room user:${recipientId}`);
        }
        catch (error) {
            console.error('Socket.io Error saving message:', error);
        }
    }));
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
    console.log(`[server]: Server is running on port ${port}`);
});
