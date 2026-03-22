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
exports.checkUnlockStatus = exports.verifyProfileUnlock = void 0;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const notificationController_1 = require("./notificationController");
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;
const verifyProfileUnlock = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const employerId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!employerId)
            return res.status(401).json({ message: 'Unauthorized' });
        const { transaction_id, maidId } = req.body;
        if (!transaction_id || !maidId) {
            return res.status(400).json({ message: 'Missing transaction_id or maidId' });
        }
        // 1. Verify transaction with Flutterwave
        const response = yield axios_1.default.get(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
            headers: {
                Authorization: `Bearer ${FLW_SECRET_KEY}`
            }
        });
        const { status, currency, amount, customer } = response.data.data;
        // 2. Check if transaction was successful
        if (status === 'successful') {
            // 3. Save Payment Record & Create unlock record in a transaction
            const [payment, unlock] = yield prisma_1.default.$transaction([
                prisma_1.default.payment.create({
                    data: {
                        transactionId: String(transaction_id),
                        employerId,
                        maidId: Number(maidId),
                        amount: Number(amount),
                        currency: String(currency),
                        status: 'SUCCESSFUL',
                        type: 'PROFILE_UNLOCK'
                    }
                }),
                prisma_1.default.unlockedProfile.create({
                    data: {
                        employerId,
                        maidId: Number(maidId)
                    }
                })
            ]);
            // 4. Notify both parties
            const maid = yield prisma_1.default.user.findUnique({ where: { id: Number(maidId) } });
            // Notify Employer
            yield (0, notificationController_1.createNotification)(employerId, 'Payment Successful', `You have successfully unlocked ${(maid === null || maid === void 0 ? void 0 : maid.fullName) || 'a profile'}. You can now view their full contact details.`, 'PAYMENT');
            // Notify Maid
            yield (0, notificationController_1.createNotification)(Number(maidId), 'New Interest in your Profile', 'An employer has unlocked your contact details and may contact you soon!', 'SYSTEM');
            return res.json({
                message: 'Profile unlocked successfully',
                unlock,
                paymentId: payment.id
            });
        }
        else {
            return res.status(400).json({ message: 'Payment verification failed', status });
        }
    }
    catch (error) {
        console.error('Payment Verification Error:', ((_b = error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message);
        res.status(500).json({
            message: 'Internal server error during verification',
            debug: ((_d = (_c = error.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.message) || error.message
        });
    }
});
exports.verifyProfileUnlock = verifyProfileUnlock;
const checkUnlockStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const employerId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!employerId)
            return res.status(401).json({ message: 'Unauthorized' });
        const { maidId } = req.params;
        const unlock = yield prisma_1.default.unlockedProfile.findUnique({
            where: {
                employerId_maidId: {
                    employerId,
                    maidId: Number(maidId)
                }
            }
        });
        res.json({ unlocked: !!unlock });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to check unlock status' });
    }
});
exports.checkUnlockStatus = checkUnlockStatus;
