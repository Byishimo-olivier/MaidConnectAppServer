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
exports.sendResetPin = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const transporter = nodemailer_1.default.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        // Gmail App Passwords may have spaces — strip them
        pass: (process.env.EMAIL_PASS || '').replace(/\s/g, ''),
    },
});
const sendResetPin = (email, pin) => __awaiter(void 0, void 0, void 0, function* () {
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
    yield transporter.sendMail(mailOptions);
    console.log(`Reset PIN sent to ${email}`);
    return true;
});
exports.sendResetPin = sendResetPin;
