import { ApplicationStatus, ContractStatus, JobStatus, Prisma, Role } from '@prisma/client';
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

const toNullableString = (value: unknown) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text ? text : null;
};

const toOptionalInt = (value: unknown) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
};

const toOptionalFloat = (value: unknown) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const toOptionalBoolean = (value: unknown) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return undefined;
};

const toOptionalDate = (value: unknown) => {
    if (value === undefined || value === null || value === '') return undefined;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return undefined;
    return date;
};

const toStringArray = (value: unknown) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) {
        return value
            .map((item) => String(item || '').trim())
            .filter(Boolean);
    }
    return String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

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
                    address: true,
                    description: true,
                    role: true,
                    dob: true,
                    gender: true,
                    nidNumber: true,
                    maritalStatus: true,
                    childrenCount: true,
                    country: true,
                    provinceDistrict: true,
                    sectorCellVillage: true,
                    willingToRelocate: true,
                    yearsExperience: true,
                    prevEmployer: true,
                    prevEmployerContact: true,
                    workTypes: true,
                    reasonForLeaving: true,
                    highestEducation: true,
                    languages: true,
                    specialSkills: true,
                    drivingLicense: true,
                    availabilityType: true,
                    startDate: true,
                    preferredHours: true,
                    expectedSalary: true,
                    salaryNegotiable: true,
                    emergencyName: true,
                    emergencyRelation: true,
                    emergencyPhone: true,
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

export const getAdminPaymentsOverview = async (req: AuthRequest, res: Response) => {
    try {
        const months = parsePositiveInt(req.query.months, 6, 24);
        const now = new Date();
        const startWindow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1, 0, 0, 0, 0));

        const payments = await prisma.payment.findMany({
            where: {
                createdAt: { gte: startWindow }
            },
            select: {
                amount: true,
                status: true,
                createdAt: true
            },
            orderBy: { createdAt: 'asc' }
        });

        const trendMap: Record<string, { volume: number; transactions: number }> = {};
        const monthLabels: string[] = [];

        for (let i = months - 1; i >= 0; i -= 1) {
            const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1, 0, 0, 0, 0));
            const label = monthDate.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
            monthLabels.push(label);
            trendMap[label] = { volume: 0, transactions: 0 };
        }

        let successful = 0;
        let pending = 0;
        let failed = 0;
        let totalVolume = 0;

        for (const payment of payments) {
            const paymentDate = new Date(payment.createdAt);
            if (Number.isNaN(paymentDate.getTime())) continue;

            const label = paymentDate.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
            if (!trendMap[label]) continue;

            const amount = Number(payment.amount || 0);
            trendMap[label].volume += amount;
            trendMap[label].transactions += 1;
            totalVolume += amount;

            const normalizedStatus = String(payment.status || '').trim().toUpperCase();
            if (normalizedStatus === 'SUCCESSFUL') successful += 1;
            else if (normalizedStatus === 'PENDING') pending += 1;
            else if (normalizedStatus === 'FAILED') failed += 1;
        }

        const trendData = monthLabels.map((label) => ({
            label,
            volume: Number(trendMap[label].volume.toFixed(2)),
            transactions: trendMap[label].transactions
        }));

        return res.json({
            months,
            generatedAt: now.toISOString(),
            trendData,
            summary: {
                transactions: payments.length,
                totalVolume: Number(totalVolume.toFixed(2)),
                successful,
                pending,
                failed
            }
        });
    } catch (error) {
        console.error('Failed to fetch admin payments overview:', error);
        return res.status(500).json({ message: 'Failed to fetch payments overview' });
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

// CREATE OPERATIONS
export const createAdminUser = async (req: AuthRequest, res: Response) => {
    try {
        const {
            email, password, fullName, phone, role, address, description,
            dob, gender, nidNumber, maritalStatus, childrenCount,
            country, provinceDistrict, sectorCellVillage, willingToRelocate,
            yearsExperience, prevEmployer, prevEmployerContact, workTypes,
            reasonForLeaving, highestEducation, languages, specialSkills,
            drivingLicense, availabilityType, startDate, preferredHours,
            expectedSalary, salaryNegotiable, emergencyName, emergencyRelation, emergencyPhone
        } = req.body;

        if (!email || !password || !fullName) {
            return res.status(400).json({ message: 'Email, password, and fullName are required' });
        }

        const normalizedEmail = String(email).trim().toLowerCase();

        const existing = await prisma.user.findFirst({
            where: { email: { equals: normalizedEmail, mode: 'insensitive' } }
        });

        if (existing) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        const userRole = parseEnum(role, ROLE_VALUES) || Role.EMPLOYER;
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email: normalizedEmail,
                password: hashedPassword,
                fullName: toNullableString(fullName),
                phone: toNullableString(phone),
                address: toNullableString(address),
                description: toNullableString(description),
                role: userRole,
                dob: toOptionalDate(dob),
                gender: toNullableString(gender),
                nidNumber: toNullableString(nidNumber),
                maritalStatus: toNullableString(maritalStatus),
                childrenCount: toOptionalInt(childrenCount),
                country: toNullableString(country),
                provinceDistrict: toNullableString(provinceDistrict),
                sectorCellVillage: toNullableString(sectorCellVillage),
                willingToRelocate: toOptionalBoolean(willingToRelocate),
                yearsExperience: toOptionalInt(yearsExperience),
                prevEmployer: toNullableString(prevEmployer),
                prevEmployerContact: toNullableString(prevEmployerContact),
                workTypes: toStringArray(workTypes),
                reasonForLeaving: toNullableString(reasonForLeaving),
                highestEducation: toNullableString(highestEducation),
                languages: toNullableString(languages),
                specialSkills: toStringArray(specialSkills),
                drivingLicense: toOptionalBoolean(drivingLicense),
                availabilityType: toNullableString(availabilityType),
                startDate: toOptionalDate(startDate),
                preferredHours: toNullableString(preferredHours),
                expectedSalary: toOptionalFloat(expectedSalary),
                salaryNegotiable: toOptionalBoolean(salaryNegotiable),
                emergencyName: toNullableString(emergencyName),
                emergencyRelation: toNullableString(emergencyRelation),
                emergencyPhone: toNullableString(emergencyPhone)
            }
        });

        return res.status(201).json({
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            phone: user.phone,
            role: user.role,
            createdAt: user.createdAt
        });
    } catch (error) {
        console.error('Failed to create user:', error);
        return res.status(500).json({ message: 'Failed to create user' });
    }
};

