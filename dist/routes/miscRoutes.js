"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const disputeController_1 = require("../controllers/disputeController");
const reviewController_1 = require("../controllers/reviewController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Disputes
router.post('/disputes', auth_1.authenticateToken, disputeController_1.createDispute);
router.get('/disputes', auth_1.authenticateToken, disputeController_1.getMyDisputes);
// Reviews
router.post('/reviews', auth_1.authenticateToken, reviewController_1.createReview);
router.get('/users/:userId/reviews', reviewController_1.getUserReviews);
exports.default = router;
