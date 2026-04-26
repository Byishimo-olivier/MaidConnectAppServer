import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from './notificationController';
import {
    sendApplicationDecisionEmailToMaid,
    sendJobApplicationEmailToEmployer,
    sendNewJobAlertEmail
} from '../utils/emailService';

const JOB_POST_FEE_PERCENTAGE_RAW = Number(process.env.JOB_POST_FEE_PERCENTAGE || '0.1');
const JOB_POST_FEE_PERCENTAGE = Number.isFinite(JOB_POST_FEE_PERCENTAGE_RAW) && JOB_POST_FEE_PERCENTAGE_RAW > 0
    ? JOB_POST_FEE_PERCENTAGE_RAW
    : 0.1;
const SUCCESS_PAYMENT_STATUSES = new Set(['SUCCESSFUL', 'SUCCESS', 'COMPLETED']);
const PAYMENT_READY_TYPE = 'JOB_POSTING';
const PAYMENT_CONSUMED_TYPE = 'JOB_POSTING_USED';
const APPLICATION_STATUS_VALUES = new Set(['PENDING', 'INTERVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']);

const sanitizeSalary = (value: unknown) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
};

const calculateJobPostingFee = (salaryMax: number) => Math.ceil(salaryMax * JOB_POST_FEE_PERCENTAGE);

export const createJob = async (req: AuthRequest, res: Response) => {
    try {
        const {
            title,
            description,
            requirements,
            location,
            salaryMin,
            salaryMax,
            paymentTransactionId
        } = req.body;
        const employerId = req.user?.userId;

        if (!employerId) return res.status(401).json({ message: 'Unauthorized' });
        if (!title || !description || !location) {
            return res.status(400).json({ message: 'Missing required fields: title, description, location' });
        }

        const parsedSalaryMax = sanitizeSalary(salaryMax);
        const parsedSalaryMin = sanitizeSalary(salaryMin);
        if (!parsedSalaryMax || parsedSalaryMax <= 0) {
            return res.status(400).json({ message: 'salaryMax is required and must be greater than 0' });
        }
        if (parsedSalaryMin !== null && parsedSalaryMin < 0) {
            return res.status(400).json({ message: 'salaryMin cannot be negative' });
        }
        if (parsedSalaryMin !== null && parsedSalaryMin > parsedSalaryMax) {
            return res.status(400).json({ message: 'salaryMin cannot be greater than salaryMax' });
        }

        const txId = String(paymentTransactionId || '').trim();
        if (!txId) {
            return res.status(400).json({ message: 'Payment verification required before posting job' });
        }

        const payment = await prisma.payment.findUnique({ where: { transactionId: txId } });
        if (!payment) {
            return res.status(400).json({ message: 'Payment transaction not found. Complete payment first.' });
        }
        if (payment.employerId !== employerId) {
            return res.status(403).json({ message: 'Payment transaction does not belong to this user' });
        }
        if (payment.type === PAYMENT_CONSUMED_TYPE) {
            return res.status(400).json({ message: 'This payment transaction has already been used to post a job.' });
        }
        if (payment.type !== PAYMENT_READY_TYPE) {
            return res.status(400).json({ message: 'Payment is not verified for job posting yet.' });
        }
        if (!SUCCESS_PAYMENT_STATUSES.has(String(payment.status || '').toUpperCase())) {
            return res.status(400).json({ message: 'Payment is not successful yet. Verify payment and try again.' });
        }

        const requiredFee = calculateJobPostingFee(parsedSalaryMax);
        if (Number(payment.amount || 0) + 0.001 < requiredFee) {
            return res.status(400).json({
                message: `Insufficient job posting fee paid. Required ${requiredFee} RWF.`,
                requiredAmount: requiredFee,
                paidAmount: Number(payment.amount || 0)
            });
        }

        const job = await prisma.$transaction(async (tx) => {
            const createdJob = await tx.job.create({
                data: {
                    title: String(title).trim(),
                    description: String(description).trim(),
                    requirements: requirements ? String(requirements).trim() : null,
                    location: String(location).trim(),
                    salaryMin: parsedSalaryMin,
                    salaryMax: parsedSalaryMax,
                    employerId
                }
            });

            await tx.payment.update({
                where: { id: payment.id },
                data: { type: PAYMENT_CONSUMED_TYPE }
            });

            return createdJob;
        });

        // Notify all maids about the new job
        try {
            const employer = await prisma.user.findUnique({
                where: { id: employerId },
                select: { fullName: true }
            });
            const maids = await prisma.user.findMany({
                where: { role: 'MAID' },
                select: { id: true, email: true, fullName: true }
            });

            const notificationPromises = maids.map(maid =>
                createNotification(
                    maid.id,
                    'New Job Alert 🔔',
                    `New job: "${title}" is now available in ${location}!`,
                    'SYSTEM'
                )
            );

            const emailPromises = maids.map((maid) => {
                if (!maid.email) return Promise.resolve(false);
                return sendNewJobAlertEmail({
                    to: maid.email,
                    maidName: maid.fullName,
                    employerName: employer?.fullName || null,
                    jobTitle: String(title),
                    location: String(location),
                    salaryMin: parsedSalaryMin,
                    salaryMax: parsedSalaryMax
                });
            });

            await Promise.all([...notificationPromises, ...emailPromises]);
        } catch (notifyError) {
            console.error('Failed to send job notifications to maids:', notifyError);
            // We don't want to fail the job creation if notifications fail
        }

        res.status(201).json(job);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create job' });
    }
};

