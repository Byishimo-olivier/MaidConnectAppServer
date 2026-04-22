import { ApplicationStatus, ContractStatus, JobStatus, Role } from '@prisma/client';
import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';

type Pagination = {
    page: number;
    limit: number;
    skip: number;
};

const ROLE_VALUES = Object.values(Role);
const JOB_STATUS_VALUES = Object.values(JobStatus);
const APPLICATION_STATUS_VALUES = Object.values(ApplicationStatus);
const CONTRACT_STATUS_VALUES = Object.values(ContractStatus);
const DISPUTE_STATUS_VALUES = ['OPEN', 'RESOLVED', 'CLOSED'];

const getQueryValue = (value: unknown) => {
    if (Array.isArray(value)) return value[0];
    return value;
};

const parsePositiveInt = (value: unknown, fallback: number, max = 100) => {
    const parsed = Number(getQueryValue(value));
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(Math.floor(parsed), max);
};

const parsePagination = (req: AuthRequest): Pagination => {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    return {
        page,
        limit,
        skip: (page - 1) * limit
    };
};

const parseEnum = <T extends string>(value: unknown, allowed: readonly T[]) => {
    const normalized = String(getQueryValue(value) || '').trim().toUpperCase() as T;
    return allowed.includes(normalized) ? normalized : null;
};

const normalizeSearch = (value: unknown) => String(getQueryValue(value) || '').trim();

const formatListResponse = <T>(items: T[], total: number, page: number, limit: number) => ({
    items,
    pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
    }
});

export const getAdminOverview = async (_req: AuthRequest, res: Response) => {
    try {
        const [
            usersCount,
            employersCount,
            maidsCount,
            adminsCount,
            jobsCount,
            openJobsCount,
            applicationsCount,
            contractsCount,
            activeContractsCount,
            disputesCount,
            openDisputesCount,
            reviewsCount,
            paymentsCount,
            successfulPaymentsCount,
            unreadNotificationsCount,
            paymentSum,
            recentUsers,
            recentJobs,
            recentApplications,
            recentContracts,
            recentPayments,
            recentDisputes
        ] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { role: Role.EMPLOYER } }),
            prisma.user.count({ where: { role: Role.MAID } }),
            prisma.user.count({ where: { role: Role.ADMIN } }),
            prisma.job.count(),
            prisma.job.count({ where: { status: JobStatus.OPEN } }),
            prisma.application.count(),
            prisma.contract.count(),
            prisma.contract.count({ where: { status: ContractStatus.ACTIVE } }),
            prisma.dispute.count(),
            prisma.dispute.count({ where: { status: 'OPEN' } }),
            prisma.review.count(),
            prisma.payment.count(),
            prisma.payment.count({ where: { status: 'SUCCESSFUL' } }),
            prisma.notification.count({ where: { read: false } }),
            prisma.payment.aggregate({ _sum: { amount: true } }),
            prisma.user.findMany({
                orderBy: { createdAt: 'desc' },
                take: 8,
                select: { id: true, fullName: true, role: true, createdAt: true }
            }),
            prisma.job.findMany({
                orderBy: { createdAt: 'desc' },
                take: 8,
                include: { employer: { select: { fullName: true } } }
            }),
            prisma.application.findMany({
                orderBy: { createdAt: 'desc' },
                take: 8,
                include: {
                    maid: { select: { fullName: true } },
                    job: { select: { title: true } }
                }
            }),
            prisma.contract.findMany({
                orderBy: { createdAt: 'desc' },
                take: 8,
                include: {
                    employer: { select: { fullName: true } },
                    maid: { select: { fullName: true } }
                }
            }),
            prisma.payment.findMany({
                orderBy: { createdAt: 'desc' },
                take: 8,
                include: { employer: { select: { fullName: true } } }
            }),
            prisma.dispute.findMany({
                orderBy: { createdAt: 'desc' },
                take: 8,
                include: {
                    contract: { select: { title: true } },
                    complainant: { select: { fullName: true } },
                    respondent: { select: { fullName: true } }
                }
            })
        ]);

        const recentActivity = [
            ...recentUsers.map((item) => ({
                id: `user_${item.id}`,
                type: 'USER',
                title: `New ${item.role.toLowerCase()} account`,
                subtitle: item.fullName || `User #${item.id}`,
                status: item.role,
                createdAt: item.createdAt
            })),
            ...recentJobs.map((item) => ({
                id: `job_${item.id}`,
                type: 'JOB',
                title: item.title,
                subtitle: `Posted by ${item.employer.fullName || 'Employer'}`,
                status: item.status,
                createdAt: item.createdAt
            })),
            ...recentApplications.map((item) => ({
                id: `application_${item.id}`,
                type: 'APPLICATION',
                title: item.job.title,
                subtitle: `Applicant: ${item.maid.fullName || 'Maid'}`,
                status: item.status,
                createdAt: item.createdAt
            })),
            ...recentContracts.map((item) => ({
                id: `contract_${item.id}`,
                type: 'CONTRACT',
                title: item.title,
                subtitle: `${item.employer.fullName || 'Employer'} -> ${item.maid.fullName || 'Maid'}`,
                status: item.status,
                createdAt: item.createdAt
            })),
            ...recentPayments.map((item) => ({
                id: `payment_${item.id}`,
                type: 'PAYMENT',
                title: item.transactionId,
                subtitle: `${item.employer.fullName || 'Employer'} paid ${item.amount} ${item.currency}`,
                status: item.status,
                createdAt: item.createdAt
            })),
            ...recentDisputes.map((item) => ({
                id: `dispute_${item.id}`,
                type: 'DISPUTE',
                title: item.reason,
                subtitle: `${item.contract.title} | ${item.complainant.fullName || 'User'} vs ${item.respondent.fullName || 'User'}`,
                status: item.status,
                createdAt: item.createdAt
            }))
        ]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 40);

        return res.json({
            stats: {
                usersCount,
                employersCount,
                maidsCount,
                adminsCount,
                jobsCount,
                openJobsCount,
                applicationsCount,
                contractsCount,
                activeContractsCount,
                disputesCount,
                openDisputesCount,
                reviewsCount,
                paymentsCount,
                successfulPaymentsCount,
                paymentVolume: paymentSum._sum.amount || 0,
                unreadNotificationsCount
            },
            recentActivity
        });
    } catch (error) {
        console.error('Failed to fetch admin overview:', error);
        return res.status(500).json({ message: 'Failed to fetch admin overview' });
    }
};

