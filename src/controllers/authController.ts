import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { Role } from '@prisma/client';
import { sendResetPin } from '../utils/emailService';

export const register = async (req: Request, res: Response) => {
    try {
        const { email, password, role, fullName, phone, address, description } = req.body;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                email,
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

        const user = await prisma.user.findUnique({ where: { email } });
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
        const { email } = req.body;
        const user: any = await prisma.user.findUnique({ where: { email } });

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

        // Send real email with PIN — if this fails, the outer catch returns a 500
        await sendResetPin(email, pin);

        res.json({ message: 'If an account exists for this email, you will receive a reset PIN.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to process request' });
    }
};

export const verifyResetPin = async (req: Request, res: Response) => {
    try {
        const { email, pin } = req.body;
        const user: any = await prisma.user.findUnique({ where: { email } });

        if (!user || user.resetToken !== pin || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
            return res.status(400).json({ message: 'Invalid or expired PIN' });
        }

        res.json({ message: 'PIN verified successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Verification failed' });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    try {
        const { email, token, newPassword } = req.body;

        const user: any = await prisma.user.findUnique({ where: { email } });

        if (!user || user.resetToken !== token || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
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

        res.json({ message: 'Password has been successfully reset' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Reset failed' });
    }
};
