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
exports.getMyDisputes = exports.createDispute = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const createDispute = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const { contractId, reason, description } = req.body;
        const contract = yield prisma_1.default.contract.findUnique({ where: { id: Number(contractId) } });
        if (!contract)
            return res.status(404).json({ message: 'Contract not found' });
        // Identify respondent
        let respondentId;
        let complainantId;
        if (contract.employerId === userId) {
            complainantId = userId;
            respondentId = contract.maidId;
        }
        else if (contract.maidId === userId) {
            complainantId = userId;
            respondentId = contract.employerId;
        }
        else {
            return res.status(403).json({ message: 'Not part of this contract' });
        }
        const dispute = yield prisma_1.default.dispute.create({
            data: {
                contractId: Number(contractId),
                complainantId,
                respondentId,
                reason,
                description,
                status: 'OPEN'
            }
        });
        res.status(201).json(dispute);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to file dispute' });
    }
});
exports.createDispute = createDispute;
const getMyDisputes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const disputes = yield prisma_1.default.dispute.findMany({
            where: {
                OR: [
                    { complainantId: userId },
                    { respondentId: userId }
                ]
            },
            include: {
                contract: { select: { title: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(disputes);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch disputes' });
    }
});
exports.getMyDisputes = getMyDisputes;
