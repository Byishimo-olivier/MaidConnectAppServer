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
exports.getMaidApplications = exports.getApplicationById = exports.getEmployerApplications = exports.updateApplicationStatus = exports.applyForJob = exports.updateMyJobStatus = exports.getMyJobs = exports.getJobs = exports.createJob = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const notificationController_1 = require("./notificationController");
const emailService_1 = require("../utils/emailService");
const JOB_POST_FEE_PERCENTAGE_RAW = Number(process.env.JOB_POST_FEE_PERCENTAGE || '0.1');
const JOB_POST_FEE_PERCENTAGE = Number.isFinite(JOB_POST_FEE_PERCENTAGE_RAW) && JOB_POST_FEE_PERCENTAGE_RAW > 0
    ? JOB_POST_FEE_PERCENTAGE_RAW
    : 0.1;
const SUCCESS_PAYMENT_STATUSES = new Set(['SUCCESSFUL', 'SUCCESS', 'COMPLETED']);
const PAYMENT_READY_TYPE = 'JOB_POSTING';
const PAYMENT_CONSUMED_TYPE = 'JOB_POSTING_USED';
const APPLICATION_STATUS_VALUES = new Set(['PENDING', 'INTERVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']);
const sanitizeSalary = (value) => {
    if (value === null || value === undefined || value === '')
        return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return null;
    return parsed;
};
const calculateJobPostingFee = (salaryMax) => Math.ceil(salaryMax * JOB_POST_FEE_PERCENTAGE);
const createJob = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { title, description, requirements, location, salaryMin, salaryMax, paymentTransactionId } = req.body;
        const employerId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!employerId)
            return res.status(401).json({ message: 'Unauthorized' });
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
        const payment = yield prisma_1.default.payment.findUnique({ where: { transactionId: txId } });
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
        const job = yield prisma_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const createdJob = yield tx.job.create({
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
            yield tx.payment.update({
                where: { id: payment.id },
                data: { type: PAYMENT_CONSUMED_TYPE }
            });
            return createdJob;
        }));
        // Notify all maids about the new job
        try {
            const employer = yield prisma_1.default.user.findUnique({
                where: { id: employerId },
                select: { fullName: true }
            });
            const maids = yield prisma_1.default.user.findMany({
                where: { role: 'MAID' },
                select: { id: true, email: true, fullName: true }
            });
            const notificationPromises = maids.map(maid => (0, notificationController_1.createNotification)(maid.id, 'New Job Alert 🔔', `New job: "${title}" is now available in ${location}!`, 'SYSTEM'));
            const emailPromises = maids.map((maid) => {
                if (!maid.email)
                    return Promise.resolve(false);
                return (0, emailService_1.sendNewJobAlertEmail)({
                    to: maid.email,
                    maidName: maid.fullName,
                    employerName: (employer === null || employer === void 0 ? void 0 : employer.fullName) || null,
                    jobTitle: String(title),
                    location: String(location),
                    salaryMin: parsedSalaryMin,
                    salaryMax: parsedSalaryMax
                });
            });
            yield Promise.all([...notificationPromises, ...emailPromises]);
        }
        catch (notifyError) {
            console.error('Failed to send job notifications to maids:', notifyError);
            // We don't want to fail the job creation if notifications fail
        }
        res.status(201).json(job);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create job' });
    }
});
exports.createJob = createJob;
const getJobs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const jobs = yield prisma_1.default.job.findMany({
            where: { status: 'OPEN' },
            include: { employer: { select: { fullName: true, email: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(jobs);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch jobs' });
    }
});
exports.getJobs = getJobs;
const getMyJobs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const jobs = yield prisma_1.default.job.findMany({
            where: { employerId: userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(jobs);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch your jobs' });
    }
});
exports.getMyJobs = getMyJobs;
const updateMyJobStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const employerId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!employerId)
            return res.status(401).json({ message: 'Unauthorized' });
        const jobId = Number(req.params.jobId);
        if (!Number.isInteger(jobId) || jobId <= 0) {
            return res.status(400).json({ message: 'Invalid job id' });
        }
        const requestedStatus = String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.status) || '').trim().toUpperCase();
        if (!['OPEN', 'CLOSED'].includes(requestedStatus)) {
            return res.status(400).json({ message: 'Invalid status. Allowed values: OPEN, CLOSED' });
        }
        const job = yield prisma_1.default.job.findUnique({ where: { id: jobId } });
        if (!job)
            return res.status(404).json({ message: 'Job not found' });
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
            const updated = yield prisma_1.default.job.update({
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
        const transactionId = String(((_c = req.body) === null || _c === void 0 ? void 0 : _c.paymentTransactionId) || '').trim();
        if (!transactionId) {
            return res.status(400).json({ message: 'paymentTransactionId is required to reopen a closed job' });
        }
        const payment = yield prisma_1.default.payment.findUnique({ where: { transactionId } });
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
        const updated = yield prisma_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const reopenedJob = yield tx.job.update({
                where: { id: jobId },
                data: { status: 'OPEN' }
            });
            yield tx.payment.update({
                where: { id: payment.id },
                data: { type: PAYMENT_CONSUMED_TYPE }
            });
            return reopenedJob;
        }));
        return res.json({
            message: 'Job reopened successfully',
            job: updated
        });
    }
    catch (error) {
        console.error('Failed to update job status:', error);
        return res.status(500).json({ message: 'Failed to update job status' });
    }
});
exports.updateMyJobStatus = updateMyJobStatus;
const applyForJob = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const { jobId } = req.params;
        const { coverLetter } = req.body;
        const maidId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const parsedJobId = Number(jobId);
        if (!maidId)
            return res.status(401).json({ message: 'Unauthorized' });
        if (!Number.isInteger(parsedJobId) || parsedJobId <= 0) {
            return res.status(400).json({ message: 'Invalid job id' });
        }
        const targetJob = yield prisma_1.default.job.findUnique({
            where: { id: parsedJobId },
            select: { id: true, status: true }
        });
        if (!targetJob) {
            return res.status(404).json({ message: 'Job not found' });
        }
        if (targetJob.status !== 'OPEN') {
            return res.status(400).json({ message: 'You can only apply to open jobs' });
        }
        const existingApplication = yield prisma_1.default.application.findFirst({
            where: { jobId: parsedJobId, maidId }
        });
        if (existingApplication) {
            return res.status(400).json({ message: 'Already applied' });
        }
        const application = yield prisma_1.default.application.create({
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
        yield (0, notificationController_1.createNotification)(application.job.employerId, 'New Job Application', `${(_b = application.maid) === null || _b === void 0 ? void 0 : _b.fullName} has applied for your job: ${application.job.title}`, 'APPLICATION');
        if ((_c = application.job.employer) === null || _c === void 0 ? void 0 : _c.email) {
            yield (0, emailService_1.sendJobApplicationEmailToEmployer)({
                to: application.job.employer.email,
                employerName: application.job.employer.fullName,
                maidName: (_d = application.maid) === null || _d === void 0 ? void 0 : _d.fullName,
                jobTitle: application.job.title
            });
        }
        res.status(201).json(application);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to apply' });
    }
});
exports.applyForJob = applyForJob;
const updateApplicationStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const applicationId = Number(id);
        const normalizedStatus = String(status || '').trim().toUpperCase();
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        if (!Number.isInteger(applicationId) || applicationId <= 0) {
            return res.status(400).json({ message: 'Invalid application id' });
        }
        if (!APPLICATION_STATUS_VALUES.has(normalizedStatus)) {
            return res.status(400).json({
                message: `Invalid status. Allowed: ${Array.from(APPLICATION_STATUS_VALUES).join(', ')}`
            });
        }
        const existingApplication = yield prisma_1.default.application.findUnique({
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
        const application = yield prisma_1.default.application.update({
            where: { id: applicationId },
            data: { status: normalizedStatus },
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
        yield (0, notificationController_1.createNotification)(application.maidId, maidNotificationTitle, maidNotificationMessage, 'APPLICATION');
        if ((normalizedStatus === 'ACCEPTED' || normalizedStatus === 'REJECTED')
            && ((_b = application.maid) === null || _b === void 0 ? void 0 : _b.email)) {
            yield (0, emailService_1.sendApplicationDecisionEmailToMaid)({
                to: application.maid.email,
                maidName: application.maid.fullName,
                employerName: (_c = application.job.employer) === null || _c === void 0 ? void 0 : _c.fullName,
                jobTitle: application.job.title,
                status: normalizedStatus
            });
        }
        res.json(application);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update application' });
    }
});
exports.updateApplicationStatus = updateApplicationStatus;
const getEmployerApplications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const applications = yield prisma_1.default.application.findMany({
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch applications' });
    }
});
exports.getEmployerApplications = getEmployerApplications;
const getApplicationById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const application = yield prisma_1.default.application.findFirst({
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
        if (!application)
            return res.status(404).json({ message: 'Application not found' });
        // Check if user is the employer of this job
        if (application.job.employerId !== userId) {
            return res.status(403).json({ message: 'Unauthorized to view this application' });
        }
        res.json(application);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch application' });
    }
});
exports.getApplicationById = getApplicationById;
const getMaidApplications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const applications = yield prisma_1.default.application.findMany({
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch your applications' });
    }
});
exports.getMaidApplications = getMaidApplications;
