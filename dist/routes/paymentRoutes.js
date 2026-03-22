"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const paymentController_1 = require("../controllers/paymentController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.post('/verify-unlock', auth_1.authenticateToken, paymentController_1.verifyProfileUnlock);
router.get('/status/:maidId', auth_1.authenticateToken, paymentController_1.checkUnlockStatus);
exports.default = router;
