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
exports.applyForJob = exports.getMyJobs = exports.getJobs = exports.createJob = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const createJob = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { title, description, requirements, location, salaryMin, salaryMax } = req.body;
        const employerId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!employerId)
            return res.status(401).json({ message: 'Unauthorized' });
        const job = yield prisma_1.default.job.create({
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
const applyForJob = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { jobId } = req.params;
        const { coverLetter } = req.body;
        const maidId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!maidId)
            return res.status(401).json({ message: 'Unauthorized' });
        const existingApplication = yield prisma_1.default.application.findFirst({
            where: { jobId: Number(jobId), maidId }
        });
        if (existingApplication) {
            return res.status(400).json({ message: 'Already applied' });
        }
        const application = yield prisma_1.default.application.create({
            data: {
                jobId: Number(jobId),
                maidId,
                coverLetter
            }
        });
        res.status(201).json(application);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to apply' });
    }
});
exports.applyForJob = applyForJob;
