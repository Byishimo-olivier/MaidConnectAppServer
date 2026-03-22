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
exports.getActivityFeed = exports.getMaidProfileById = exports.getMaidProfiles = exports.updateProfile = exports.getMyProfile = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../utils/prisma"));
const getMyProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const user = yield prisma_1.default.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                role: true,
                fullName: true,
                phone: true,
                address: true,
                profileImage: true,
                description: true,
                createdAt: true,
                // New fields
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
                nidPhoto: true,
                insurancePhoto: true,
                emergencyName: true,
                emergencyRelation: true,
                emergencyPhone: true
            }
        });
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        res.json(user);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch profile' });
    }
});
exports.getMyProfile = getMyProfile;
const updateProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const { fullName, phone, address, description, profileImage, dob, gender, nidNumber, maritalStatus, childrenCount, country, provinceDistrict, sectorCellVillage, willingToRelocate, yearsExperience, prevEmployer, prevEmployerContact, workTypes, reasonForLeaving, highestEducation, languages, specialSkills, drivingLicense, availabilityType, startDate, preferredHours, expectedSalary, salaryNegotiable, nidPhoto, insurancePhoto, emergencyName, emergencyRelation, emergencyPhone } = req.body;
        // Normalize languages: UI might send it as an array (from split/trim logic) or a string
        const normalizedLanguages = Array.isArray(languages)
            ? languages.join(', ')
            : languages;
        const user = yield prisma_1.default.user.update({
            where: { id: parseInt(userId) },
            data: {
                fullName, phone, address, description, profileImage,
                dob: dob ? new Date(dob) : undefined,
                gender, nidNumber, maritalStatus,
                childrenCount: childrenCount !== undefined ? parseInt(childrenCount) : undefined,
                country, provinceDistrict, sectorCellVillage, willingToRelocate,
                yearsExperience: yearsExperience !== undefined ? parseInt(yearsExperience) : undefined,
                prevEmployer, prevEmployerContact, workTypes,
                reasonForLeaving, highestEducation,
                languages: normalizedLanguages,
                specialSkills,
                drivingLicense, availabilityType,
                startDate: startDate ? new Date(startDate) : undefined,
                preferredHours,
                expectedSalary: expectedSalary !== undefined ? parseFloat(expectedSalary) : undefined,
                salaryNegotiable, nidPhoto, insurancePhoto,
                emergencyName, emergencyRelation, emergencyPhone
            },
            select: {
                id: true,
                email: true,
                role: true,
                fullName: true,
                phone: true,
                address: true,
                profileImage: true,
                description: true,
                createdAt: true,
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
                nidPhoto: true,
                insurancePhoto: true,
                emergencyName: true,
                emergencyRelation: true,
                emergencyPhone: true
            }
        });
        res.json(user);
    }
    catch (error) {
        console.error('Profile Update Error Detail:', {
            error: error.message,
            code: error.code,
            meta: error.meta,
            userId: (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId
        });
        res.status(500).json({
            message: 'Failed to update profile',
            details: error.message
        });
    }
});
exports.updateProfile = updateProfile;
const getMaidProfiles = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { location, workType, minExperience, maxSalary, availabilityType } = req.query;
        const where = { role: 'MAID' };
        if (location) {
            where.OR = [
                { address: { contains: location, mode: 'insensitive' } },
                { provinceDistrict: { contains: location, mode: 'insensitive' } },
                { sectorCellVillage: { contains: location, mode: 'insensitive' } }
            ];
        }
        if (workType) {
            where.workTypes = { has: workType };
        }
        if (minExperience) {
            where.yearsExperience = { gte: parseInt(minExperience) };
        }
        if (maxSalary) {
            where.expectedSalary = { lte: parseFloat(maxSalary) };
        }
        if (availabilityType) {
            where.availabilityType = availabilityType;
        }
        const maids = yield prisma_1.default.user.findMany({
            where,
            select: {
                id: true,
                fullName: true,
                profileImage: true,
                description: true,
                address: true,
                provinceDistrict: true,
                yearsExperience: true,
                expectedSalary: true,
                workTypes: true,
                highestEducation: true,
                availabilityType: true,
                specialSkills: true
            }
        });
        res.json(maids);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch maids' });
    }
});
exports.getMaidProfiles = getMaidProfiles;
const getMaidProfileById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const id = req.params.id;
        const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const currentUserRole = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
        const maid = yield prisma_1.default.user.findFirst({
            where: { id: parseInt(id), role: 'MAID' },
            select: {
                id: true,
                email: true,
                role: true,
                fullName: true,
                phone: true,
                address: true,
                profileImage: true,
                description: true,
                createdAt: true,
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
            }
        });
        if (!maid)
            return res.status(404).json({ message: 'Maid not found' });
        // Contact details are now available without a payment unlock step.
        const isUnlocked = currentUserRole === 'EMPLOYER' || currentUserId === maid.id;
        res.json(Object.assign(Object.assign({}, maid), { isUnlocked }));
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch maid profile' });
    }
});
exports.getMaidProfileById = getMaidProfileById;
const getActivityFeed = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const activities = [];
        // 1. Get Recent Applications
        const applications = yield prisma_1.default.application.findMany({
            where: role === client_1.Role.EMPLOYER
                ? { job: { employerId: userId } }
                : { maidId: userId },
            include: {
                job: true,
                maid: { select: { fullName: true } },
                // If employer, we want to know WHO applied. If maid, we want to know WHICH job.
            },
            orderBy: { createdAt: 'desc' },
            take: 10
        });
        applications.forEach(app => {
            var _a;
            activities.push({
                id: `app_${app.id}`,
                title: role === client_1.Role.EMPLOYER
                    ? `New Applicant: ${((_a = app.maid) === null || _a === void 0 ? void 0 : _a.fullName) || 'Maid'}`
                    : `Applied for: ${app.job.title}`,
                subtitle: app.job.title,
                date: app.createdAt,
                status: app.status,
                type: 'application',
                icon: 'person-add'
            });
        });
        // 2. Get Recent Contracts
        const contracts = yield prisma_1.default.contract.findMany({
            where: role === client_1.Role.EMPLOYER
                ? { employerId: userId }
                : { maidId: userId },
            include: {
                employer: { select: { fullName: true } },
                maid: { select: { fullName: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 5
        });
        contracts.forEach(con => {
            var _a, _b;
            activities.push({
                id: `con_${con.id}`,
                title: role === client_1.Role.EMPLOYER
                    ? `Contract with ${((_a = con.maid) === null || _a === void 0 ? void 0 : _a.fullName) || 'Maid'}`
                    : `Contract from ${((_b = con.employer) === null || _b === void 0 ? void 0 : _b.fullName) || 'Employer'}`,
                subtitle: con.title,
                date: con.createdAt,
                status: con.status,
                type: 'contract',
                icon: 'document-text'
            });
        });
        // 3. Get Recent Reviews
        const reviews = yield prisma_1.default.review.findMany({
            where: { revieweeId: userId },
            include: {
                reviewer: { select: { fullName: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 5
        });
        reviews.forEach(rev => {
            var _a;
            activities.push({
                id: `rev_${rev.id}`,
                title: `Review Received (${rev.rating} stars)`,
                subtitle: rev.comment || `Feedback from ${(_a = rev.reviewer) === null || _a === void 0 ? void 0 : _a.fullName}`,
                date: rev.createdAt,
                status: 'Completed',
                type: 'review',
                icon: 'star'
            });
        });
        // 4. Get Recent Jobs (for Employers)
        if (role === client_1.Role.EMPLOYER) {
            const jobs = yield prisma_1.default.job.findMany({
                where: { employerId: userId },
                orderBy: { createdAt: 'desc' },
                take: 5
            });
            jobs.forEach(job => {
                activities.push({
                    id: `job_${job.id}`,
                    title: `Job Posted: ${job.title}`,
                    subtitle: job.location,
                    date: job.createdAt,
                    status: job.status,
                    type: 'job',
                    icon: 'briefcase'
                });
            });
        }
        // 5. Calculate Dashboard Stats
        let stats = {};
        if (role === client_1.Role.MAID) {
            const [completedContracts, receivedReviews] = yield Promise.all([
                prisma_1.default.contract.findMany({
                    where: { maidId: userId, status: 'COMPLETED' }
                }),
                prisma_1.default.review.findMany({
                    where: { revieweeId: userId }
                })
            ]);
            const earnings = completedContracts.reduce((sum, con) => sum + con.salary, 0);
            const avgRating = receivedReviews.length > 0
                ? (receivedReviews.reduce((sum, rev) => sum + rev.rating, 0) / receivedReviews.length).toFixed(1)
                : '0.0';
            stats = {
                rating: avgRating,
                jobsDone: completedContracts.length,
                earned: earnings
            };
        }
        else {
            const [activeJobs, totalApplications] = yield Promise.all([
                prisma_1.default.job.count({ where: { employerId: userId, status: 'OPEN' } }),
                prisma_1.default.application.count({ where: { job: { employerId: userId } } }),
            ]);
            stats = {
                activeJobs,
                applicants: totalApplications
            };
        }
        // Sort all by date descending
        activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const unreadCount = yield prisma_1.default.notification.count({
            where: { userId, read: false }
        });
        res.json({
            activities: activities.slice(0, 15),
            stats,
            unreadCount
        });
    }
    catch (error) {
        console.error('Activity Feed Error:', error);
        res.status(500).json({ message: 'Failed to fetch activity feed' });
    }
});
exports.getActivityFeed = getActivityFeed;
