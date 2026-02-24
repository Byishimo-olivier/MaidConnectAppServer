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
exports.getUserReviews = exports.createReview = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const createReview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const reviewerId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!reviewerId)
            return res.status(401).json({ message: 'Unauthorized' });
        const { contractId, rating, comment } = req.body;
        const contract = yield prisma_1.default.contract.findUnique({ where: { id: Number(contractId) } });
        if (!contract)
            return res.status(404).json({ message: 'Contract not found' });
        if (contract.status !== 'COMPLETED') {
            return res.status(400).json({ message: 'Contract must be completed to leave a review' });
        }
        let revieweeId;
        if (contract.employerId === reviewerId) {
            revieweeId = contract.maidId;
        }
        else if (contract.maidId === reviewerId) {
            revieweeId = contract.employerId;
        }
        else {
            return res.status(403).json({ message: 'Not involved in this contract' });
        }
        const review = yield prisma_1.default.review.create({
            data: {
                contractId: Number(contractId),
                reviewerId,
                revieweeId,
                rating: Number(rating),
                comment
            }
        });
        res.status(201).json(review);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to submit review' });
    }
});
exports.createReview = createReview;
const getUserReviews = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        const reviews = yield prisma_1.default.review.findMany({
            where: { revieweeId: Number(userId) },
            include: { reviewer: { select: { fullName: true, profileImage: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(reviews);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch reviews' });
    }
});
exports.getUserReviews = getUserReviews;
