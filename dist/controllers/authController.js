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
exports.resetPassword = exports.verifyResetPin = exports.forgotPassword = exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const client_1 = require("@prisma/client");
const emailService_1 = require("../utils/emailService");
const normalizeEmail = (value) => {
    if (typeof value !== 'string')
        return '';
    return value.trim().toLowerCase();
};
const normalizeCode = (value) => {
    if (typeof value === 'number')
        return String(value).trim().replace(/\D/g, '');
    if (typeof value !== 'string')
        return '';
    return value.trim().replace(/\D/g, '');
};
const findUserByEmail = (email) => __awaiter(void 0, void 0, void 0, function* () {
    if (!email)
        return null;
    return prisma_1.default.user.findFirst({
        where: {
            email: {
                equals: email,
                mode: 'insensitive'
            }
        }
    });
});
const tokensMatch = (storedToken, providedToken) => {
    const stored = normalizeCode(storedToken);
    const provided = normalizeCode(providedToken);
    if (!stored || !provided)
        return false;
    if (stored === provided)
        return true;
    // Fallback for leading-zero formatting issues from query params/clients.
    return Number(stored) === Number(provided);
};
const register = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password, role, fullName, phone, address, description } = req.body;
        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }
        const existingUser = yield findUserByEmail(normalizedEmail);
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        const user = yield prisma_1.default.user.create({
            data: {
                email: normalizedEmail,
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
        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail || !password) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        const user = yield findUserByEmail(normalizedEmail);
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
    var _a;
    try {
        const normalizedEmail = normalizeEmail((_a = req.body) === null || _a === void 0 ? void 0 : _a.email);
        const user = yield findUserByEmail(normalizedEmail);
        console.log('[Forgot Password] Request received for:', { email: normalizedEmail, userFound: !!user });
        if (!user) {
            // Safety: don't reveal if user exists or not
            return res.json({ message: 'If an account exists for this email, you will receive a reset PIN.' });
        }
        // Generate a 6-digit PIN
        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 3600000); // 1 hour expiry
        yield prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                resetToken: pin,
                resetTokenExpiry: expiry
            }
        });
        console.log('[Forgot Password] PIN generated and saved for:', { email: normalizedEmail, pinExpiry: expiry });
        // Send real email with PIN — if this fails, the outer catch returns a 500
        yield (0, emailService_1.sendResetPin)(user.email, pin);
        console.log('[Forgot Password] Email sent to:', { email: user.email });
        res.json({ message: 'If an account exists for this email, you will receive a reset PIN.' });
    }
    catch (error) {
        console.error('[Forgot Password] Error:', error);
        res.status(500).json({ message: 'Failed to process request' });
    }
});
exports.forgotPassword = forgotPassword;
const verifyResetPin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const normalizedEmail = normalizeEmail((_a = req.body) === null || _a === void 0 ? void 0 : _a.email);
        const pin = normalizeCode((_b = req.body) === null || _b === void 0 ? void 0 : _b.pin);
        const user = yield findUserByEmail(normalizedEmail);
        console.log('[Verify Reset PIN] Request received:', {
            email: normalizedEmail,
            pinLength: pin === null || pin === void 0 ? void 0 : pin.length,
            userFound: !!user,
        });
        if (!user) {
            console.error('[Verify Reset PIN] User not found:', { email: normalizedEmail });
            return res.status(400).json(Object.assign({ message: 'Invalid or expired PIN' }, (process.env.NODE_ENV !== 'production' ? { debug: 'No user found for provided email' } : {})));
        }
        if (!tokensMatch(user.resetToken, pin)) {
            console.error('[Verify Reset PIN] PIN mismatch:', {
                storedToken: user.resetToken,
                providedPin: pin,
            });
            return res.status(400).json(Object.assign({ message: 'Invalid or expired PIN' }, (process.env.NODE_ENV !== 'production' ? { debug: 'PIN does not match latest stored reset PIN' } : {})));
        }
        if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
            console.error('[Verify Reset PIN] PIN expired:', {
                expiry: user.resetTokenExpiry,
                now: new Date(),
            });
            return res.status(400).json(Object.assign({ message: 'Invalid or expired PIN' }, (process.env.NODE_ENV !== 'production' ? { debug: 'PIN has expired' } : {})));
        }
        console.log('[Verify Reset PIN] PIN verified successfully for:', { email: normalizedEmail });
        res.json({ message: 'PIN verified successfully' });
    }
    catch (error) {
        console.error('[Verify Reset PIN] Exception:', error);
        res.status(500).json({ message: 'Verification failed' });
    }
});
exports.verifyResetPin = verifyResetPin;
const resetPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    try {
        const normalizedEmail = normalizeEmail((_a = req.body) === null || _a === void 0 ? void 0 : _a.email);
        const token = normalizeCode(((_b = req.body) === null || _b === void 0 ? void 0 : _b.token) || ((_c = req.body) === null || _c === void 0 ? void 0 : _c.pin));
        const newPassword = typeof ((_d = req.body) === null || _d === void 0 ? void 0 : _d.newPassword) === 'string'
            ? req.body.newPassword
            : (typeof ((_e = req.body) === null || _e === void 0 ? void 0 : _e.password) === 'string' ? req.body.password : '');
        console.log('[Reset Password] Request received:', {
            email: normalizedEmail,
            tokenProvided: !!token,
            tokenLength: token === null || token === void 0 ? void 0 : token.length,
            passwordProvided: !!newPassword,
        });
        if (!normalizedEmail || !token || !newPassword) {
            console.error('[Reset Password] Validation failed - missing fields:', {
                email: normalizedEmail ? 'OK' : 'MISSING',
                token: token ? 'OK' : 'MISSING',
                password: newPassword ? 'OK' : 'MISSING',
            });
            return res.status(400).json({ message: 'Email, reset token, and new password are required' });
        }
        const user = yield findUserByEmail(normalizedEmail);
        if (!user) {
            console.error('[Reset Password] User not found:', { email: normalizedEmail });
            return res.status(400).json(Object.assign({ message: 'Invalid or expired reset token' }, (process.env.NODE_ENV !== 'production' ? { debug: 'No user found for provided email' } : {})));
        }
        console.log('[Reset Password] User found, checking token:', {
            storedToken: user.resetToken ? 'EXISTS' : 'MISSING',
            tokenMatch: tokensMatch(user.resetToken, token),
            tokenExpired: user.resetTokenExpiry ? user.resetTokenExpiry < new Date() : 'NEVER_SET',
        });
        if (!tokensMatch(user.resetToken, token)) {
            console.error('[Reset Password] Token mismatch:', {
                storedToken: user.resetToken,
                providedToken: token,
            });
            return res.status(400).json(Object.assign({ message: 'Invalid or expired reset token' }, (process.env.NODE_ENV !== 'production' ? { debug: 'Token does not match latest stored reset token' } : {})));
        }
        if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
            console.error('[Reset Password] Token expired:', {
                expiry: user.resetTokenExpiry,
                now: new Date(),
            });
            return res.status(400).json(Object.assign({ message: 'Invalid or expired reset token' }, (process.env.NODE_ENV !== 'production' ? { debug: 'Reset token has expired' } : {})));
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
        console.log('[Reset Password] Password successfully reset for user:', { email: normalizedEmail });
        res.json({ message: 'Password has been successfully reset' });
    }
    catch (error) {
        console.error('[Reset Password] Exception occurred:', error);
        res.status(500).json({ message: 'Reset failed' });
    }
});
exports.resetPassword = resetPassword;
