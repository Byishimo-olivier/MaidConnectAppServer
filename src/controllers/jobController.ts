import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from './notificationController';

export const createJob = async (req: AuthRequest, res: Response) => {
    try {
        const { title, description, requirements, location, salaryMin, salaryMax } = req.body;
        const employerId = req.user?.userId;

        if (!employerId) return res.status(401).json({ message: 'Unauthorized' });

        const job = await prisma.job.create({
            data: {
                title,
                description,
                requirements,
                location,
                salaryMin,
                salaryMax,
                employerId
            }
        });

        // Notify all maids about the new job
        try {
            const maids = await prisma.user.findMany({
                where: { role: 'MAID' },
                select: { id: true }
            });

            const notificationPromises = maids.map(maid =>
                createNotification(
                    maid.id,
                    'New Job Alert 🔔',
                    `New job: "${title}" is now available in ${location}!`,
                    'SYSTEM'
                )
            );

            await Promise.all(notificationPromises);
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

export const applyForJob = async (req: AuthRequest, res: Response) => {
    try {
        const { jobId } = req.params;
        const { coverLetter } = req.body;
        const maidId = req.user?.userId;

        if (!maidId) return res.status(401).json({ message: 'Unauthorized' });

        const existingApplication = await prisma.application.findFirst({
            where: { jobId: Number(jobId), maidId }
        });

        if (existingApplication) {
            return res.status(400).json({ message: 'Already applied' });
        }

        const application = await prisma.application.create({
            data: {
                jobId: Number(jobId),
                maidId,
                coverLetter
            },
            include: {
                job: true,
                maid: { select: { fullName: true } }
            }
        });

        // Notify employer
        await createNotification(
            application.job.employerId,
            'New Job Application',
            `${application.maid?.fullName} has applied for your job: ${application.job.title}`,
            'APPLICATION'
        );

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

        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const application = await prisma.application.update({
            where: { id: Number(id) },
            data: { status },
            include: {
                job: true,
                maid: true
            }
        });

        // Notify maid
        await createNotification(
            application.maidId,
            'Application Update',
            `Your application for "${application.job.title}" has been ${status.toLowerCase()}.`,
            'APPLICATION'
        );

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
