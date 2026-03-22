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
exports.createNotification = exports.markAllAsRead = exports.markAsRead = exports.getUnreadCount = exports.getNotifications = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const getNotifications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const notifications = yield prisma_1.default.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json(notifications);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch notifications' });
    }
});
exports.getNotifications = getNotifications;
const getUnreadCount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const count = yield prisma_1.default.notification.count({
            where: { userId, read: false }
        });
        res.json({ count });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to count notifications' });
    }
});
exports.getUnreadCount = getUnreadCount;
const markAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { id } = req.params;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        yield prisma_1.default.notification.updateMany({
            where: { id: parseInt(id), userId },
            data: { read: true }
        });
        res.json({ message: 'Marked as read' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update notification' });
    }
});
exports.markAsRead = markAsRead;
const markAllAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        yield prisma_1.default.notification.updateMany({
            where: { userId, read: false },
            data: { read: true }
        });
        res.json({ message: 'All marked as read' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update notifications' });
    }
});
exports.markAllAsRead = markAllAsRead;
// Helper to create notifications
const createNotification = (userId, title, message, type) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma_1.default.notification.create({
            data: { userId, title, message, type }
        });
    }
    catch (error) {
        console.error('Failed to create notification:', error);
    }
});
exports.createNotification = createNotification;