export const updateAdminUser = async (req: AuthRequest, res: Response) => {
    try {
        const targetUserId = Number(req.params.id);
        if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ message: 'Invalid user id' });
        }

        const {
            email, password, fullName, phone, role, address, description,
            dob, gender, nidNumber, maritalStatus, childrenCount,
            country, provinceDistrict, sectorCellVillage, willingToRelocate,
            yearsExperience, prevEmployer, prevEmployerContact, workTypes,
            reasonForLeaving, highestEducation, languages, specialSkills,
            drivingLicense, availabilityType, startDate, preferredHours,
            expectedSalary, salaryNegotiable, emergencyName, emergencyRelation, emergencyPhone
        } = req.body || {};

        const target = await prisma.user.findUnique({ where: { id: targetUserId } });
        if (!target) {
            return res.status(404).json({ message: 'User not found' });
        }

        const roleValue = role !== undefined ? parseEnum(role, ROLE_VALUES) : null;
        if (role !== undefined && !roleValue) {
            return res.status(400).json({ message: `Invalid role. Allowed: ${ROLE_VALUES.join(', ')}` });
        }

        let normalizedEmail: string | undefined;
        if (email !== undefined) {
            normalizedEmail = String(email).trim().toLowerCase();
            if (!normalizedEmail) {
                return res.status(400).json({ message: 'Email cannot be empty' });
            }
            if (normalizedEmail !== target.email.toLowerCase()) {
                const existing = await prisma.user.findFirst({
                    where: { email: { equals: normalizedEmail, mode: 'insensitive' } }
                });
                if (existing) {
                    return res.status(400).json({ message: 'Email already exists' });
                }
            }
        }

        let hashedPassword: string | undefined;
        if (password !== undefined && String(password).trim()) {
            const bcrypt = require('bcryptjs');
            hashedPassword = await bcrypt.hash(String(password), 10);
        }

        const updated = await prisma.user.update({
            where: { id: targetUserId },
            data: {
                email: normalizedEmail,
                password: hashedPassword,
                fullName: fullName !== undefined ? toNullableString(fullName) : undefined,
                phone: phone !== undefined ? toNullableString(phone) : undefined,
                address: address !== undefined ? toNullableString(address) : undefined,
                description: description !== undefined ? toNullableString(description) : undefined,
                role: roleValue || undefined,
                dob: dob !== undefined ? toOptionalDate(dob) : undefined,
                gender: gender !== undefined ? toNullableString(gender) : undefined,
                nidNumber: nidNumber !== undefined ? toNullableString(nidNumber) : undefined,
                maritalStatus: maritalStatus !== undefined ? toNullableString(maritalStatus) : undefined,
                childrenCount: childrenCount !== undefined ? toOptionalInt(childrenCount) : undefined,
                country: country !== undefined ? toNullableString(country) : undefined,
                provinceDistrict: provinceDistrict !== undefined ? toNullableString(provinceDistrict) : undefined,
                sectorCellVillage: sectorCellVillage !== undefined ? toNullableString(sectorCellVillage) : undefined,
                willingToRelocate: willingToRelocate !== undefined ? toOptionalBoolean(willingToRelocate) : undefined,
                yearsExperience: yearsExperience !== undefined ? toOptionalInt(yearsExperience) : undefined,
                prevEmployer: prevEmployer !== undefined ? toNullableString(prevEmployer) : undefined,
                prevEmployerContact: prevEmployerContact !== undefined ? toNullableString(prevEmployerContact) : undefined,
                workTypes: workTypes !== undefined ? toStringArray(workTypes) : undefined,
                reasonForLeaving: reasonForLeaving !== undefined ? toNullableString(reasonForLeaving) : undefined,
                highestEducation: highestEducation !== undefined ? toNullableString(highestEducation) : undefined,
                languages: languages !== undefined ? toNullableString(languages) : undefined,
                specialSkills: specialSkills !== undefined ? toStringArray(specialSkills) : undefined,
                drivingLicense: drivingLicense !== undefined ? toOptionalBoolean(drivingLicense) : undefined,
                availabilityType: availabilityType !== undefined ? toNullableString(availabilityType) : undefined,
                startDate: startDate !== undefined ? toOptionalDate(startDate) : undefined,
                preferredHours: preferredHours !== undefined ? toNullableString(preferredHours) : undefined,
                expectedSalary: expectedSalary !== undefined ? toOptionalFloat(expectedSalary) : undefined,
                salaryNegotiable: salaryNegotiable !== undefined ? toOptionalBoolean(salaryNegotiable) : undefined,
                emergencyName: emergencyName !== undefined ? toNullableString(emergencyName) : undefined,
                emergencyRelation: emergencyRelation !== undefined ? toNullableString(emergencyRelation) : undefined,
                emergencyPhone: emergencyPhone !== undefined ? toNullableString(emergencyPhone) : undefined
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
                address: true,
                role: true,
                createdAt: true,
                updatedAt: true
            }
        });

        return res.json(updated);
    } catch (error) {
        console.error('Failed to update user:', error);
        return res.status(500).json({ message: 'Failed to update user' });
    }
};