export const getAdminUsers = async (req: AuthRequest, res: Response) => {
    try {
        const { page, limit, skip } = parsePagination(req);
        const role = parseEnum(req.query.role, ROLE_VALUES);
        const search = normalizeSearch(req.query.search);

        const where: any = {};
        if (role) where.role = role;
        if (search) {
            where.OR = [
                { fullName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [total, items] = await Promise.all([
            prisma.user.count({ where }),
            prisma.user.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    phone: true,
                    role: true,
                    createdAt: true,
                    _count: {
                        select: {
                            jobs: true,
                            applications: true,
                            payments: true,
                            notifications: true
                        }
                    }
                }
            })
        ]);

        return res.json(formatListResponse(items, total, page, limit));
    } catch (error) {
        console.error('Failed to fetch admin users:', error);
        return res.status(500).json({ message: 'Failed to fetch users' });
    }
};

export const updateAdminUserRole = async (req: AuthRequest, res: Response) => {
    try {
        const targetUserId = Number(req.params.id);
        if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ message: 'Invalid user id' });
        }

        const role = parseEnum(req.body?.role, ROLE_VALUES);
        if (!role) {
            return res.status(400).json({ message: `Invalid role. Allowed: ${ROLE_VALUES.join(', ')}` });
        }

        const updated = await prisma.user.update({
            where: { id: targetUserId },
            data: { role },
            select: {
                id: true,
                fullName: true,
                email: true,
                phone: true,
                role: true,
                createdAt: true
            }
        });

        return res.json(updated);
    } catch (error) {
        console.error('Failed to update user role:', error);
        return res.status(500).json({ message: 'Failed to update user role' });
    }
};

export const getAdminJobs = async (req: AuthRequest, res: Response) => {
    try {
        const { page, limit, skip } = parsePagination(req);
        const status = parseEnum(req.query.status, JOB_STATUS_VALUES);
        const search = normalizeSearch(req.query.search);

        const where: any = {};
        if (status) where.status = status;
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { location: { contains: search, mode: 'insensitive' } },
                { employer: { fullName: { contains: search, mode: 'insensitive' } } }
            ];
        }

        const [total, items] = await Promise.all([
            prisma.job.count({ where }),
            prisma.job.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    employer: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true
                        }
                    },
                    _count: {
                        select: { applications: true }
                    }
                }
            })
        ]);

        return res.json(formatListResponse(items, total, page, limit));
    } catch (error) {
        console.error('Failed to fetch admin jobs:', error);
        return res.status(500).json({ message: 'Failed to fetch jobs' });
    }
};

