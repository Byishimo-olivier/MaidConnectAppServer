import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';

export const getMyProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const user = await prisma.user.findUnique({
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

        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch profile' });
    }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const {
            fullName, phone, address, description, profileImage,
            dob, gender, nidNumber, maritalStatus, childrenCount,
            country, provinceDistrict, sectorCellVillage, willingToRelocate,
            yearsExperience, prevEmployer, prevEmployerContact, workTypes,
            reasonForLeaving, highestEducation, languages, specialSkills,
            drivingLicense, availabilityType, startDate, preferredHours,
            expectedSalary, salaryNegotiable, nidPhoto, insurancePhoto,
            emergencyName, emergencyRelation, emergencyPhone
        } = req.body;

        // Normalize languages: UI might send it as an array (from split/trim logic) or a string
        const normalizedLanguages = Array.isArray(languages)
            ? languages.join(', ')
            : languages;

        const user = await prisma.user.update({
            where: { id: parseInt(userId as any) },
            data: {
                fullName, phone, address, description, profileImage,
                dob: dob ? new Date(dob) : undefined,
                gender, nidNumber, maritalStatus,
                childrenCount: childrenCount !== undefined ? parseInt(childrenCount as any) : undefined,
                country, provinceDistrict, sectorCellVillage, willingToRelocate,
                yearsExperience: yearsExperience !== undefined ? parseInt(yearsExperience as any) : undefined,
                prevEmployer, prevEmployerContact, workTypes,
                reasonForLeaving, highestEducation,
                languages: normalizedLanguages,
                specialSkills,
                drivingLicense, availabilityType,
                startDate: startDate ? new Date(startDate) : undefined,
                preferredHours,
                expectedSalary: expectedSalary !== undefined ? parseFloat(expectedSalary as any) : undefined,
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
    } catch (error: any) {
        console.error('Profile Update Error Detail:', {
            error: error.message,
            code: error.code,
            meta: error.meta,
            userId: req.user?.userId
        });
        res.status(500).json({
            message: 'Failed to update profile',
            details: error.message
        });
    }
};

export const getMaidProfiles = async (req: Request, res: Response) => {
    try {
        const {
            location,
            workType,
            minExperience,
            maxSalary,
            availabilityType
        } = req.query;

        const where: any = { role: 'MAID' };

        if (location) {
            where.OR = [
                { address: { contains: location as string, mode: 'insensitive' } },
                { provinceDistrict: { contains: location as string, mode: 'insensitive' } },
                { sectorCellVillage: { contains: location as string, mode: 'insensitive' } }
            ];
        }

        if (workType) {
            where.workTypes = { has: workType as string };
        }

        if (minExperience) {
            where.yearsExperience = { gte: parseInt(minExperience as string) };
        }

        if (maxSalary) {
            where.expectedSalary = { lte: parseFloat(maxSalary as string) };
        }

        if (availabilityType) {
            where.availabilityType = availabilityType as string;
        }

        const maids = await prisma.user.findMany({
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
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch maids' });
    }
};

export const getMaidProfileById = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const currentUserId = req.user?.userId;
        const currentUserRole = req.user?.role;

        const maid = await prisma.user.findFirst({
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

        if (!maid) return res.status(404).json({ message: 'Maid not found' });

        let isUnlocked = false;

        // If requester is an employer, check if they unlocked this profile
        if (currentUserId && currentUserRole === 'EMPLOYER') {
            const unlock = await prisma.unlockedProfile.findUnique({
                where: {
                    employerId_maidId: {
                        employerId: currentUserId,
                        maidId: parseInt(id)
                    }
                }
            });
            if (unlock) isUnlocked = true;
        }

        // Mask sensitive info if not unlocked
        const maskContact = (text: string | null) => {
            if (!text) return '';
            if (text.includes('@')) {
                const [user, domain] = text.split('@');
                return `${user.slice(0, 2)}****@${domain}`;
            }
            return text.slice(0, 4) + ' **** ' + text.slice(-3);
        };

        if (!isUnlocked) {
            maid.email = maskContact(maid.email);
            maid.phone = maskContact(maid.phone);
        }

        res.json({ ...maid, isUnlocked });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch maid profile' });
    }
};

export const getActivityFeed = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const role = req.user?.role;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const activities: any[] = [];

        // 1. Get Recent Applications
        const applications = await prisma.application.findMany({
            where: role === Role.EMPLOYER
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
            activities.push({
                id: `app_${app.id}`,
                title: role === Role.EMPLOYER
                    ? `New Applicant: ${app.maid?.fullName || 'Maid'}`
                    : `Applied for: ${app.job.title}`,
                subtitle: app.job.title,
                date: app.createdAt,
                status: app.status,
                type: 'application',
                icon: 'person-add'
            });
        });

        // 2. Get Recent Contracts
        const contracts = await prisma.contract.findMany({
            where: role === Role.EMPLOYER
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
            activities.push({
                id: `con_${con.id}`,
                title: role === Role.EMPLOYER
                    ? `Contract with ${con.maid?.fullName || 'Maid'}`
                    : `Contract from ${con.employer?.fullName || 'Employer'}`,
                subtitle: con.title,
                date: con.createdAt,
                status: con.status,
                type: 'contract',
                icon: 'document-text'
            });
        });

        // 3. Get Recent Reviews
        const reviews = await prisma.review.findMany({
            where: { revieweeId: userId },
            include: {
                reviewer: { select: { fullName: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        reviews.forEach(rev => {
            activities.push({
                id: `rev_${rev.id}`,
                title: `Review Received (${rev.rating} stars)`,
                subtitle: rev.comment || `Feedback from ${rev.reviewer?.fullName}`,
                date: rev.createdAt,
                status: 'Completed',
                type: 'review',
                icon: 'star'
            });
        });

        // 4. Get Recent Jobs (for Employers)
        if (role === Role.EMPLOYER) {
            const jobs = await prisma.job.findMany({
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
        if (role === Role.MAID) {
            const [completedContracts, receivedReviews] = await Promise.all([
                prisma.contract.findMany({
                    where: { maidId: userId, status: 'COMPLETED' }
                }),
                prisma.review.findMany({
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
        } else {
            const [activeJobs, totalApplications] = await Promise.all([
                prisma.job.count({ where: { employerId: userId, status: 'OPEN' } }),
                prisma.application.count({ where: { job: { employerId: userId } } }),
            ]);

            stats = {
                activeJobs,
                applicants: totalApplications
            };
        }

        // Sort all by date descending
        activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const unreadCount = await prisma.notification.count({
            where: { userId, read: false }
        });

        res.json({
            activities: activities.slice(0, 15),
            stats,
            unreadCount
        });
    } catch (error) {
        console.error('Activity Feed Error:', error);
        res.status(500).json({ message: 'Failed to fetch activity feed' });
    }
};
