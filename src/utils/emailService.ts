import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const EMAIL_NOTIFICATIONS_ENABLED = String(process.env.EMAIL_NOTIFICATIONS_ENABLED || 'true').trim().toLowerCase() !== 'false';

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        // Gmail App Passwords may contain spaces; remove them.
        pass: (process.env.EMAIL_PASS || '').replace(/\s/g, ''),
    },
});

type NotificationMailParams = {
    to: string;
    subject: string;
    html: string;
};

const sendNotificationMail = async ({ to, subject, html }: NotificationMailParams) => {
    const recipient = String(to || '').trim();
    if (!EMAIL_NOTIFICATIONS_ENABLED || !recipient) return false;

    try {
        await transporter.sendMail({
            from: `"MaidConnect" <${process.env.EMAIL_USER}>`,
            to: recipient,
            subject,
            html,
        });
        return true;
    } catch (error) {
        console.error(`Failed to send notification email to ${recipient}:`, error);
        return false;
    }
};

const escapeHtml = (value: unknown) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const formatSalaryRange = (salaryMin?: number | null, salaryMax?: number | null) => {
    const min = Number(salaryMin);
    const max = Number(salaryMax);
    const hasMin = Number.isFinite(min) && min > 0;
    const hasMax = Number.isFinite(max) && max > 0;
    if (!hasMin && !hasMax) return 'Negotiable';
    if (hasMin && hasMax) return `${min.toLocaleString()} - ${max.toLocaleString()} RWF`;
    if (hasMax) return `Up to ${max.toLocaleString()} RWF`;
    return `From ${min.toLocaleString()} RWF`;
};

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

export const sendNewJobAlertEmail = async (params: {
    to: string;
    maidName?: string | null;
    employerName?: string | null;
    jobTitle: string;
    location: string;
    salaryMin?: number | null;
    salaryMax?: number | null;
}) => {
    const greetingName = escapeHtml(params.maidName || 'there');
    const safeJobTitle = escapeHtml(params.jobTitle);
    const safeLocation = escapeHtml(params.location);
    const safeEmployerName = escapeHtml(params.employerName || 'an employer');
    const salaryLine = escapeHtml(formatSalaryRange(params.salaryMin, params.salaryMax));

    return sendNotificationMail({
        to: params.to,
        subject: `New Job Alert: ${params.jobTitle}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 10px;">
                <h2 style="color: #1d4ed8; margin-top: 0;">New Job Opportunity</h2>
                <p>Hello ${greetingName},</p>
                <p>A new job has been posted on MaidConnect.</p>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin: 14px 0;">
                    <p style="margin: 0 0 6px 0;"><strong>Job:</strong> ${safeJobTitle}</p>
                    <p style="margin: 0 0 6px 0;"><strong>Location:</strong> ${safeLocation}</p>
                    <p style="margin: 0 0 6px 0;"><strong>Salary:</strong> ${salaryLine}</p>
                    <p style="margin: 0;"><strong>Posted by:</strong> ${safeEmployerName}</p>
                </div>
                <p>Open the app to review details and apply.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 18px 0;">
                <p style="font-size: 12px; color: #6b7280; margin: 0;">MaidConnect Notifications</p>
            </div>
        `,
    });
};

export const sendJobApplicationEmailToEmployer = async (params: {
    to: string;
    employerName?: string | null;
    maidName?: string | null;
    jobTitle: string;
}) => {
    const greetingName = escapeHtml(params.employerName || 'there');
    const safeMaidName = escapeHtml(params.maidName || 'A maid');
    const safeJobTitle = escapeHtml(params.jobTitle);

    return sendNotificationMail({
        to: params.to,
        subject: `New Application for "${params.jobTitle}"`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 10px;">
                <h2 style="color: #1d4ed8; margin-top: 0;">New Job Application</h2>
                <p>Hello ${greetingName},</p>
                <p><strong>${safeMaidName}</strong> has applied for your job:</p>
                <p style="font-size: 16px; font-weight: 700; margin: 8px 0 16px;">${safeJobTitle}</p>
                <p>Open the app to review the application and respond.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 18px 0;">
                <p style="font-size: 12px; color: #6b7280; margin: 0;">MaidConnect Notifications</p>
            </div>
        `,
    });
};

export const sendApplicationDecisionEmailToMaid = async (params: {
    to: string;
    maidName?: string | null;
    employerName?: string | null;
    jobTitle: string;
    status: 'ACCEPTED' | 'REJECTED';
}) => {
    const greetingName = escapeHtml(params.maidName || 'there');
    const safeJobTitle = escapeHtml(params.jobTitle);
    const safeEmployerName = escapeHtml(params.employerName || 'the employer');
    const isAccepted = params.status === 'ACCEPTED';

    return sendNotificationMail({
        to: params.to,
        subject: isAccepted
            ? `Congratulations! You're Hired: ${params.jobTitle}`
            : `Application Update: ${params.jobTitle}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 10px;">
                <h2 style="color: ${isAccepted ? '#15803d' : '#b91c1c'}; margin-top: 0;">
                    ${isAccepted ? "Congratulations, You're Hired!" : 'Application Not Selected'}
                </h2>
                <p>Hello ${greetingName},</p>
                <p>
                    ${isAccepted
                ? `Great news! You have been hired for <strong>${safeJobTitle}</strong> by ${safeEmployerName}.`
                : `Your application for <strong>${safeJobTitle}</strong> has been <strong>rejected</strong> by ${safeEmployerName}.`}
                </p>
                <p>${isAccepted ? 'Open MaidConnect to view the next steps and start preparing.' : 'Open MaidConnect to review updates and explore more opportunities.'}</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 18px 0;">
                <p style="font-size: 12px; color: #6b7280; margin: 0;">MaidConnect Notifications</p>
            </div>
        `,
    });
};
