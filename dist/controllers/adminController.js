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
exports.getAdminReviews = exports.updateAdminDisputeStatus = exports.getAdminDisputes = exports.getAdminPayments = exports.updateAdminContractStatus = exports.getAdminContracts = exports.updateAdminApplicationStatus = exports.getAdminApplications = exports.updateAdminJobStatus = exports.getAdminJobs = exports.updateAdminUserRole = exports.getAdminUsers = exports.getAdminOverview = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../utils/prisma"));
const ROLE_VALUES = Object.values(client_1.Role);
const JOB_STATUS_VALUES = Object.values(client_1.JobStatus);
const APPLICATION_STATUS_VALUES = Object.values(client_1.ApplicationStatus);
const CONTRACT_STATUS_VALUES = Object.values(client_1.ContractStatus);
const DISPUTE_STATUS_VALUES = ['OPEN', 'RESOLVED', 'CLOSED'];
const getQueryValue = (value) => {
    if (Array.isArray(value))
        return value[0];
    return value;
};
const parsePositiveInt = (value, fallback, max = 100) => {
    const parsed = Number(getQueryValue(value));
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return Math.min(Math.floor(parsed), max);
};
const parsePagination = (req) => {
    const page = parsePositiveInt(req.query.page, 1, 10000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    return {
        page,
        limit,
        skip: (page - 1) * limit
    };
};
const parseEnum = (value, allowed) => {
    const normalized = String(getQueryValue(value) || '').trim().toUpperCase();
    return allowed.includes(normalized) ? normalized : null;
};
const normalizeSearch = (value) => String(getQueryValue(value) || '').trim();
const formatListResponse = (items, total, page, limit) => ({
    items,
    pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
    }
});
const getAdminOverview = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [usersCount, employersCount, maidsCount, adminsCount, jobsCount, openJobsCount, applicationsCount, contractsCount, activeContractsCount, disputesCount, openDisputesCount, reviewsCount, paymentsCount, successfulPaymentsCount, unreadNotificationsCount, paymentSum, recentUsers, recentJobs, recentApplications, recentContracts, recentPayments, recentDisputes] = yield Promise.all([
            prisma_1.default.user.count(),
            prisma_1.default.user.count({ where: { role: client_1.Role.EMPLOYER } }),
            prisma_1.default.user.count({ where: { role: client_1.Role.MAID } }),
            prisma_1.default.user.count({ where: { role: client_1.Role.ADMIN } }),
            prisma_1.default.job.count(),
            prisma_1.default.job.count({ where: { status: client_1.JobStatus.OPEN } }),
            prisma_1.default.application.count(),
            prisma_1.default.contract.count(),
            prisma_1.default.contract.count({ where: { status: client_1.ContractStatus.ACTIVE } }),
            prisma_1.default.dispute.count(),
            prisma_1.default.dispute.count({ where: { status: 'OPEN' } }),
            prisma_1.default.review.count(),
            prisma_1.default.payment.count(),
            prisma_1.default.payment.count({ where: { status: 'SUCCESSFUL' } }),
            prisma_1.default.notification.count({ where: { read: false } }),
            prisma_1.default.payment.aggregate({ _sum: { amount: true } }),
            prisma_1.default.user.findMany({
                orderBy: { createdAt: 'desc' },
                take: 8,
                select: { id: true, fullName: true, role: true, createdAt: true }
            }),
            prisma_1.default.job.findMany({
                orderBy: { createdAt: 'desc' },
                take: 8,
                include: { employer: { select: { fullName: true } } }
            }),
            prisma_1.default.application.findMany({
                orderBy: { createdAt: 'desc' },
                take: 8,
                include: {
                    maid: { select: { fullName: true } },
                    job: { select: { title: true } }
                }
            }),
            prisma_1.default.contract.findMany({
                orderBy: { createdAt: 'desc' },
                take: 8,
                include: {
                    employer: { select: { fullName: true } },
                    maid: { select: { fullName: true } }
                }
            }),
            prisma_1.default.payment.findMany({
                orderBy: { createdAt: 'desc' },
                take: 8,
                include: { employer: { select: { fullName: true } } }
            }),
            prisma_1.default.dispute.findMany({
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
    }
    catch (error) {
        console.error('Failed to fetch admin overview:', error);
        return res.status(500).json({ message: 'Failed to fetch admin overview' });
    }
});
exports.getAdminOverview = getAdminOverview;
const getAdminUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page, limit, skip } = parsePagination(req);
        const role = parseEnum(req.query.role, ROLE_VALUES);
        const search = normalizeSearch(req.query.search);
        const where = {};
        if (role)
            where.role = role;
        if (search) {
            where.OR = [
                { fullName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } }
            ];
        }
        const [total, items] = yield Promise.all([
            prisma_1.default.user.count({ where }),
            prisma_1.default.user.findMany({
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
    }
    catch (error) {
        console.error('Failed to fetch admin users:', error);
        return res.status(500).json({ message: 'Failed to fetch users' });
    }
});
exports.getAdminUsers = getAdminUsers;
const updateAdminUserRole = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const targetUserId = Number(req.params.id);
        if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ message: 'Invalid user id' });
        }
        const role = parseEnum((_a = req.body) === null || _a === void 0 ? void 0 : _a.role, ROLE_VALUES);
        if (!role) {
            return res.status(400).json({ message: `Invalid role. Allowed: ${ROLE_VALUES.join(', ')}` });
        }
        const updated = yield prisma_1.default.user.update({
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
    }
    catch (error) {
        console.error('Failed to update user role:', error);
        return res.status(500).json({ message: 'Failed to update user role' });
    }
});
exports.updateAdminUserRole = updateAdminUserRole;
const getAdminJobs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page, limit, skip } = parsePagination(req);
        const status = parseEnum(req.query.status, JOB_STATUS_VALUES);
        const search = normalizeSearch(req.query.search);
        const where = {};
        if (status)
            where.status = status;
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { location: { contains: search, mode: 'insensitive' } },
                { employer: { fullName: { contains: search, mode: 'insensitive' } } }
            ];
        }
        const [total, items] = yield Promise.all([
            prisma_1.default.job.count({ where }),
            prisma_1.default.job.findMany({
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
    }
    catch (error) {
        console.error('Failed to fetch admin jobs:', error);
        return res.status(500).json({ message: 'Failed to fetch jobs' });
    }
});
exports.getAdminJobs = getAdminJobs;
const updateAdminJobStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const jobId = Number(req.params.id);
        if (!Number.isFinite(jobId) || jobId <= 0) {
            return res.status(400).json({ message: 'Invalid job id' });
        }
        const status = parseEnum((_a = req.body) === null || _a === void 0 ? void 0 : _a.status, JOB_STATUS_VALUES);
        if (!status) {
            return res.status(400).json({ message: `Invalid status. Allowed: ${JOB_STATUS_VALUES.join(', ')}` });
        }
        const updated = yield prisma_1.default.job.update({
            where: { id: jobId },
            data: { status }
        });
        return res.json(updated);
    }
    catch (error) {
        console.error('Failed to update job status:', error);
        return res.status(500).json({ message: 'Failed to update job status' });
    }
});
exports.updateAdminJobStatus = updateAdminJobStatus;
const getAdminApplications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page, limit, skip } = parsePagination(req);
        const status = parseEnum(req.query.status, APPLICATION_STATUS_VALUES);
        const search = normalizeSearch(req.query.search);
        const where = {};
        if (status)
            where.status = status;
        if (search) {
            where.OR = [
                { job: { title: { contains: search, mode: 'insensitive' } } },
                { maid: { fullName: { contains: search, mode: 'insensitive' } } }
            ];
        }
        const [total, items] = yield Promise.all([
            prisma_1.default.application.count({ where }),
            prisma_1.default.application.findMany({
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
    }
    catch (error) {
        console.error('Failed to fetch admin applications:', error);
        return res.status(500).json({ message: 'Failed to fetch applications' });
    }
});
exports.getAdminApplications = getAdminApplications;
const updateAdminApplicationStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const applicationId = Number(req.params.id);
        if (!Number.isFinite(applicationId) || applicationId <= 0) {
            return res.status(400).json({ message: 'Invalid application id' });
        }
        const status = parseEnum((_a = req.body) === null || _a === void 0 ? void 0 : _a.status, APPLICATION_STATUS_VALUES);
        if (!status) {
            return res.status(400).json({ message: `Invalid status. Allowed: ${APPLICATION_STATUS_VALUES.join(', ')}` });
        }
        const updated = yield prisma_1.default.application.update({
            where: { id: applicationId },
            data: { status }
        });
        return res.json(updated);
    }
    catch (error) {
        console.error('Failed to update application status:', error);
        return res.status(500).json({ message: 'Failed to update application status' });
    }
});
exports.updateAdminApplicationStatus = updateAdminApplicationStatus;
const getAdminContracts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page, limit, skip } = parsePagination(req);
        const status = parseEnum(req.query.status, CONTRACT_STATUS_VALUES);
        const search = normalizeSearch(req.query.search);
        const where = {};
        if (status)
            where.status = status;
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { employer: { fullName: { contains: search, mode: 'insensitive' } } },
                { maid: { fullName: { contains: search, mode: 'insensitive' } } }
            ];
        }
        const [total, items] = yield Promise.all([
            prisma_1.default.contract.count({ where }),
            prisma_1.default.contract.findMany({
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
    }
    catch (error) {
        console.error('Failed to fetch admin contracts:', error);
        return res.status(500).json({ message: 'Failed to fetch contracts' });
    }
});
exports.getAdminContracts = getAdminContracts;
const updateAdminContractStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const contractId = Number(req.params.id);
        if (!Number.isFinite(contractId) || contractId <= 0) {
            return res.status(400).json({ message: 'Invalid contract id' });
        }
        const status = parseEnum((_a = req.body) === null || _a === void 0 ? void 0 : _a.status, CONTRACT_STATUS_VALUES);
        if (!status) {
            return res.status(400).json({ message: `Invalid status. Allowed: ${CONTRACT_STATUS_VALUES.join(', ')}` });
        }
        const updated = yield prisma_1.default.contract.update({
            where: { id: contractId },
            data: { status }
        });
        return res.json(updated);
    }
    catch (error) {
        console.error('Failed to update contract status:', error);
        return res.status(500).json({ message: 'Failed to update contract status' });
    }
});
exports.updateAdminContractStatus = updateAdminContractStatus;
const getAdminPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page, limit, skip } = parsePagination(req);
        const search = normalizeSearch(req.query.search);
        const status = String(getQueryValue(req.query.status) || '').trim();
        const type = String(getQueryValue(req.query.type) || '').trim();
        const where = {};
        if (status)
            where.status = status.toUpperCase();
        if (type)
            where.type = type.toUpperCase();
        if (search) {
            where.OR = [
                { transactionId: { contains: search, mode: 'insensitive' } },
                { employer: { fullName: { contains: search, mode: 'insensitive' } } }
            ];
        }
        const [total, items] = yield Promise.all([
            prisma_1.default.payment.count({ where }),
            prisma_1.default.payment.findMany({
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
    }
    catch (error) {
        console.error('Failed to fetch admin payments:', error);
        return res.status(500).json({ message: 'Failed to fetch payments' });
    }
});
exports.getAdminPayments = getAdminPayments;
const getAdminDisputes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page, limit, skip } = parsePagination(req);
        const status = parseEnum(req.query.status, DISPUTE_STATUS_VALUES);
        const search = normalizeSearch(req.query.search);
        const where = {};
        if (status)
            where.status = status;
        if (search) {
            where.OR = [
                { reason: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { contract: { title: { contains: search, mode: 'insensitive' } } }
            ];
        }
        const [total, items] = yield Promise.all([
            prisma_1.default.dispute.count({ where }),
            prisma_1.default.dispute.findMany({
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
    }
    catch (error) {
        console.error('Failed to fetch admin disputes:', error);
        return res.status(500).json({ message: 'Failed to fetch disputes' });
    }
});
exports.getAdminDisputes = getAdminDisputes;
const updateAdminDisputeStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const disputeId = Number(req.params.id);
        if (!Number.isFinite(disputeId) || disputeId <= 0) {
            return res.status(400).json({ message: 'Invalid dispute id' });
        }
        const status = parseEnum((_a = req.body) === null || _a === void 0 ? void 0 : _a.status, DISPUTE_STATUS_VALUES);
        if (!status) {
            return res.status(400).json({ message: `Invalid status. Allowed: ${DISPUTE_STATUS_VALUES.join(', ')}` });
        }
        const resolution = String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.resolution) || '').trim();
        const updated = yield prisma_1.default.dispute.update({
            where: { id: disputeId },
            data: {
                status,
                resolution: resolution || null
            }
        });
        return res.json(updated);
    }
    catch (error) {
        console.error('Failed to update dispute status:', error);
        return res.status(500).json({ message: 'Failed to update dispute status' });
    }
});
exports.updateAdminDisputeStatus = updateAdminDisputeStatus;
const getAdminReviews = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page, limit, skip } = parsePagination(req);
        const search = normalizeSearch(req.query.search);
        const where = {};
        if (search) {
            where.OR = [
                { comment: { contains: search, mode: 'insensitive' } },
                { reviewer: { fullName: { contains: search, mode: 'insensitive' } } },
                { reviewee: { fullName: { contains: search, mode: 'insensitive' } } }
            ];
        }
        const [total, items] = yield Promise.all([
            prisma_1.default.review.count({ where }),
            prisma_1.default.review.findMany({
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
    }
    catch (error) {
        console.error('Failed to fetch admin reviews:', error);
        return res.status(500).json({ message: 'Failed to fetch reviews' });
    }
});
exports.getAdminReviews = getAdminReviews;