export const updateAdminJobStatus = async (req: AuthRequest, res: Response) => {
    try {
        const jobId = Number(req.params.id);
        if (!Number.isFinite(jobId) || jobId <= 0) {
            return res.status(400).json({ message: 'Invalid job id' });
        }

        const status = parseEnum(req.body?.status, JOB_STATUS_VALUES);
        if (!status) {
            return res.status(400).json({ message: `Invalid status. Allowed: ${JOB_STATUS_VALUES.join(', ')}` });
        }

        const updated = await prisma.job.update({
            where: { id: jobId },
            data: { status }
        });

        return res.json(updated);
    } catch (error) {
        console.error('Failed to update job status:', error);
        return res.status(500).json({ message: 'Failed to update job status' });
    }
};

export const getAdminApplications = async (req: AuthRequest, res: Response) => {
    try {
        const { page, limit, skip } = parsePagination(req);
        const status = parseEnum(req.query.status, APPLICATION_STATUS_VALUES);
        const search = normalizeSearch(req.query.search);

        const where: any = {};
        if (status) where.status = status;
        if (search) {
            where.OR = [
                { job: { title: { contains: search, mode: 'insensitive' } } },
                { maid: { fullName: { contains: search, mode: 'insensitive' } } }
            ];
        }

        const [total, items] = await Promise.all([
            prisma.application.count({ where }),
            prisma.application.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    maid: { select: { id: true, fullName: true, email: true } },
                    job: {
                        select: {
                            id: true,
                            title: true,
                            employer: { select: { id: true, fullName: true } }
                        }
                    }
                }
            })
        ]);

        return res.json(formatListResponse(items, total, page, limit));
    } catch (error) {
        console.error('Failed to fetch admin applications:', error);
        return res.status(500).json({ message: 'Failed to fetch applications' });
    }
};

export const updateAdminApplicationStatus = async (req: AuthRequest, res: Response) => {
    try {
        const applicationId = Number(req.params.id);
        if (!Number.isFinite(applicationId) || applicationId <= 0) {
            return res.status(400).json({ message: 'Invalid application id' });
        }

        const status = parseEnum(req.body?.status, APPLICATION_STATUS_VALUES);
        if (!status) {
            return res.status(400).json({ message: `Invalid status. Allowed: ${APPLICATION_STATUS_VALUES.join(', ')}` });
        }

        const updated = await prisma.application.update({
            where: { id: applicationId },
            data: { status }
        });

        return res.json(updated);
    } catch (error) {
        console.error('Failed to update application status:', error);
        return res.status(500).json({ message: 'Failed to update application status' });
    }
};

export const getAdminContracts = async (req: AuthRequest, res: Response) => {
    try {
        const { page, limit, skip } = parsePagination(req);
        const status = parseEnum(req.query.status, CONTRACT_STATUS_VALUES);
        const search = normalizeSearch(req.query.search);

        const where: any = {};
        if (status) where.status = status;
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { employer: { fullName: { contains: search, mode: 'insensitive' } } },
                { maid: { fullName: { contains: search, mode: 'insensitive' } } }
            ];
        }

        const [total, items] = await Promise.all([
            prisma.contract.count({ where }),
            prisma.contract.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    employer: { select: { id: true, fullName: true, email: true } },
                    maid: { select: { id: true, fullName: true, email: true } }
                }
            })
        ]);

        return res.json(formatListResponse(items, total, page, limit));
    } catch (error) {
        console.error('Failed to fetch admin contracts:', error);
        return res.status(500).json({ message: 'Failed to fetch contracts' });
    }
};

