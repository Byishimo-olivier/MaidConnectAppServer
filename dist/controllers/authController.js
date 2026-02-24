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
exports.resetPassword = exports.forgotPassword = exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const client_1 = require("@prisma/client");
const register = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password, role, fullName, phone, address, description } = req.body;
        const existingUser = yield prisma_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        const user = yield prisma_1.default.user.create({
            data: {
                email,
                password: hashedPassword,
                role: role || client_1.Role.EMPLOYER,
                fullName,
                phone,
                address,
                description
            }
        });
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName } });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Registration failed' });
    }
});
exports.register = register;
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        const user = yield prisma_1.default.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        const isMatch = yield bcryptjs_1.default.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName } });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Login failed' });
    }
});
exports.login = login;
const forgotPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email } = req.body;
        const user = yield prisma_1.default.user.findUnique({ where: { email } });
        if (!user) {
            // Safety: don't reveal if user exists or not
            return res.json({ message: 'If an account exists for this email, you will receive reset instructions.' });
        }
        // Generate a 6-digit pin or a long token. Use 6-digit pin for easier mobile entry.
        const token = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 3600000); // 1 hour expiry
        yield prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                resetToken: token,
                resetTokenExpiry: expiry
            }
        });
        // Mock email sending
        console.log(`----------------------------------------`);
        console.log(`PASSWORD RESET EMAIL SENT`);
        console.log(`To: ${email}`);
        console.log(`Token: ${token}`);
        console.log(`----------------------------------------`);
        res.json({ message: 'If an account exists for this email, you will receive reset instructions.' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to process request' });
    }
});
exports.forgotPassword = forgotPassword;
const resetPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, token, newPassword } = req.body;
        const user = yield prisma_1.default.user.findUnique({ where: { email } });
        if (!user || user.resetToken !== token || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }
        const hashedPassword = yield bcryptjs_1.default.hash(newPassword, 10);
        yield prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetToken: null,
                resetTokenExpiry: null
            }
        });
        res.json({ message: 'Password has been successfully reset' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Reset failed' });
    }
});
exports.resetPassword = resetPassword;
