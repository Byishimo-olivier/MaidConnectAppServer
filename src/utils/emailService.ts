import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        // Gmail App Passwords may have spaces — strip them
        pass: (process.env.EMAIL_PASS || '').replace(/\s/g, ''),
    },
});

export const sendResetPin = async (email: string, pin: string) => {
    const mailOptions = {
        from: `"MaidConnect Support" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Password Reset PIN - MaidConnect',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="color: #3b5998; text-align: center;">Password Reset Request</h2>
                <p>Hello,</p>
                <p>You requested a password reset for your MaidConnect account. Please use the following 6-digit PIN to verify your request:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #3b5998; background: #f0f2f5; padding: 10px 20px; border-radius: 5px;">${pin}</span>
                </div>
                <p>This PIN will expire in 1 hour.</p>
                <p>If you did not request this, please ignore this email or contact support if you have concerns.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #777; text-align: center;">&copy; 2026 MaidConnect Team. All rights reserved.</p>
            </div>
        `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Reset PIN sent to ${email}`);
    return true;
};
