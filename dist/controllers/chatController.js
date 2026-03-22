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
exports.savePublicKey = exports.getUnreadChatCount = exports.markAsRead = exports.startConversation = exports.getMessages = exports.getConversations = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const getConversations = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const conversations = yield prisma_1.default.conversation.findMany({
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
        const result = conversations.map(c => {
            var _a;
            return (Object.assign(Object.assign({}, c), { unreadCount: ((_a = c._count) === null || _a === void 0 ? void 0 : _a.messages) || 0 }));
        });
        res.json(result);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch conversations' });
    }
});
exports.getConversations = getConversations;
const getMessages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { id } = req.params;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const messages = yield prisma_1.default.message.findMany({
            where: { conversationId: parseInt(id) },
            orderBy: { createdAt: 'asc' },
            include: {
                sender: {
                    select: { id: true, fullName: true }
                }
            }
        });
        res.json(messages);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch messages' });
    }
});
exports.getMessages = getMessages;
const startConversation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { recipientId } = req.body;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        // Check if conversation already exists
        const existing = yield prisma_1.default.conversation.findFirst({
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
        if (existing)
            return res.json(existing);
        const conversation = yield prisma_1.default.conversation.create({
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to start conversation' });
    }
});
exports.startConversation = startConversation;
const markAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { id } = req.params; // conversationId
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        yield prisma_1.default.message.updateMany({
            where: {
                conversationId: parseInt(id),
                senderId: { not: userId },
                isRead: false
            },
            data: { isRead: true }
        });
        res.json({ message: 'Conversation marked as read' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to mark as read' });
    }
});
exports.markAsRead = markAsRead;
const getUnreadChatCount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const count = yield prisma_1.default.message.count({
            where: {
                conversation: {
                    participants: { some: { id: userId } }
                },
                senderId: { not: userId },
                isRead: false
            }
        });
        res.json({ count });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch unread count' });
    }
});
exports.getUnreadChatCount = getUnreadChatCount;
const savePublicKey = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { publicKey } = req.body;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        yield prisma_1.default.user.update({
            where: { id: userId },
            data: { publicKey }
        });
        res.json({ message: 'Public key saved' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to save public key' });
    }
});
exports.savePublicKey = savePublicKey;