export const updateAdminContractStatus = async (req: AuthRequest, res: Response) => {
    try {
        const contractId = Number(req.params.id);
        if (!Number.isFinite(contractId) || contractId <= 0) {
            return res.status(400).json({ message: 'Invalid contract id' });
        }

        const status = parseEnum(req.body?.status, CONTRACT_STATUS_VALUES);
        if (!status) {
            return res.status(400).json({ message: `Invalid status. Allowed: ${CONTRACT_STATUS_VALUES.join(', ')}` });
        }

        const updated = await prisma.contract.update({
            where: { id: contractId },
            data: { status }
        });

        return res.json(updated);
    } catch (error) {
        console.error('Failed to update contract status:', error);
        return res.status(500).json({ message: 'Failed to update contract status' });
    }
};

export const getAdminPayments = async (req: AuthRequest, res: Response) => {
    try {
        const { page, limit, skip } = parsePagination(req);
        const search = normalizeSearch(req.query.search);
        const status = String(getQueryValue(req.query.status) || '').trim();
        const type = String(getQueryValue(req.query.type) || '').trim();

        const where: any = {};
        if (status) where.status = status.toUpperCase();
        if (type) where.type = type.toUpperCase();
        if (search) {
            where.OR = [
                { transactionId: { contains: search, mode: 'insensitive' } },
                { employer: { fullName: { contains: search, mode: 'insensitive' } } }
            ];
        }

        const [total, items] = await Promise.all([
            prisma.payment.count({ where }),
            prisma.payment.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    employer: { select: { id: true, fullName: true, email: true } }
                }
            })
        ]);

        return res.json(formatListResponse(items, total, page, limit));
    } catch (error) {
        console.error('Failed to fetch admin payments:', error);
        return res.status(500).json({ message: 'Failed to fetch payments' });
    }
};

export const getAdminDisputes = async (req: AuthRequest, res: Response) => {
    try {
        const { page, limit, skip } = parsePagination(req);
        const status = parseEnum(req.query.status, DISPUTE_STATUS_VALUES);
        const search = normalizeSearch(req.query.search);

        const where: any = {};
        if (status) where.status = status;
        if (search) {
            where.OR = [
                { reason: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { contract: { title: { contains: search, mode: 'insensitive' } } }
            ];
        }

        const [total, items] = await Promise.all([
            prisma.dispute.count({ where }),
            prisma.dispute.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    contract: { select: { id: true, title: true } },
                    complainant: { select: { id: true, fullName: true, email: true } },
                    respondent: { select: { id: true, fullName: true, email: true } }
                }
            })
        ]);

        return res.json(formatListResponse(items, total, page, limit));
    } catch (error) {
        console.error('Failed to fetch admin disputes:', error);
        return res.status(500).json({ message: 'Failed to fetch disputes' });
    }
};

export const updateAdminDisputeStatus = async (req: AuthRequest, res: Response) => {
    try {
        const disputeId = Number(req.params.id);
        if (!Number.isFinite(disputeId) || disputeId <= 0) {
            return res.status(400).json({ message: 'Invalid dispute id' });
        }

        const status = parseEnum(req.body?.status, DISPUTE_STATUS_VALUES);
        if (!status) {
            return res.status(400).json({ message: `Invalid status. Allowed: ${DISPUTE_STATUS_VALUES.join(', ')}` });
        }

        const resolution = String(req.body?.resolution || '').trim();

        const updated = await prisma.dispute.update({
            where: { id: disputeId },
            data: {
                status,
                resolution: resolution || null
            }
        });

        return res.json(updated);
    } catch (error) {
        console.error('Failed to update dispute status:', error);
        return res.status(500).json({ message: 'Failed to update dispute status' });
    }
};

export const getAdminReviews = async (req: AuthRequest, res: Response) => {
    try {
        const { page, limit, skip } = parsePagination(req);
        const search = normalizeSearch(req.query.search);

        const where: any = {};
        if (search) {
            where.OR = [
                { comment: { contains: search, mode: 'insensitive' } },
                { reviewer: { fullName: { contains: search, mode: 'insensitive' } } },
                { reviewee: { fullName: { contains: search, mode: 'insensitive' } } }
            ];
        }

        const [total, items] = await Promise.all([
            prisma.review.count({ where }),
            prisma.review.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    reviewer: { select: { id: true, fullName: true, email: true } },
                    reviewee: { select: { id: true, fullName: true, email: true } },
                    contract: { select: { id: true, title: true } }
                }
            })
        ]);

        return res.json(formatListResponse(items, total, page, limit));
    } catch (error) {
        console.error('Failed to fetch admin reviews:', error);
        return res.status(500).json({ message: 'Failed to fetch reviews' });
    }
};