export const deleteAdminUser = async (req: AuthRequest, res: Response) => {
    try {
        const targetUserId = Number(req.params.id);
        if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ message: 'Invalid user id' });
        }

        const actingUserId = Number(req.user?.userId || 0);
        if (actingUserId === targetUserId) {
            return res.status(400).json({ message: 'You cannot delete your own admin account while logged in' });
        }

        const userExists = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
        if (!userExists) {
            return res.status(404).json({ message: 'User not found' });
        }

        await prisma.$transaction(async (tx) => {
            const [jobs, contracts, conversations] = await Promise.all([
                tx.job.findMany({
                    where: { employerId: targetUserId },
                    select: { id: true }
                }),
                tx.contract.findMany({
                    where: {
                        OR: [{ employerId: targetUserId }, { maidId: targetUserId }]
                    },
                    select: { id: true }
                }),
                tx.conversation.findMany({
                    where: { participants: { some: { id: targetUserId } } },
                    select: { id: true }
                })
            ]);

            const jobIds = jobs.map((job) => job.id);
            const contractIds = contracts.map((contract) => contract.id);

            if (jobIds.length > 0) {
                await tx.application.deleteMany({
                    where: { jobId: { in: jobIds } }
                });
            }

            await tx.application.deleteMany({
                where: { maidId: targetUserId }
            });

            if (contractIds.length > 0) {
                await tx.review.deleteMany({
                    where: { contractId: { in: contractIds } }
                });
                await tx.dispute.deleteMany({
                    where: { contractId: { in: contractIds } }
                });
            }

            await tx.review.deleteMany({
                where: {
                    OR: [{ reviewerId: targetUserId }, { revieweeId: targetUserId }]
                }
            });

            await tx.dispute.deleteMany({
                where: {
                    OR: [{ complainantId: targetUserId }, { respondentId: targetUserId }]
                }
            });

            await tx.unlockedProfile.deleteMany({
                where: {
                    OR: [{ employerId: targetUserId }, { maidId: targetUserId }]
                }
            });

            await tx.payment.deleteMany({
                where: { employerId: targetUserId }
            });

            await tx.notification.deleteMany({
                where: { userId: targetUserId }
            });

            await tx.message.deleteMany({
                where: { senderId: targetUserId }
            });

            for (const conversation of conversations) {
                await tx.conversation.update({
                    where: { id: conversation.id },
                    data: {
                        participants: {
                            disconnect: { id: targetUserId }
                        }
                    }
                });
            }

            if (contractIds.length > 0) {
                await tx.contract.deleteMany({
                    where: { id: { in: contractIds } }
                });
            }

            if (jobIds.length > 0) {
                await tx.job.deleteMany({
                    where: { id: { in: jobIds } }
                });
            }

            await tx.user.delete({ where: { id: targetUserId } });
        });

        return res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Failed to delete user:', error);

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2003') {
                return res.status(409).json({ message: 'User cannot be deleted due to existing related records' });
            }
            if (error.code === 'P2025') {
                return res.status(404).json({ message: 'User not found' });
            }
        }

        return res.status(500).json({ message: 'Failed to delete user' });
    }
};

