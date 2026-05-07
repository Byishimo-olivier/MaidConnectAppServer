"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminController_1 = require("../controllers/adminController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateToken, (0, auth_1.requireRole)('ADMIN'));
// Overview
router.get('/overview', adminController_1.getAdminOverview);
// Users - CRUD
router.get('/users', adminController_1.getAdminUsers);
router.post('/users', adminController_1.createAdminUser);
router.patch('/users/:id', adminController_1.updateAdminUser);
router.patch('/users/:id/role', adminController_1.updateAdminUserRole);
router.delete('/users/:id', adminController_1.deleteAdminUser);
// Jobs - CRUD
router.get('/jobs', adminController_1.getAdminJobs);
router.post('/jobs', adminController_1.createAdminJob);
router.patch('/jobs/:id/status', adminController_1.updateAdminJobStatus);
router.delete('/jobs/:id', adminController_1.deleteAdminJob);
// Applications - CRUD
router.get('/applications', adminController_1.getAdminApplications);
router.patch('/applications/:id/status', adminController_1.updateAdminApplicationStatus);
router.delete('/applications/:id', adminController_1.deleteAdminApplication);
// Contracts - CRUD
router.get('/contracts', adminController_1.getAdminContracts);
router.post('/contracts', adminController_1.createAdminContract);
router.patch('/contracts/:id/status', adminController_1.updateAdminContractStatus);
router.delete('/contracts/:id', adminController_1.deleteAdminContract);
// Payments - Read & Delete
router.get('/payments/overview', adminController_1.getAdminPaymentsOverview);
router.get('/payments', adminController_1.getAdminPayments);
router.delete('/payments/:id', adminController_1.deleteAdminPayment);
// Disputes - Update & Delete
router.get('/disputes', adminController_1.getAdminDisputes);
router.patch('/disputes/:id/status', adminController_1.updateAdminDisputeStatus);
router.delete('/disputes/:id', adminController_1.deleteAdminDispute);
// Reviews - Read & Delete
router.get('/reviews', adminController_1.getAdminReviews);
router.delete('/reviews/:id', adminController_1.deleteAdminReview);
exports.default = router;
