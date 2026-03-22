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
exports.updateContractStatus = exports.getMyContracts = exports.createContract = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const notificationController_1 = require("./notificationController");
const createContract = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const employerId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!employerId)
            return res.status(401).json({ message: 'Unauthorized' });
        const { maidId, title, description, startDate, endDate, salary, terms } = req.body;
        const contract = yield prisma_1.default.contract.create({
            data: {
                employerId,
                maidId,
                title,
                description,
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : null,
                salary: Number(salary),
                terms,
                status: 'DRAFT'
            }
        });
        // Notify maid
        yield (0, notificationController_1.createNotification)(maidId, 'New Contract Offer', `You have received a new contract offer: ${title}`, 'CONTRACT');
        res.status(201).json(contract);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create contract' });
    }
});
exports.createContract = createContract;
const getMyContracts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const where = role === 'EMPLOYER' ? { employerId: userId } : { maidId: userId };
        const contracts = yield prisma_1.default.contract.findMany({
            where,
            include: {
                employer: { select: { fullName: true } },
                maid: { select: { fullName: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(contracts);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch contracts' });
    }
});
exports.getMyContracts = getMyContracts;
const updateContractStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        // Verify ownership/permission logic could be added here
        const contract = yield prisma_1.default.contract.update({
            where: { id: Number(id) },
            data: { status },
            include: {
                employer: { select: { fullName: true } },
                maid: { select: { fullName: true } }
            }
        });
        // Notify relevant party
        if (status === 'SIGNED' || status === 'ACTIVE') {
            yield (0, notificationController_1.createNotification)(contract.employerId, 'Contract Update', `${contract.maid.fullName} has ${status.toLowerCase()} the contract: ${contract.title}`, 'CONTRACT');
        }
        else {
            yield (0, notificationController_1.createNotification)(contract.maidId, 'Contract Update', `Your contract "${contract.title}" status is now ${status}.`, 'CONTRACT');
        }
        res.json(contract);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update contract' });
    }
});
exports.updateContractStatus = updateContractStatus;