export const createAdminJob = async (req: AuthRequest, res: Response) => {
    try {
        const { title, description, location, salaryMin, salaryMax, employerId, requirements } = req.body;

        if (!title || !location || !employerId) {
            return res.status(400).json({ message: 'Title, location, and employerId are required' });
        }

        const job = await prisma.job.create({
            data: {
                title,
                description: description || '',
                requirements: requirements || null,
                location,
                salaryMin: salaryMin ? Number(salaryMin) : null,
                salaryMax: salaryMax ? Number(salaryMax) : null,
                employerId: Number(employerId),
                status: JobStatus.OPEN
            },
            include: {
                employer: { select: { id: true, fullName: true, email: true } }
            }
        });

        return res.status(201).json(job);
    } catch (error) {
        console.error('Failed to create job:', error);
        return res.status(500).json({ message: 'Failed to create job' });
    }
};

export const deleteAdminJob = async (req: AuthRequest, res: Response) => {
    try {
        const jobId = Number(req.params.id);
        if (!Number.isFinite(jobId) || jobId <= 0) {
            return res.status(400).json({ message: 'Invalid job id' });
        }

        const jobExists = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
        if (!jobExists) {
            return res.status(404).json({ message: 'Job not found' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.application.deleteMany({ where: { jobId } });
            await tx.job.delete({ where: { id: jobId } });
        });

        return res.json({ message: 'Job deleted successfully' });
    } catch (error) {
        console.error('Failed to delete job:', error);

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2003') {
                return res.status(409).json({ message: 'Job cannot be deleted due to existing related records' });
            }
            if (error.code === 'P2025') {
                return res.status(404).json({ message: 'Job not found' });
            }
        }

        return res.status(500).json({ message: 'Failed to delete job' });
    }
};