export const getJobs = async (req: Request, res: Response) => {
    try {
        const jobs = await prisma.job.findMany({
            where: { status: 'OPEN' },
            include: { employer: { select: { fullName: true, email: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(jobs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch jobs' });
    }
};

export const getMyJobs = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const jobs = await prisma.job.findMany({
            where: { employerId: userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(jobs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch your jobs' });
    }
};

export const updateMyJobStatus = async (req: AuthRequest, res: Response) => {
    try {
        const employerId = req.user?.userId;
        if (!employerId) return res.status(401).json({ message: 'Unauthorized' });

        const jobId = Number(req.params.jobId);
        if (!Number.isInteger(jobId) || jobId <= 0) {
            return res.status(400).json({ message: 'Invalid job id' });
        }

        const requestedStatus = String(req.body?.status || '').trim().toUpperCase();
        if (!['OPEN', 'CLOSED'].includes(requestedStatus)) {
            return res.status(400).json({ message: 'Invalid status. Allowed values: OPEN, CLOSED' });
        }

        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job) return res.status(404).json({ message: 'Job not found' });
        if (job.employerId !== employerId) {
            return res.status(403).json({ message: 'You do not own this job' });
        }

        if (job.status === requestedStatus) {
            return res.json({
                message: `Job is already ${requestedStatus}`,
                job
            });
        }

        if (requestedStatus === 'CLOSED') {
            const updated = await prisma.job.update({
                where: { id: jobId },
                data: { status: 'CLOSED' }
            });
            return res.json({
                message: 'Job closed successfully',
                job: updated
            });
        }

        if (job.status !== 'CLOSED') {
            return res.status(400).json({ message: 'Only CLOSED jobs can be reopened to OPEN.' });
        }

        const salaryMax = sanitizeSalary(job.salaryMax);
        if (!salaryMax || salaryMax <= 0) {
            return res.status(400).json({
                message: 'This job has no valid max salary. Cannot reopen because 10% fee cannot be calculated.'
            });
        }

        const transactionId = String(req.body?.paymentTransactionId || '').trim();
        if (!transactionId) {
            return res.status(400).json({ message: 'paymentTransactionId is required to reopen a closed job' });
        }

        const payment = await prisma.payment.findUnique({ where: { transactionId } });
        if (!payment) {
            return res.status(400).json({ message: 'Payment transaction not found. Complete payment first.' });
        }
        if (payment.employerId !== employerId) {
            return res.status(403).json({ message: 'Payment transaction does not belong to this user' });
        }
        if (payment.type === PAYMENT_CONSUMED_TYPE) {
            return res.status(400).json({ message: 'This payment transaction has already been used.' });
        }
        if (payment.type !== PAYMENT_READY_TYPE) {
            return res.status(400).json({ message: 'Payment is not verified for job reopening yet.' });
        }
        if (!SUCCESS_PAYMENT_STATUSES.has(String(payment.status || '').toUpperCase())) {
            return res.status(400).json({ message: 'Payment is not successful yet. Verify payment and try again.' });
        }

        const requiredFee = calculateJobPostingFee(salaryMax);
        if (Number(payment.amount || 0) + 0.001 < requiredFee) {
            return res.status(400).json({
                message: `Insufficient reopening fee. Required ${requiredFee} RWF.`,
                requiredAmount: requiredFee,
                paidAmount: Number(payment.amount || 0)
            });
        }

        const updated = await prisma.$transaction(async (tx) => {
            const reopenedJob = await tx.job.update({
                where: { id: jobId },
                data: { status: 'OPEN' }
            });

            await tx.payment.update({
                where: { id: payment.id },
                data: { type: PAYMENT_CONSUMED_TYPE }
            });

            return reopenedJob;
        });

        return res.json({
            message: 'Job reopened successfully',
            job: updated
        });
    } catch (error) {
        console.error('Failed to update job status:', error);
        return res.status(500).json({ message: 'Failed to update job status' });
    }
};

export const applyForJob = async (req: AuthRequest, res: Response) => {
    try {
        const { jobId } = req.params;
        const { coverLetter } = req.body;
        const maidId = req.user?.userId;
        const parsedJobId = Number(jobId);

        if (!maidId) return res.status(401).json({ message: 'Unauthorized' });
        if (!Number.isInteger(parsedJobId) || parsedJobId <= 0) {
            return res.status(400).json({ message: 'Invalid job id' });
        }

        const targetJob = await prisma.job.findUnique({
            where: { id: parsedJobId },
            select: { id: true, status: true }
        });
        if (!targetJob) {
            return res.status(404).json({ message: 'Job not found' });
        }
        if (targetJob.status !== 'OPEN') {
            return res.status(400).json({ message: 'You can only apply to open jobs' });
        }

        const existingApplication = await prisma.application.findFirst({
            where: { jobId: parsedJobId, maidId }
        });

        if (existingApplication) {
            return res.status(400).json({ message: 'Already applied' });
        }

        const application = await prisma.application.create({
            data: {
                jobId: parsedJobId,
                maidId,
                coverLetter
            },
            include: {
                job: {
                    select: {
                        id: true,
                        title: true,
                        employerId: true,
                        employer: {
                            select: {
                                fullName: true,
                                email: true
                            }
                        }
                    }
                },
                maid: {
                    select: {
                        fullName: true,
                        email: true
                    }
                }
            }
        });

        // Notify employer
        await createNotification(
            application.job.employerId,
            'New Job Application',
            `${application.maid?.fullName} has applied for your job: ${application.job.title}`,
            'APPLICATION'
        );

        if (application.job.employer?.email) {
            await sendJobApplicationEmailToEmployer({
                to: application.job.employer.email,
                employerName: application.job.employer.fullName,
                maidName: application.maid?.fullName,
                jobTitle: application.job.title
            });
        }

        res.status(201).json(application);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to apply' });
    }
};

export const updateApplicationStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user?.userId;
        const applicationId = Number(id);
        const normalizedStatus = String(status || '').trim().toUpperCase();

        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        if (!Number.isInteger(applicationId) || applicationId <= 0) {
            return res.status(400).json({ message: 'Invalid application id' });
        }
        if (!APPLICATION_STATUS_VALUES.has(normalizedStatus)) {
            return res.status(400).json({
                message: `Invalid status. Allowed: ${Array.from(APPLICATION_STATUS_VALUES).join(', ')}`
            });
        }

        const existingApplication = await prisma.application.findUnique({
            where: { id: applicationId },
            include: {
                job: {
                    select: {
                        id: true,
                        title: true,
                        employerId: true,
                        employer: {
                            select: {
                                fullName: true
                            }
                        }
                    }
                },
                maid: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true
                    }
                }
            }
        });
        if (!existingApplication) {
            return res.status(404).json({ message: 'Application not found' });
        }
        if (existingApplication.job.employerId !== userId) {
            return res.status(403).json({ message: 'Unauthorized to update this application' });
        }

        const application = await prisma.application.update({
            where: { id: applicationId },
            data: { status: normalizedStatus as any },
            include: {
                job: {
                    select: {
                        id: true,
                        title: true,
                        employerId: true,
                        employer: {
                            select: {
                                fullName: true
                            }
                        }
                    }
                },
                maid: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true
                    }
                }
            }
        });

        // Notify maid
        const maidNotificationTitle = normalizedStatus === 'ACCEPTED'
            ? "You're Hired!"
            : 'Application Update';
        const maidNotificationMessage = normalizedStatus === 'ACCEPTED'
            ? `Congratulations! You are hired for "${application.job.title}".`
            : normalizedStatus === 'REJECTED'
                ? `Update: You were not selected for "${application.job.title}".`
                : `Your application for "${application.job.title}" has been ${normalizedStatus.toLowerCase()}.`;

        await createNotification(
            application.maidId,
            maidNotificationTitle,
            maidNotificationMessage,
            'APPLICATION'
        );

        if (
            (normalizedStatus === 'ACCEPTED' || normalizedStatus === 'REJECTED')
            && application.maid?.email
        ) {
            await sendApplicationDecisionEmailToMaid({
                to: application.maid.email,
                maidName: application.maid.fullName,
                employerName: application.job.employer?.fullName,
                jobTitle: application.job.title,
                status: normalizedStatus as 'ACCEPTED' | 'REJECTED'
            });
        }

        res.json(application);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update application' });
    }
};

export const getEmployerApplications = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const applications = await prisma.application.findMany({
            where: {
                job: {
                    employerId: userId
                }
            },
            include: {
                maid: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImage: true,
                    }
                },
                job: {
                    select: {
                        id: true,
                        title: true,
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(applications);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch applications' });
    }
};

export const getApplicationById = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const application = await prisma.application.findFirst({
            where: { id: Number(id) },
            include: {
                maid: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImage: true,
                    }
                },
                job: {
                    select: {
                        id: true,
                        title: true,
                        employerId: true
                    }
                }
            }
        });

        if (!application) return res.status(404).json({ message: 'Application not found' });

        // Check if user is the employer of this job
        if (application.job.employerId !== userId) {
            return res.status(403).json({ message: 'Unauthorized to view this application' });
        }

        res.json(application);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch application' });
    }
};

export const getMaidApplications = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const applications = await prisma.application.findMany({
            where: { maidId: userId },
            include: {
                job: {
                    include: {
                        employer: {
                            select: {
                                fullName: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(applications);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch your applications' });
    }
};

