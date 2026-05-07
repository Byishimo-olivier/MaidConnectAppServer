import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { Role } from '@prisma/client';
import { sendResetPin } from '../utils/emailService';

const normalizeEmail = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
};

const normalizeCode = (value: unknown): string => {
    if (typeof value === 'number') return String(value).trim().replace(/\D/g, '');
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\D/g, '');
};

const findUserByEmail = async (email: string) => {
    if (!email) return null;
    return prisma.user.findFirst({
        where: {
            email: {
                equals: email,
                mode: 'insensitive'
            }
        }
    });
};

const tokensMatch = (storedToken: unknown, providedToken: unknown): boolean => {
    const stored = normalizeCode(storedToken);
    const provided = normalizeCode(providedToken);
    if (!stored || !provided) return false;
    if (stored === provided) return true;
    // Fallback for leading-zero formatting issues from query params/clients.
    return Number(stored) === Number(provided);
};

export const register = async (req: Request, res: Response) => {
    try {
        const { email, password, role, fullName, phone, address, description } = req.body;
        const normalizedEmail = normalizeEmail(email);

        if (!normalizedEmail || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const existingUser = await findUserByEmail(normalizedEmail);
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                email: normalizedEmail,
                password: hashedPassword,
                role: (role as any) || Role.EMPLOYER,
                fullName,
                phone,
                address,
                description
            }
        });

        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET as string,
            { expiresIn: '24h' }
        );

        res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Registration failed' });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = normalizeEmail(email);

        if (!normalizedEmail || !password) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const user = await findUserByEmail(normalizedEmail);
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET as string,
            { expiresIn: '24h' }
        );

        res.json({ token, user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Login failed' });
    }
};

export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const normalizedEmail = normalizeEmail(req.body?.email);
        const user: any = await findUserByEmail(normalizedEmail);

        console.log('[Forgot Password] Request received for:', { email: normalizedEmail, userFound: !!user });

        if (!user) {
            // Safety: don't reveal if user exists or not
            return res.json({ message: 'If an account exists for this email, you will receive a reset PIN.' });
        }

        // Generate a 6-digit PIN
        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 3600000); // 1 hour expiry

        await (prisma.user.update as any)({
            where: { id: user.id },
            data: {
                resetToken: pin,
                resetTokenExpiry: expiry
            }
        });

        console.log('[Forgot Password] PIN generated and saved for:', { email: normalizedEmail, pinExpiry: expiry });

        // Send real email with PIN — if this fails, the outer catch returns a 500
        await sendResetPin(user.email, pin);

        console.log('[Forgot Password] Email sent to:', { email: user.email });

        res.json({ message: 'If an account exists for this email, you will receive a reset PIN.' });
    } catch (error) {
        console.error('[Forgot Password] Error:', error);
        res.status(500).json({ message: 'Failed to process request' });
    }
};

export const verifyResetPin = async (req: Request, res: Response) => {
    try {
        const normalizedEmail = normalizeEmail(req.body?.email);
        const pin = normalizeCode(req.body?.pin);
        const user: any = await findUserByEmail(normalizedEmail);

        console.log('[Verify Reset PIN] Request received:', {
            email: normalizedEmail,
            pinLength: pin?.length,
            userFound: !!user,
        });

        if (!user) {
            console.error('[Verify Reset PIN] User not found:', { email: normalizedEmail });
            return res.status(400).json({
                message: 'Invalid or expired PIN',
                ...(process.env.NODE_ENV !== 'production' ? { debug: 'No user found for provided email' } : {}),
            });
        }

        if (!tokensMatch(user.resetToken, pin)) {
            console.error('[Verify Reset PIN] PIN mismatch:', {
                storedToken: user.resetToken,
                providedPin: pin,
            });
            return res.status(400).json({
                message: 'Invalid or expired PIN',
                ...(process.env.NODE_ENV !== 'production' ? { debug: 'PIN does not match latest stored reset PIN' } : {}),
            });
        }

        if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
            console.error('[Verify Reset PIN] PIN expired:', {
                expiry: user.resetTokenExpiry,
                now: new Date(),
            });
            return res.status(400).json({
                message: 'Invalid or expired PIN',
                ...(process.env.NODE_ENV !== 'production' ? { debug: 'PIN has expired' } : {}),
            });
        }

        console.log('[Verify Reset PIN] PIN verified successfully for:', { email: normalizedEmail });
        res.json({ message: 'PIN verified successfully' });
    } catch (error) {
        console.error('[Verify Reset PIN] Exception:', error);
        res.status(500).json({ message: 'Verification failed' });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    try {
        const normalizedEmail = normalizeEmail(req.body?.email);
        const token = normalizeCode(req.body?.token || req.body?.pin);
        const newPassword = typeof req.body?.newPassword === 'string'
            ? req.body.newPassword
            : (typeof req.body?.password === 'string' ? req.body.password : '');

        console.log('[Reset Password] Request received:', {
            email: normalizedEmail,
            tokenProvided: !!token,
            tokenLength: token?.length,
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

        const user: any = await findUserByEmail(normalizedEmail);

        if (!user) {
            console.error('[Reset Password] User not found:', { email: normalizedEmail });
            return res.status(400).json({
                message: 'Invalid or expired reset token',
                ...(process.env.NODE_ENV !== 'production' ? { debug: 'No user found for provided email' } : {}),
            });
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
            return res.status(400).json({
                message: 'Invalid or expired reset token',
                ...(process.env.NODE_ENV !== 'production' ? { debug: 'Token does not match latest stored reset token' } : {}),
            });
        }

        if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
            console.error('[Reset Password] Token expired:', {
                expiry: user.resetTokenExpiry,
                now: new Date(),
            });
            return res.status(400).json({
                message: 'Invalid or expired reset token',
                ...(process.env.NODE_ENV !== 'production' ? { debug: 'Reset token has expired' } : {}),
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await (prisma.user.update as any)({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetToken: null,
                resetTokenExpiry: null
            }
        });

        console.log('[Reset Password] Password successfully reset for user:', { email: normalizedEmail });
        res.json({ message: 'Password has been successfully reset' });
    } catch (error) {
        console.error('[Reset Password] Exception occurred:', error);
        res.status(500).json({ message: 'Reset failed' });
    }
};