export const deleteAdminApplication = async (req: AuthRequest, res: Response) => {
    try {
        const applicationId = Number(req.params.id);
        if (!Number.isFinite(applicationId) || applicationId <= 0) {
            return res.status(400).json({ message: 'Invalid application id' });
        }

        const exists = await prisma.application.findUnique({ where: { id: applicationId }, select: { id: true } });
        if (!exists) {
            return res.status(404).json({ message: 'Application not found' });
        }

        await prisma.application.delete({ where: { id: applicationId } });

        return res.json({ message: 'Application deleted successfully' });
    } catch (error) {
        console.error('Failed to delete application:', error);

        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            return res.status(404).json({ message: 'Application not found' });
        }

        return res.status(500).json({ message: 'Failed to delete application' });
    }
};

export const createAdminContract = async (req: AuthRequest, res: Response) => {
    try {
        const { title, description, employerId, maidId, salary, startDate, endDate, terms } = req.body;

        if (!title || !employerId || !maidId || !salary || !startDate) {
            return res.status(400).json({ message: 'Title, employerId, maidId, salary, and startDate are required' });
        }

        const contract = await prisma.contract.create({
            data: {
                title,
                description: description || null,
                employerId: Number(employerId),
                maidId: Number(maidId),
                salary: Number(salary),
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : null,
                terms: terms || null,
                status: ContractStatus.DRAFT
            },
            include: {
                employer: { select: { id: true, fullName: true, email: true } },
                maid: { select: { id: true, fullName: true, email: true } }
            }
        });

        return res.status(201).json(contract);
    } catch (error) {
        console.error('Failed to create contract:', error);
        return res.status(500).json({ message: 'Failed to create contract' });
    }
};

export const deleteAdminContract = async (req: AuthRequest, res: Response) => {
    try {
        const contractId = Number(req.params.id);
        if (!Number.isFinite(contractId) || contractId <= 0) {
            return res.status(400).json({ message: 'Invalid contract id' });
        }

        await prisma.contract.delete({ where: { id: contractId } });

        return res.json({ message: 'Contract deleted successfully' });
    } catch (error) {
        console.error('Failed to delete contract:', error);
        return res.status(500).json({ message: 'Failed to delete contract' });
    }
};

export const deleteAdminPayment = async (req: AuthRequest, res: Response) => {
    try {
        const paymentId = Number(req.params.id);
        if (!Number.isFinite(paymentId) || paymentId <= 0) {
            return res.status(400).json({ message: 'Invalid payment id' });
        }

        const exists = await prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true } });
        if (!exists) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        await prisma.payment.delete({ where: { id: paymentId } });

        return res.json({ message: 'Payment deleted successfully' });
    } catch (error) {
        console.error('Failed to delete payment:', error);

        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            return res.status(404).json({ message: 'Payment not found' });
        }

        return res.status(500).json({ message: 'Failed to delete payment' });
    }
};

export const deleteAdminDispute = async (req: AuthRequest, res: Response) => {
    try {
        const disputeId = Number(req.params.id);
        if (!Number.isFinite(disputeId) || disputeId <= 0) {
            return res.status(400).json({ message: 'Invalid dispute id' });
        }

        await prisma.dispute.delete({ where: { id: disputeId } });

        return res.json({ message: 'Dispute deleted successfully' });
    } catch (error) {
        console.error('Failed to delete dispute:', error);
        return res.status(500).json({ message: 'Failed to delete dispute' });
    }
};

export const deleteAdminReview = async (req: AuthRequest, res: Response) => {
    try {
        const reviewId = Number(req.params.id);
        if (!Number.isFinite(reviewId) || reviewId <= 0) {
            return res.status(400).json({ message: 'Invalid review id' });
        }

        await prisma.review.delete({ where: { id: reviewId } });

        return res.json({ message: 'Review deleted successfully' });
    } catch (error) {
        console.error('Failed to delete review:', error);
        return res.status(500).json({ message: 'Failed to delete review' });
    }
};
