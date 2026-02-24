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
exports.getMaidProfileById = exports.getMaidProfiles = exports.updateProfile = exports.getMyProfile = void 0;
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
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const { fullName, phone, address, description, profileImage, dob, gender, nidNumber, maritalStatus, childrenCount, country, provinceDistrict, sectorCellVillage, willingToRelocate, yearsExperience, prevEmployer, prevEmployerContact, workTypes, reasonForLeaving, highestEducation, languages, specialSkills, drivingLicense, availabilityType, startDate, preferredHours, expectedSalary, salaryNegotiable, nidPhoto, insurancePhoto, emergencyName, emergencyRelation, emergencyPhone } = req.body;
        const user = yield prisma_1.default.user.update({
            where: { id: userId },
            data: {
                fullName, phone, address, description, profileImage,
                dob: dob ? new Date(dob) : undefined,
                gender, nidNumber, maritalStatus,
                childrenCount: childrenCount ? parseInt(childrenCount) : undefined,
                country, provinceDistrict, sectorCellVillage, willingToRelocate,
                yearsExperience: yearsExperience ? parseInt(yearsExperience) : undefined,
                prevEmployer, prevEmployerContact, workTypes,
                reasonForLeaving, highestEducation, languages, specialSkills,
                drivingLicense, availabilityType,
                startDate: startDate ? new Date(startDate) : undefined,
                preferredHours,
                expectedSalary: expectedSalary ? parseFloat(expectedSalary) : undefined,
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
        console.error(error);
        res.status(500).json({ message: 'Failed to update profile' });
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
    try {
        const id = req.params.id;
        const maid = yield prisma_1.default.user.findUnique({
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
                nidPhoto: true,
                insurancePhoto: true,
                emergencyName: true,
                emergencyRelation: true,
                emergencyPhone: true
            }
        });
        if (!maid)
            return res.status(404).json({ message: 'Maid not found' });
        res.json(maid);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch maid profile' });
    }
});
exports.getMaidProfileById = getMaidProfileById;
