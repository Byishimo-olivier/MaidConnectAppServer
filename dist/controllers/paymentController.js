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
exports.checkUnlockStatus = exports.getRefundStatus = exports.getPayoutStatus = exports.resendDepositCallback = exports.getDepositStatus = exports.verifyJobPostingPayment = exports.verifyProfileUnlock = exports.handlePawaPayWebhook = exports.initiateRefund = exports.initiatePayout = exports.initiateDeposit = exports.getWalletOverview = exports.getGatewayBalance = void 0;
const crypto_1 = __importDefault(require("crypto"));
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const notificationController_1 = require("./notificationController");
const APP_URL = process.env.APP_URL || 'http://localhost:8000';
const PAYPACK_APPLICATION_ID = process.env.PAYPACK_APPLICATION_ID || process.env.PAYPACK_CLIENT_ID;
const PAYPACK_APPLICATION_SECRET = process.env.PAYPACK_APPLICATION_SECRET || process.env.PAYPACK_CLIENT_SECRET;
const normalizePaypackBaseUrl = (value) => {
    let base = String(value || 'https://payments.paypack.rw/api').trim().replace(/\/+$/, '');
    // Guard against old/invalid PayPack host that triggers TLS/SNI errors.
    if (/^https?:\/\/api\.paypack\.io(?:\/.*)?$/i.test(base)) {
        base = 'https://payments.paypack.rw/api';
    }
    if (/^https?:\/\/payments\.paypack\.rw$/i.test(base)) {
        base = 'https://payments.paypack.rw/api';
    }
    return base;
};
const PAYPACK_BASE_URL = normalizePaypackBaseUrl(process.env.PAYPACK_BASE_URL);
const PAYPACK_WEBHOOK_SECRET_HASH = process.env.PAYPACK_WEBHOOK_SECRET_HASH || '';
const PAYPACK_WEBHOOK_MODE = String(process.env.PAYPACK_WEBHOOK_MODE || (APP_URL.includes('localhost') ? 'development' : 'production')).toLowerCase();
const PAWAPAY_API_KEY = process.env.PAWAPAY_API_KEY;
const PAWAPAY_BASE_URL = String(process.env.PAWAPAY_BASE_URL || 'https://api.sandbox.pawapay.io').replace(/\/+$/, '');
const PAWAPAY_WEBHOOK_SECRET_HASH = process.env.PAWAPAY_SECRET_HASH || process.env.PAWAPAY_WEBHOOK_SECRET_HASH || '';
const INTOUCHPAY_USERNAME = String(process.env.INTOUCHPAY_USERNAME || '').trim();
const INTOUCHPAY_ACCOUNT_NO = String(process.env.INTOUCHPAY_ACCOUNT_NO || '').trim();
const INTOUCHPAY_PARTNER_PASSWORD = String(process.env.INTOUCHPAY_PARTNER_PASSWORD || '').trim();
const INTOUCHPAY_BASE_URL = String(process.env.INTOUCHPAY_BASE_URL || 'https://www.intouchpay.co.rw/api').replace(/\/+$/, '');
const INTOUCHPAY_DEFAULT_WITHDRAW_CHARGE = String(process.env.INTOUCHPAY_WITHDRAW_CHARGE || '1').trim();
const INTOUCHPAY_DEFAULT_SID = String(process.env.INTOUCHPAY_SID || '1').trim();
const INTOUCHPAY_SANDBOX = /^(1|true|yes)$/i.test(String(process.env.INTOUCHPAY_SANDBOX || '').trim())
    || /^test/i.test(INTOUCHPAY_USERNAME);
const DEPOSIT_CALLBACK_URL = process.env.PAYPACK_DEPOSIT_CALLBACK_URL
    || process.env.PAWAPAY_DEPOSIT_CALLBACK_URL
    || process.env.INTOUCHPAY_CALLBACK_URL
    || `${APP_URL}/api/payments/webhook/deposit`;
const PAYOUT_CALLBACK_URL = process.env.PAYPACK_PAYOUT_CALLBACK_URL
    || process.env.PAWAPAY_PAYOUT_CALLBACK_URL
    || process.env.INTOUCHPAY_CALLBACK_URL
    || `${APP_URL}/api/payments/webhook/payout`;
const REFUND_CALLBACK_URL = process.env.PAYPACK_REFUND_CALLBACK_URL
    || process.env.PAWAPAY_REFUND_CALLBACK_URL
    || `${APP_URL}/api/payments/webhook/refund`;
const DEFAULT_PROVIDER = process.env.PAYPACK_DEFAULT_PROVIDER || process.env.PAWAPAY_DEFAULT_PROVIDER || '';
const DEFAULT_DEPOSIT_PROVIDER = process.env.PAYPACK_DEFAULT_DEPOSIT_PROVIDER || process.env.PAWAPAY_DEFAULT_DEPOSIT_PROVIDER || DEFAULT_PROVIDER;
const DEFAULT_PAYOUT_PROVIDER = process.env.PAYPACK_DEFAULT_PAYOUT_PROVIDER || process.env.PAWAPAY_DEFAULT_PAYOUT_PROVIDER || DEFAULT_PROVIDER;
const requestedGatewayMode = String(process.env.PAYMENT_GATEWAY_MODE || '').trim().toLowerCase();
const hasPaypackCredentials = Boolean(PAYPACK_APPLICATION_ID && PAYPACK_APPLICATION_SECRET);
const hasPawaPayCredentials = Boolean(PAWAPAY_API_KEY);
const hasIntouchPayCredentials = Boolean(INTOUCHPAY_USERNAME && INTOUCHPAY_ACCOUNT_NO && INTOUCHPAY_PARTNER_PASSWORD);
const resolveGatewayMode = () => {
    if (requestedGatewayMode === 'paypack')
        return hasPaypackCredentials ? 'paypack' : 'none';
    if (requestedGatewayMode === 'pawapay')
        return hasPawaPayCredentials ? 'pawapay' : 'none';
    if (requestedGatewayMode === 'intouchpay')
        return hasIntouchPayCredentials ? 'intouchpay' : 'none';
    if (requestedGatewayMode === 'none')
        return 'none';
    if (hasPaypackCredentials)
        return 'paypack';
    if (hasPawaPayCredentials)
        return 'pawapay';
    if (hasIntouchPayCredentials)
        return 'intouchpay';
    return 'none';
};
const gatewayMode = resolveGatewayMode();
const gatewayBaseUrl = gatewayMode === 'paypack'
    ? PAYPACK_BASE_URL
    : gatewayMode === 'pawapay'
        ? PAWAPAY_BASE_URL
        : gatewayMode === 'intouchpay'
            ? INTOUCHPAY_BASE_URL
            : 'n/a';
console.log(`[payments] gateway=${gatewayMode} base=${gatewayBaseUrl}`);
const hasGatewayAuth = () => gatewayMode !== 'none';
const isSandboxEnvironment = () => {
    if (gatewayMode === 'pawapay')
        return /sandbox/i.test(PAWAPAY_BASE_URL);
    if (gatewayMode === 'intouchpay')
        return INTOUCHPAY_SANDBOX;
    return false;
};
const createTxRef = (prefix, userId) => `${prefix}_${userId}_${Date.now()}`;
const createProviderId = () => crypto_1.default.randomUUID();
const createIdempotencyKey = (seed) => crypto_1.default.createHash('sha256').update(seed).digest('hex').slice(0, 32);
const normalizeStatus = (status) => String(status || '').trim().toUpperCase();
const SUCCESS_STATUSES = new Set(['SUCCESSFUL', 'SUCCESS', 'COMPLETED']);
const FAILED_STATUSES = new Set(['FAILED', 'FAILURE', 'REJECTED', 'CANCELLED', 'CANCELED', 'ERROR']);
const PENDING_STATUSES = new Set(['PENDING', 'PROCESSING', 'CREATED', 'INITIATED']);
const isSuccessfulStatus = (status) => SUCCESS_STATUSES.has(normalizeStatus(status));
const isFailedStatus = (status) => FAILED_STATUSES.has(normalizeStatus(status));
const isPendingStatus = (status) => PENDING_STATUSES.has(normalizeStatus(status));
const WALLET_CREDIT_TYPES = new Set(['DEPOSIT', 'REFUND']);
const WALLET_DEBIT_TYPES = new Set(['PAYOUT', 'PROFILE_UNLOCK', 'JOB_POSTING']);
const walletDirectionFromType = (type) => {
    const normalizedType = normalizeStatus(type);
    if (WALLET_CREDIT_TYPES.has(normalizedType))
        return 'credit';
    if (WALLET_DEBIT_TYPES.has(normalizedType))
        return 'debit';
    return 'neutral';
};
const getWalletDelta = (type, amount) => {
    const parsedAmount = toNumber(amount, 0);
    const direction = walletDirectionFromType(type);
    if (direction === 'credit')
        return parsedAmount;
    if (direction === 'debit')
        return -parsedAmount;
    return 0;
};
const getWalletBalanceForUser = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const successfulPayments = yield prisma_1.default.payment.findMany({
        where: {
            employerId: userId,
            status: 'SUCCESSFUL'
        },
        select: {
            type: true,
            amount: true
        }
    });
    const balance = successfulPayments.reduce((sum, payment) => sum + getWalletDelta(payment.type, payment.amount), 0);
    // Ensure balance never goes negative - min balance is 0
    return Math.max(0, balance);
});
const JOB_POST_FEE_PERCENTAGE_RAW = Number(process.env.JOB_POST_FEE_PERCENTAGE || '0.1');
const JOB_POST_FEE_PERCENTAGE = Number.isFinite(JOB_POST_FEE_PERCENTAGE_RAW) && JOB_POST_FEE_PERCENTAGE_RAW > 0
    ? JOB_POST_FEE_PERCENTAGE_RAW
    : 0.1;
const calculateJobPostingFee = (salaryMax) => Math.ceil(salaryMax * JOB_POST_FEE_PERCENTAGE);
const toPaymentStatus = (status) => {
    const normalized = normalizeStatus(status);
    if (!normalized)
        return 'PENDING';
    if (SUCCESS_STATUSES.has(normalized))
        return 'SUCCESSFUL';
    if (FAILED_STATUSES.has(normalized))
        return 'FAILED';
    if (PENDING_STATUSES.has(normalized))
        return 'PENDING';
    return normalized;
};
const INTOUCHPAY_SUCCESS_CODES = new Set(['01', '2001']);
const INTOUCHPAY_PENDING_CODES = new Set(['1000']);
const INTOUCHPAY_REFERENCE_SEPARATOR = '|';
const createIntouchTimestamp = () => {
    const iso = new Date().toISOString().replace(/\D/g, '');
    return iso.slice(0, 14);
};
const createIntouchPassword = (timestamp) => {
    const secret = `${INTOUCHPAY_USERNAME}${INTOUCHPAY_ACCOUNT_NO}${INTOUCHPAY_PARTNER_PASSWORD}${timestamp}`;
    return crypto_1.default.createHash('sha256').update(secret).digest('hex');
};
const normalizeIntouchResponseCode = (code) => String(code !== null && code !== void 0 ? code : '').trim().toUpperCase();
const intouchStatusFromResponse = (status, responseCode) => {
    const normalizedStatus = normalizeStatus(status);
    if (normalizedStatus) {
        if (SUCCESS_STATUSES.has(normalizedStatus))
            return normalizedStatus;
        if (PENDING_STATUSES.has(normalizedStatus))
            return normalizedStatus;
    }
    const code = normalizeIntouchResponseCode(responseCode);
    if (INTOUCHPAY_SUCCESS_CODES.has(code))
        return 'SUCCESSFUL';
    if (INTOUCHPAY_PENDING_CODES.has(code))
        return 'PENDING';
    if (code)
        return 'FAILED';
    return normalizedStatus || 'PENDING';
};
const combineIntouchReference = (requestTransactionId, providerTransactionId) => {
    const requestId = String(requestTransactionId || '').trim();
    const providerId = String(providerTransactionId || '').trim();
    if (!requestId)
        return providerId;
    if (!providerId)
        return requestId;
    return `${requestId}${INTOUCHPAY_REFERENCE_SEPARATOR}${providerId}`;
};
const splitIntouchReference = (reference) => {
    const normalized = String(reference || '').trim();
    if (!normalized.includes(INTOUCHPAY_REFERENCE_SEPARATOR)) {
        return {
            requestTransactionId: normalized,
            providerTransactionId: normalized
        };
    }
    const [requestTransactionId, providerTransactionId] = normalized
        .split(INTOUCHPAY_REFERENCE_SEPARATOR)
        .map((part) => part.trim());
    return {
        requestTransactionId: requestTransactionId || normalized,
        providerTransactionId: providerTransactionId || requestTransactionId || normalized
    };
};
const sanitizeAmount = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeCurrency = (value, fallback = 'RWF') => String(value || fallback).toUpperCase();
const digitsOnly = (value) => String(value || '').replace(/\D/g, '');
const normalizePhoneForCurrency = (value, currency) => {
    let phone = digitsOnly(value);
    if (!phone)
        return '';
    // Rwanda convenience: convert 07XXXXXXXX to 2507XXXXXXXX
    if (currency === 'RWF' && phone.startsWith('0') && phone.length >= 10) {
        phone = `250${phone.slice(1)}`;
    }
    return phone;
};
const buildGatewayUrl = (path) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (gatewayMode === 'paypack')
        return `${PAYPACK_BASE_URL}${normalizedPath}`;
    if (gatewayMode === 'pawapay')
        return `${PAWAPAY_BASE_URL}${normalizedPath}`;
    return `${INTOUCHPAY_BASE_URL}${normalizedPath}`;
};
const getRawBodyBuffer = (req) => {
    const raw = req.rawBody;
    if (Buffer.isBuffer(raw))
        return raw;
    if (typeof raw === 'string')
        return Buffer.from(raw);
    return Buffer.from(JSON.stringify(req.body || {}));
};
const isWebhookValid = (req) => {
    if (gatewayMode === 'paypack') {
        const signature = String(req.headers['x-paypack-signature'] || '').trim();
        if (!PAYPACK_WEBHOOK_SECRET_HASH || !signature)
            return true;
        const expectedSignature = crypto_1.default
            .createHmac('sha256', PAYPACK_WEBHOOK_SECRET_HASH)
            .update(getRawBodyBuffer(req))
            .digest('base64');
        return signature === expectedSignature;
    }
    if (gatewayMode === 'pawapay') {
        const signature = String(req.headers['verif-hash'] || '');
        if (!PAWAPAY_WEBHOOK_SECRET_HASH || !signature)
            return true;
        const payload = JSON.stringify(req.body || {});
        const expectedSignature = crypto_1.default.createHmac('sha256', PAWAPAY_WEBHOOK_SECRET_HASH).update(payload).digest('hex');
        return signature === expectedSignature;
    }
    return true;
};
const paypackTokenCache = {
    accessToken: null,
    refreshToken: null,
    expiresAtMs: 0
};
const parsePaypackExpiryMs = (expires) => {
    const value = Number(expires);
    if (!Number.isFinite(value) || value <= 0)
        return Date.now() + (14 * 60 * 1000);
    // Handle both epoch timestamps and relative seconds.
    if (value > 10000000000)
        return value - 60000;
    if (value > 1000000000)
        return (value * 1000) - 60000;
    return Date.now() + (value * 1000) - 60000;
};
const authorizePaypack = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!PAYPACK_APPLICATION_ID || !PAYPACK_APPLICATION_SECRET) {
        throw new Error('PayPack credentials are not configured');
    }
    const response = yield axios_1.default.post(buildGatewayUrl('/auth/agents/authorize'), {
        client_id: PAYPACK_APPLICATION_ID,
        client_secret: PAYPACK_APPLICATION_SECRET
    }, {
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        }
    });
    const data = (response === null || response === void 0 ? void 0 : response.data) || {};
    const access = String(data.access || '').trim();
    if (!access) {
        throw new Error('PayPack authorize response did not include an access token');
    }
    paypackTokenCache.accessToken = access;
    paypackTokenCache.refreshToken = String(data.refresh || '').trim() || null;
    paypackTokenCache.expiresAtMs = parsePaypackExpiryMs(data.expires);
    return access;
});
const refreshPaypackAccessToken = () => __awaiter(void 0, void 0, void 0, function* () {
    const refreshToken = paypackTokenCache.refreshToken;
    if (!refreshToken)
        return null;
    try {
        const response = yield axios_1.default.get(buildGatewayUrl(`/auth/agents/refresh/${encodeURIComponent(refreshToken)}`), {
            headers: { Accept: 'application/json' }
        });
        const data = (response === null || response === void 0 ? void 0 : response.data) || {};
        const access = String(data.access || '').trim();
        if (!access)
            return null;
        paypackTokenCache.accessToken = access;
        paypackTokenCache.refreshToken = String(data.refresh || refreshToken).trim() || refreshToken;
        paypackTokenCache.expiresAtMs = parsePaypackExpiryMs(data.expires);
        return access;
    }
    catch (_a) {
        return null;
    }
});
const getPaypackAccessToken = () => __awaiter(void 0, void 0, void 0, function* () {
    if (paypackTokenCache.accessToken && Date.now() < paypackTokenCache.expiresAtMs) {
        return paypackTokenCache.accessToken;
    }
    const refreshed = yield refreshPaypackAccessToken();
    if (refreshed)
        return refreshed;
    return authorizePaypack();
});
const createGatewayAuthHeader = () => __awaiter(void 0, void 0, void 0, function* () {
    if (gatewayMode === 'paypack') {
        const accessToken = yield getPaypackAccessToken();
        return { Authorization: `Bearer ${accessToken}` };
    }
    if (gatewayMode === 'pawapay' && PAWAPAY_API_KEY) {
        return { Authorization: `Bearer ${PAWAPAY_API_KEY}` };
    }
    return {};
});
const createGatewayHeaders = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (additional = {}) {
    const auth = yield createGatewayAuthHeader();
    return Object.assign(Object.assign({}, auth), additional);
});
const parsePawaPayTransaction = (payload) => {
    var _a, _b, _c, _d, _e;
    const root = Array.isArray(payload) ? payload[0] : ((payload === null || payload === void 0 ? void 0 : payload.data) || payload || {});
    const reference = String(root.depositId
        || root.payoutId
        || root.refundId
        || root.clientReferenceId
        || root.tx_ref
        || root.id
        || '').trim();
    const amount = toNumber((_c = (_a = root.amount) !== null && _a !== void 0 ? _a : (_b = root.requestedAmount) === null || _b === void 0 ? void 0 : _b.amount) !== null && _c !== void 0 ? _c : 0);
    const currency = String(root.currency || ((_d = root.requestedAmount) === null || _d === void 0 ? void 0 : _d.currency) || 'RWF');
    const status = String(root.status || ((_e = root.result) === null || _e === void 0 ? void 0 : _e.status) || root.depositStatus || root.payoutStatus || root.refundStatus || '');
    return {
        reference,
        amount,
        currency,
        status,
        raw: root
    };
};
const parsePaypackTransaction = (payload) => {
    var _a, _b, _c;
    const root = Array.isArray(payload) ? payload[0] : (payload || {});
    const firstEvent = Array.isArray(root.transactions) && root.transactions.length > 0 ? root.transactions[0] : null;
    const firstEventData = (firstEvent === null || firstEvent === void 0 ? void 0 : firstEvent.data) || firstEvent || {};
    const data = root.data || {};
    const reference = String(data.ref
        || root.ref
        || firstEventData.ref
        || firstEventData.reference
        || '').trim();
    const amount = toNumber((_c = (_b = (_a = data.amount) !== null && _a !== void 0 ? _a : root.amount) !== null && _b !== void 0 ? _b : firstEventData.amount) !== null && _c !== void 0 ? _c : 0);
    const status = String(data.status || root.status || firstEventData.status || '');
    return {
        reference,
        amount,
        currency: 'RWF',
        status,
        raw: root
    };
};
const parseIntouchTransaction = (payload) => {
    var _a, _b;
    const root = (payload === null || payload === void 0 ? void 0 : payload.jsonpayload) || (payload === null || payload === void 0 ? void 0 : payload.data) || payload || {};
    const responseCode = normalizeIntouchResponseCode(root.responsecode);
    const reference = combineIntouchReference(root.requesttransactionid || root.requestTransactionId, root.transactionid || root.referenceid || root.referenceId);
    const status = intouchStatusFromResponse(root.status, responseCode);
    const amount = toNumber((_b = (_a = root.amount) !== null && _a !== void 0 ? _a : root.requestedamount) !== null && _b !== void 0 ? _b : 0);
    const currency = normalizeCurrency(root.currency || 'RWF');
    return {
        reference,
        amount,
        currency,
        status,
        raw: root
    };
};
const toFormBody = (payload) => {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
        if (value === undefined || value === null)
            continue;
        form.append(key, String(value));
    }
    return form.toString();
};
const extractErrorMessage = (error) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const intouchPayload = ((_b = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.jsonpayload) || ((_c = error === null || error === void 0 ? void 0 : error.response) === null || _c === void 0 ? void 0 : _c.data);
    const intouchCode = intouchPayload === null || intouchPayload === void 0 ? void 0 : intouchPayload.responsecode;
    const intouchStatusDesc = intouchPayload === null || intouchPayload === void 0 ? void 0 : intouchPayload.statusdesc;
    if (intouchCode || intouchStatusDesc) {
        return [intouchCode ? `code=${intouchCode}` : null, intouchStatusDesc || (intouchPayload === null || intouchPayload === void 0 ? void 0 : intouchPayload.message)]
            .filter(Boolean)
            .join(' ');
    }
    const providerMessage = ((_f = (_e = (_d = error === null || error === void 0 ? void 0 : error.response) === null || _d === void 0 ? void 0 : _d.data) === null || _e === void 0 ? void 0 : _e.failureReason) === null || _f === void 0 ? void 0 : _f.failureMessage)
        || ((_h = (_g = error === null || error === void 0 ? void 0 : error.response) === null || _g === void 0 ? void 0 : _g.data) === null || _h === void 0 ? void 0 : _h.message)
        || ((_k = (_j = error === null || error === void 0 ? void 0 : error.response) === null || _j === void 0 ? void 0 : _j.data) === null || _k === void 0 ? void 0 : _k.error)
        || (error === null || error === void 0 ? void 0 : error.message);
    if (typeof providerMessage === 'string')
        return providerMessage;
    return JSON.stringify(providerMessage || 'Unknown gateway error');
};
const extractProviderStatusMessage = (raw) => {
    var _a;
    const message = (raw === null || raw === void 0 ? void 0 : raw.statusdesc)
        || (raw === null || raw === void 0 ? void 0 : raw.message)
        || ((_a = raw === null || raw === void 0 ? void 0 : raw.failureReason) === null || _a === void 0 ? void 0 : _a.failureMessage)
        || (raw === null || raw === void 0 ? void 0 : raw.failureReason)
        || '';
    return String(message || '').trim();
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const confirmPaypackTransaction = (reference) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const delaysMs = [0, 700, 1500];
    for (const delayMs of delaysMs) {
        if (delayMs > 0)
            yield sleep(delayMs);
        try {
            const response = yield axios_1.default.get(buildGatewayUrl(`/transactions/find/${encodeURIComponent(reference)}`), {
                headers: yield createGatewayHeaders({
                    Accept: 'application/json'
                })
            });
            const parsed = parsePaypackTransaction(response === null || response === void 0 ? void 0 : response.data);
            if (parsed.reference)
                return parsed;
        }
        catch (error) {
            if (((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status) === 404)
                continue;
            throw error;
        }
    }
    return null;
});
const predictPawaPayProviderAndPhone = (phoneNumber) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (gatewayMode !== 'pawapay' || !phoneNumber)
        return null;
    try {
        const response = yield axios_1.default.post(buildGatewayUrl('/v2/predict-provider'), { phoneNumber }, {
            headers: yield createGatewayHeaders({
                'Content-Type': 'application/json'
            })
        });
        const data = Array.isArray(response === null || response === void 0 ? void 0 : response.data) ? response.data[0] : response === null || response === void 0 ? void 0 : response.data;
        return {
            phoneNumber: digitsOnly((data === null || data === void 0 ? void 0 : data.phoneNumber) || phoneNumber),
            provider: String((data === null || data === void 0 ? void 0 : data.provider) || '').trim()
        };
    }
    catch (error) {
        console.warn('Provider prediction failed:', ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || (error === null || error === void 0 ? void 0 : error.message) || error);
        return null;
    }
});
const upsertPaymentByReference = (params) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const existing = yield prisma_1.default.payment.findUnique({
        where: { transactionId: params.transactionId }
    });
    if (existing) {
        if (existing.employerId !== params.employerId) {
            throw new Error('Transaction reference belongs to a different employer');
        }
        return prisma_1.default.payment.update({
            where: { id: existing.id },
            data: {
                maidId: (_a = params.maidId) !== null && _a !== void 0 ? _a : existing.maidId,
                amount: params.amount || existing.amount,
                currency: params.currency || existing.currency,
                status: params.status || existing.status,
                type: params.type || existing.type
            }
        });
    }
    return prisma_1.default.payment.create({
        data: {
            transactionId: params.transactionId,
            employerId: params.employerId,
            maidId: (_b = params.maidId) !== null && _b !== void 0 ? _b : undefined,
            amount: params.amount,
            currency: params.currency,
            status: params.status,
            type: params.type
        }
    });
});
const initiateGatewayDeposit = (params) => __awaiter(void 0, void 0, void 0, function* () {
    if (gatewayMode === 'paypack') {
        const response = yield axios_1.default.post(buildGatewayUrl('/transactions/cashin'), {
            amount: params.amount,
            number: params.phoneNumber
        }, {
            headers: yield createGatewayHeaders({
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'Idempotency-Key': createIdempotencyKey(params.clientReferenceId),
                'X-Webhook-Mode': PAYPACK_WEBHOOK_MODE
            })
        });
        const parsed = parsePaypackTransaction(response === null || response === void 0 ? void 0 : response.data);
        if (!parsed.reference) {
            throw new Error('PayPack did not return a transaction reference');
        }
        const confirmed = yield confirmPaypackTransaction(parsed.reference);
        if (confirmed) {
            return Object.assign(Object.assign({}, confirmed), { amount: confirmed.amount || parsed.amount || params.amount, currency: params.currency, exists: true });
        }
        return Object.assign(Object.assign({}, parsed), { amount: parsed.amount || params.amount, currency: params.currency, exists: false });
    }
    if (gatewayMode === 'intouchpay') {
        const timestamp = createIntouchTimestamp();
        const password = createIntouchPassword(timestamp);
        const requestTransactionId = String(params.clientReferenceId || createProviderId());
        const payload = {
            username: INTOUCHPAY_USERNAME,
            accountno: INTOUCHPAY_ACCOUNT_NO,
            timestamp,
            amount: params.amount,
            password,
            mobilephone: params.phoneNumber,
            mobilephoneno: params.phoneNumber,
            requesttransactionid: requestTransactionId,
            callbackurl: DEPOSIT_CALLBACK_URL
        };
        const response = yield axios_1.default.post(buildGatewayUrl('/requestpayment/'), toFormBody(payload), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json'
            }
        });
        const parsed = parseIntouchTransaction(response === null || response === void 0 ? void 0 : response.data);
        return Object.assign(Object.assign({}, parsed), { reference: parsed.reference || requestTransactionId, amount: parsed.amount || params.amount, currency: params.currency, exists: true });
    }
    const payload = {
        depositId: String(params.clientReferenceId || createProviderId()),
        payer: {
            type: 'MMO',
            accountDetails: {
                phoneNumber: params.phoneNumber,
                provider: params.provider
            }
        },
        amount: params.amount.toString(),
        currency: params.currency,
        clientReferenceId: params.clientReferenceId,
        customerMessage: params.customerMessage,
        metadata: params.metadata
    };
    if (params.preAuthorisationCode) {
        payload.preAuthorisationCode = String(params.preAuthorisationCode);
    }
    const response = yield axios_1.default.post(buildGatewayUrl('/v2/deposits'), payload, {
        headers: yield createGatewayHeaders({
            'Content-Type': 'application/json'
        })
    });
    const parsed = parsePawaPayTransaction(response === null || response === void 0 ? void 0 : response.data);
    if (!parsed.reference) {
        parsed.reference = payload.depositId;
    }
    return parsed;
});
const initiateGatewayPayout = (params) => __awaiter(void 0, void 0, void 0, function* () {
    if (gatewayMode === 'paypack') {
        const response = yield axios_1.default.post(buildGatewayUrl('/transactions/cashout'), {
            amount: params.amount,
            number: params.phoneNumber
        }, {
            headers: yield createGatewayHeaders({
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'Idempotency-Key': createIdempotencyKey(params.clientReferenceId),
                'X-Webhook-Mode': PAYPACK_WEBHOOK_MODE
            })
        });
        const parsed = parsePaypackTransaction(response === null || response === void 0 ? void 0 : response.data);
        if (!parsed.reference) {
            throw new Error('PayPack did not return a payout reference');
        }
        return Object.assign(Object.assign({}, parsed), { amount: parsed.amount || params.amount, currency: params.currency });
    }
    if (gatewayMode === 'intouchpay') {
        const timestamp = createIntouchTimestamp();
        const password = createIntouchPassword(timestamp);
        const requestTransactionId = String(params.clientReferenceId || createProviderId());
        const payload = {
            username: INTOUCHPAY_USERNAME,
            accountno: INTOUCHPAY_ACCOUNT_NO,
            timestamp,
            amount: params.amount,
            withdrawcharge: INTOUCHPAY_DEFAULT_WITHDRAW_CHARGE,
            reason: params.customerMessage || 'Maid payout',
            sid: INTOUCHPAY_DEFAULT_SID,
            password,
            mobilephone: params.phoneNumber,
            mobilephoneno: params.phoneNumber,
            requesttransactionid: requestTransactionId
        };
        const response = yield axios_1.default.post(buildGatewayUrl('/requestdeposit/'), toFormBody(payload), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json'
            }
        });
        const parsed = parseIntouchTransaction(response === null || response === void 0 ? void 0 : response.data);
        return Object.assign(Object.assign({}, parsed), { reference: parsed.reference || requestTransactionId, amount: parsed.amount || params.amount, currency: params.currency });
    }
    const payload = {
        payoutId: String(params.clientReferenceId || createProviderId()),
        recipient: {
            type: 'MMO',
            accountDetails: {
                phoneNumber: params.phoneNumber,
                provider: params.provider
            }
        },
        amount: params.amount.toString(),
        currency: params.currency,
        clientReferenceId: params.clientReferenceId,
        customerMessage: params.customerMessage,
        metadata: params.metadata
    };
    const response = yield axios_1.default.post(buildGatewayUrl('/v2/payouts'), payload, {
        headers: yield createGatewayHeaders({
            'Content-Type': 'application/json'
        })
    });
    const parsed = parsePawaPayTransaction(response === null || response === void 0 ? void 0 : response.data);
    if (!parsed.reference) {
        parsed.reference = payload.payoutId;
    }
    return parsed;
});
const fetchGatewayTransaction = (reference, kind) => __awaiter(void 0, void 0, void 0, function* () {
    if (gatewayMode === 'paypack') {
        const response = yield axios_1.default.get(buildGatewayUrl(`/transactions/find/${encodeURIComponent(reference)}`), {
            headers: yield createGatewayHeaders({
                Accept: 'application/json'
            })
        });
        const parsed = parsePaypackTransaction(response === null || response === void 0 ? void 0 : response.data);
        return Object.assign(Object.assign({}, parsed), { reference: parsed.reference || reference });
    }
    if (gatewayMode === 'intouchpay') {
        const { requestTransactionId, providerTransactionId } = splitIntouchReference(reference);
        const timestamp = createIntouchTimestamp();
        const password = createIntouchPassword(timestamp);
        const payload = {
            username: INTOUCHPAY_USERNAME,
            accountno: INTOUCHPAY_ACCOUNT_NO,
            timestamp,
            password,
            requesttransactionid: requestTransactionId,
            transactionid: providerTransactionId
        };
        const response = yield axios_1.default.post(buildGatewayUrl('/gettransactionstatus/'), toFormBody(payload), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json'
            }
        });
        const parsed = parseIntouchTransaction(response === null || response === void 0 ? void 0 : response.data);
        return Object.assign(Object.assign({}, parsed), { reference: parsed.reference || combineIntouchReference(requestTransactionId, providerTransactionId) || reference });
    }
    const path = kind === 'deposit'
        ? `/v2/deposits/${encodeURIComponent(reference)}`
        : kind === 'payout'
            ? `/v2/payouts/${encodeURIComponent(reference)}`
            : `/v2/refunds/${encodeURIComponent(reference)}`;
    const response = yield axios_1.default.get(buildGatewayUrl(path), {
        headers: yield createGatewayHeaders()
    });
    const parsed = parsePawaPayTransaction(response === null || response === void 0 ? void 0 : response.data);
    return Object.assign(Object.assign({}, parsed), { reference: parsed.reference || reference });
});
const getGatewayBalance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth()) {
            return res.status(500).json({ message: 'Payment gateway is not configured' });
        }
        if (gatewayMode !== 'intouchpay') {
            return res.status(501).json({
                message: `Balance inquiry is currently implemented for IntouchPay only. Active gateway: ${gatewayMode}`
            });
        }
        const timestamp = createIntouchTimestamp();
        const password = createIntouchPassword(timestamp);
        const payload = {
            username: INTOUCHPAY_USERNAME,
            accountno: INTOUCHPAY_ACCOUNT_NO,
            timestamp,
            password
        };
        const response = yield axios_1.default.post(buildGatewayUrl('/getbalance/'), toFormBody(payload), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json'
            }
        });
        const data = (response === null || response === void 0 ? void 0 : response.data) || {};
        const balance = toNumber(data.balance, 0);
        const success = Boolean(data.success);
        return res.json({
            gateway: gatewayMode,
            success,
            balance,
            raw: data
        });
    }
    catch (error) {
        console.error('Get gateway balance failed:', ((_b = error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message || error);
        return res.status(400).json({
            message: 'Failed to query gateway balance',
            debug: extractErrorMessage(error)
        });
    }
});
exports.getGatewayBalance = getGatewayBalance;
const getWalletOverview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const limit = Number.isFinite(Number(req.query.limit))
            ? Math.min(Math.max(Math.floor(Number(req.query.limit)), 1), 100)
            : 30;
        const payments = yield prisma_1.default.payment.findMany({
            where: {
                employerId: userId
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                transactionId: true,
                amount: true,
                currency: true,
                status: true,
                type: true,
                createdAt: true,
                maidId: true
            }
        });
        const allSuccessful = yield prisma_1.default.payment.findMany({
            where: {
                employerId: userId,
                status: 'SUCCESSFUL'
            },
            select: {
                type: true,
                amount: true
            }
        });
        let availableBalance = 0;
        for (const item of allSuccessful) {
            availableBalance += getWalletDelta(item.type, item.amount);
        }
        // Ensure balance never goes negative - min balance is 0
        availableBalance = Math.max(0, availableBalance);
        let pendingIn = 0;
        let pendingOut = 0;
        for (const item of payments) {
            if (!isPendingStatus(item.status))
                continue;
            const delta = getWalletDelta(item.type, item.amount);
            if (delta > 0)
                pendingIn += delta;
            if (delta < 0)
                pendingOut += Math.abs(delta);
        }
        const transactions = payments.map((item) => {
            const direction = walletDirectionFromType(item.type);
            const titleMap = {
                DEPOSIT: 'Wallet Deposit',
                PAYOUT: 'Wallet Withdrawal',
                REFUND: 'Refund',
                PROFILE_UNLOCK: 'Maid Profile Unlock',
                JOB_POSTING: 'Job Posting Fee'
            };
            const normalizedType = normalizeStatus(item.type);
            return {
                id: item.id,
                transactionId: item.transactionId,
                amount: Number(item.amount || 0),
                currency: String(item.currency || 'RWF').toUpperCase(),
                status: normalizeStatus(item.status) || 'UNKNOWN',
                type: normalizedType,
                direction,
                title: titleMap[normalizedType] || normalizedType.replace(/_/g, ' '),
                createdAt: item.createdAt,
                maidId: item.maidId
            };
        });
        return res.json({
            summary: {
                availableBalance: Number(availableBalance.toFixed(2)),
                pendingIn: Number(pendingIn.toFixed(2)),
                pendingOut: Number(pendingOut.toFixed(2)),
                currency: 'RWF'
            },
            transactions
        });
    }
    catch (error) {
        console.error('Failed to fetch wallet overview:', error);
        return res.status(500).json({ message: 'Failed to fetch wallet overview' });
    }
});
exports.getWalletOverview = getWalletOverview;
const updatePaymentStatus = (txRef_1, status_1, ...args_1) => __awaiter(void 0, [txRef_1, status_1, ...args_1], void 0, function* (txRef, status, metadata = {}) {
    try {
        const existing = yield prisma_1.default.payment.findUnique({ where: { transactionId: txRef } });
        if (!existing) {
            console.warn(`⚠️ Webhook received for unknown transaction reference: ${txRef}`);
            return;
        }
        console.log(`📝 Updating payment ${txRef}: ${existing.status} → ${status} (type=${existing.type})`);
        yield prisma_1.default.payment.update({
            where: { transactionId: txRef },
            data: Object.assign(Object.assign({ status: toPaymentStatus(status), 
                // CRITICAL: Always preserve type field for balance calculation
                type: existing.type || 'UNKNOWN' }, ((metadata === null || metadata === void 0 ? void 0 : metadata.amount) !== undefined ? { amount: toNumber(metadata.amount, existing.amount) } : {})), ((metadata === null || metadata === void 0 ? void 0 : metadata.currency) ? { currency: String(metadata.currency) } : {}))
        });
        if (toPaymentStatus(status) === 'SUCCESSFUL') {
            console.log(`✅ Payment ${txRef} marked as SUCCESSFUL - balance should update now`);
        }
    }
    catch (error) {
        console.error(`❌ Failed to update payment status for ${txRef}:`, error);
    }
});
const initiateDeposit = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth()) {
            return res.status(500).json({ message: 'Payment gateway is not configured' });
        }
        const { amount, currency = 'RWF', email, fullName, phone, phoneNumber, provider, maidId, preAuthorisationCode, customerMessage, clientReferenceId, metadata } = req.body;
        const parsedAmount = sanitizeAmount(amount);
        if (!parsedAmount || !email || !fullName) {
            return res.status(400).json({ message: 'Missing required fields: amount, email, fullName' });
        }
        const safeCurrency = normalizeCurrency(currency);
        let payerPhoneNumber = normalizePhoneForCurrency(phoneNumber || phone, safeCurrency);
        let payerProvider = String(provider || DEFAULT_DEPOSIT_PROVIDER || '').trim();
        if (gatewayMode === 'pawapay' && payerPhoneNumber) {
            const prediction = yield predictPawaPayProviderAndPhone(payerPhoneNumber);
            if (prediction === null || prediction === void 0 ? void 0 : prediction.phoneNumber)
                payerPhoneNumber = prediction.phoneNumber;
            if (!payerProvider && (prediction === null || prediction === void 0 ? void 0 : prediction.provider))
                payerProvider = prediction.provider;
        }
        if (!payerPhoneNumber) {
            return res.status(400).json({ message: 'Missing required payer field: phoneNumber' });
        }
        if (gatewayMode === 'pawapay' && !payerProvider) {
            return res.status(400).json({ message: 'Missing required payer field for PawaPay: provider' });
        }
        const safeClientReferenceId = String(clientReferenceId || createTxRef('deposit', userId));
        const fallbackMessage = 'Unlock profile';
        const safeCustomerMessage = String(customerMessage || fallbackMessage).trim();
        const normalizedCustomerMessage = safeCustomerMessage.length >= 4
            ? safeCustomerMessage.slice(0, 22)
            : fallbackMessage;
        const providerData = yield initiateGatewayDeposit({
            amount: parsedAmount,
            currency: safeCurrency,
            phoneNumber: payerPhoneNumber,
            provider: payerProvider,
            preAuthorisationCode: preAuthorisationCode ? String(preAuthorisationCode) : undefined,
            clientReferenceId: safeClientReferenceId,
            customerMessage: normalizedCustomerMessage,
            metadata: Array.isArray(metadata)
                ? metadata
                : [
                    { employerId: String(userId) },
                    ...(maidId ? [{ maidId: String(maidId) }] : []),
                    { customerId: String(email), isPII: true }
                ]
        });
        const txRef = providerData.reference || safeClientReferenceId;
        const providerStatus = toPaymentStatus(providerData.status);
        const payment = yield upsertPaymentByReference({
            transactionId: txRef,
            employerId: userId,
            maidId: maidId ? Number(maidId) : null,
            amount: parsedAmount,
            currency: safeCurrency,
            status: providerStatus,
            type: 'DEPOSIT'
        });
        if (isFailedStatus(providerStatus)) {
            const providerMessage = extractProviderStatusMessage(providerData.raw);
            return res.status(400).json({
                message: providerMessage
                    ? `Payment request failed: ${providerMessage}`
                    : 'Payment request was rejected by the provider',
                status: providerStatus
            });
        }
        const momoPromptLikely = gatewayMode === 'paypack'
            ? PAYPACK_WEBHOOK_MODE === 'production'
            : gatewayMode === 'pawapay'
                ? !isSandboxEnvironment()
                : gatewayMode === 'intouchpay'
                    ? !isSandboxEnvironment()
                    : false;
        return res.json({
            paymentId: payment.id,
            tx_ref: txRef,
            depositId: txRef,
            amount: parsedAmount,
            currency: safeCurrency,
            sandbox: isSandboxEnvironment(),
            gateway: gatewayMode,
            paypackWebhookMode: gatewayMode === 'paypack' ? PAYPACK_WEBHOOK_MODE : null,
            momoPromptLikely,
            transactionFound: providerData.exists !== false,
            providerUsed: payerProvider || null,
            phoneNumberUsed: payerPhoneNumber,
            callback_url: DEPOSIT_CALLBACK_URL,
            clientReferenceId: safeClientReferenceId,
            deposit: providerData.raw,
            customer: {
                email,
                name: fullName,
                phone: payerPhoneNumber
            }
        });
    }
    catch (error) {
        console.error('Deposit initiation failed:', ((_b = error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message || error);
        return res.status(400).json({
            message: 'Failed to initiate deposit',
            debug: extractErrorMessage(error)
        });
    }
});
exports.initiateDeposit = initiateDeposit;
const initiatePayout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth()) {
            return res.status(500).json({ message: 'Payment gateway is not configured' });
        }
        const { amount, currency = 'RWF', phoneNumber, provider, account_number, account_bank, customerMessage, clientReferenceId, metadata, maidId } = req.body;
        const parsedAmount = sanitizeAmount(amount);
        if (!parsedAmount) {
            return res.status(400).json({ message: 'Missing required payout field: amount' });
        }
        const availableBalance = yield getWalletBalanceForUser(userId);
        if (parsedAmount > availableBalance) {
            return res.status(400).json({
                message: 'Insufficient wallet balance for this withdrawal',
                availableBalance: Number(availableBalance.toFixed(2)),
                requestedAmount: Number(parsedAmount.toFixed(2)),
                currency: normalizeCurrency(currency)
            });
        }
        const safeCurrency = normalizeCurrency(currency);
        const recipientPhoneNumber = normalizePhoneForCurrency(phoneNumber || account_number, safeCurrency);
        const recipientProvider = String(provider || account_bank || DEFAULT_PAYOUT_PROVIDER || '').trim();
        if (!recipientPhoneNumber) {
            return res.status(400).json({ message: 'Missing required payout field: phoneNumber' });
        }
        if (gatewayMode === 'pawapay' && !recipientProvider) {
            return res.status(400).json({ message: 'Missing required payout field for PawaPay: provider' });
        }
        const safeClientReferenceId = String(clientReferenceId || createTxRef('payout', userId));
        const fallbackMessage = 'Maid payout';
        const safeCustomerMessage = String(customerMessage || fallbackMessage).trim();
        const normalizedCustomerMessage = safeCustomerMessage.length >= 4
            ? safeCustomerMessage.slice(0, 22)
            : fallbackMessage;
        const providerData = yield initiateGatewayPayout({
            amount: parsedAmount,
            currency: safeCurrency,
            phoneNumber: recipientPhoneNumber,
            provider: recipientProvider,
            clientReferenceId: safeClientReferenceId,
            customerMessage: normalizedCustomerMessage,
            metadata: Array.isArray(metadata)
                ? metadata
                : [{ employerId: String(userId) }, ...(maidId ? [{ maidId: String(maidId) }] : [])]
        });
        const txRef = providerData.reference || safeClientReferenceId;
        const payment = yield upsertPaymentByReference({
            transactionId: txRef,
            employerId: userId,
            maidId: maidId ? Number(maidId) : null,
            amount: parsedAmount,
            currency: safeCurrency,
            status: toPaymentStatus(providerData.status),
            type: 'PAYOUT'
        });
        return res.json({
            paymentId: payment.id,
            tx_ref: txRef,
            payoutId: txRef,
            payout: providerData.raw,
            callback_url: PAYOUT_CALLBACK_URL
        });
    }
    catch (error) {
        console.error('Payout initiation failed:', ((_b = error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message || error);
        return res.status(400).json({
            message: 'Failed to initiate payout',
            debug: extractErrorMessage(error)
        });
    }
});
exports.initiatePayout = initiatePayout;
const initiateRefund = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth()) {
            return res.status(500).json({ message: 'Payment gateway is not configured' });
        }
        if (gatewayMode === 'paypack' || gatewayMode === 'intouchpay') {
            return res.status(501).json({
                message: `${gatewayMode === 'paypack' ? 'PayPack' : 'IntouchPay'} refund endpoint is not available in this integration`
            });
        }
        const { transaction_id, depositId, amount, currency = 'RWF', clientReferenceId, metadata } = req.body;
        const targetDepositId = String(depositId || transaction_id || '').trim();
        if (!targetDepositId) {
            return res.status(400).json({ message: 'Missing required field: depositId' });
        }
        const safeCurrency = normalizeCurrency(currency);
        const parsedAmount = amount !== undefined && amount !== null ? sanitizeAmount(amount) : null;
        const safeClientReferenceId = String(clientReferenceId || createTxRef('refund', userId));
        const refundId = String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.refundId) || safeClientReferenceId || createProviderId());
        const payload = {
            refundId,
            depositId: targetDepositId,
            currency: safeCurrency,
            clientReferenceId: safeClientReferenceId,
            metadata: Array.isArray(metadata) ? metadata : [{ employerId: String(userId) }, { depositId: targetDepositId }]
        };
        if (parsedAmount)
            payload.amount = parsedAmount.toString();
        const response = yield axios_1.default.post(buildGatewayUrl('/v2/refunds'), payload, {
            headers: yield createGatewayHeaders({
                'Content-Type': 'application/json'
            })
        });
        const providerData = parsePawaPayTransaction(response === null || response === void 0 ? void 0 : response.data);
        const txRef = providerData.reference || refundId;
        const payment = yield upsertPaymentByReference({
            transactionId: txRef,
            employerId: userId,
            amount: parsedAmount || 0,
            currency: safeCurrency,
            status: toPaymentStatus(providerData.status),
            type: 'REFUND'
        });
        return res.json({
            paymentId: payment.id,
            refund_reference: txRef,
            refundId: txRef,
            refund: providerData.raw,
            callback_url: REFUND_CALLBACK_URL
        });
    }
    catch (error) {
        console.error('Refund initiation failed:', ((_c = error.response) === null || _c === void 0 ? void 0 : _c.data) || error.message || error);
        return res.status(400).json({
            message: 'Failed to initiate refund',
            debug: extractErrorMessage(error)
        });
    }
});
exports.initiateRefund = initiateRefund;
const handlePawaPayWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        console.log(`📥 Webhook received from ${gatewayMode}:`, {
            headers: req.headers,
            body: req.body
        });
        if (!isWebhookValid(req)) {
            console.warn('⚠️ Invalid payment webhook signature');
            return res.status(401).json({ message: 'Invalid webhook signature' });
        }
        const event = req.body || {};
        const data = event.jsonpayload || event.data || event;
        const intouchRequestId = String(data.requesttransactionid || data.requestTransactionId || '').trim();
        const intouchTransactionId = String(data.transactionid || data.referenceid || data.referenceId || '').trim();
        const txRef = String(data.ref
            || data.tx_ref
            || data.reference
            || data.depositId
            || data.payoutId
            || data.refundId
            || combineIntouchReference(intouchRequestId, intouchTransactionId)
            || intouchRequestId
            || data.id
            || '').trim();
        const status = gatewayMode === 'intouchpay'
            ? intouchStatusFromResponse(data.status, data.responsecode)
            : String(data.status || event.status || event.kind || event.event || 'UNKNOWN');
        const amount = toNumber((_c = (_a = data.amount) !== null && _a !== void 0 ? _a : (_b = data.currency) === null || _b === void 0 ? void 0 : _b.amount) !== null && _c !== void 0 ? _c : 0);
        const currency = String(data.currency || 'RWF');
        console.log(`✅ Webhook parsed - txRef=${txRef}, status=${status}, amount=${amount}`);
        if (txRef) {
            yield updatePaymentStatus(txRef, status, {
                amount: amount || undefined,
                currency: currency || undefined
            });
            console.log(`✅ Payment status updated for txRef=${txRef}`);
        }
        else {
            console.warn('⚠️ No transaction reference found in webhook payload');
        }
        return res.json({ status: 'success' });
    }
    catch (error) {
        console.error('❌ Webhook handling failed:', ((_d = error.response) === null || _d === void 0 ? void 0 : _d.data) || error.message || error);
        return res.status(500).json({ message: 'Failed to handle webhook', debug: extractErrorMessage(error) });
    }
});
exports.handlePawaPayWebhook = handlePawaPayWebhook;
const verifyProfileUnlock = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const employerId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!employerId)
            return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth()) {
            return res.status(500).json({ message: 'Payment gateway is not configured' });
        }
        const { transaction_id, maidId } = req.body;
        if (!transaction_id || !maidId) {
            return res.status(400).json({ message: 'Missing transaction_id or maidId' });
        }
        const verificationId = String(transaction_id).trim();
        const maidIdNumber = Number(maidId);
        if (!verificationId || Number.isNaN(maidIdNumber)) {
            return res.status(400).json({ message: 'Invalid transaction_id or maidId' });
        }
        const existingUnlock = yield prisma_1.default.unlockedProfile.findUnique({
            where: {
                employerId_maidId: {
                    employerId,
                    maidId: maidIdNumber
                }
            }
        });
        if (existingUnlock) {
            return res.json({
                message: 'Profile already unlocked',
                unlock: existingUnlock
            });
        }
        const existingPayment = yield prisma_1.default.payment.findUnique({
            where: { transactionId: verificationId }
        });
        if (existingPayment && existingPayment.employerId !== employerId) {
            return res.status(403).json({ message: 'Transaction does not belong to this user' });
        }
        const finalizeUnlock = (amount, currency) => __awaiter(void 0, void 0, void 0, function* () {
            return prisma_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
                const payment = existingPayment
                    ? yield tx.payment.update({
                        where: { id: existingPayment.id },
                        data: {
                            maidId: maidIdNumber,
                            amount: Number(amount) || existingPayment.amount,
                            currency: String(currency || existingPayment.currency || 'RWF'),
                            status: 'SUCCESSFUL',
                            type: 'PROFILE_UNLOCK'
                        }
                    })
                    : yield tx.payment.create({
                        data: {
                            transactionId: verificationId,
                            employerId,
                            maidId: maidIdNumber,
                            amount: Number(amount) || 0,
                            currency: String(currency || 'RWF'),
                            status: 'SUCCESSFUL',
                            type: 'PROFILE_UNLOCK'
                        }
                    });
                const unlock = yield tx.unlockedProfile.upsert({
                    where: {
                        employerId_maidId: {
                            employerId,
                            maidId: maidIdNumber
                        }
                    },
                    update: {},
                    create: {
                        employerId,
                        maidId: maidIdNumber
                    }
                });
                return { payment, unlock };
            }));
        });
        const sendUnlockNotifications = () => __awaiter(void 0, void 0, void 0, function* () {
            const maid = yield prisma_1.default.user.findUnique({ where: { id: maidIdNumber } });
            yield (0, notificationController_1.createNotification)(employerId, 'Payment Successful', `You have successfully unlocked ${(maid === null || maid === void 0 ? void 0 : maid.fullName) || 'a profile'}. You can now view their full contact details and identification documents.`, 'PAYMENT');
            yield (0, notificationController_1.createNotification)(maidIdNumber, 'New Interest in your Profile', 'An employer has unlocked your contact details and may contact you soon!', 'SYSTEM');
        });
        if (existingPayment && isSuccessfulStatus(existingPayment.status)) {
            const { payment, unlock } = yield finalizeUnlock(existingPayment.amount, existingPayment.currency);
            yield sendUnlockNotifications();
            return res.json({
                message: 'Profile unlocked successfully',
                unlock,
                paymentId: payment.id
            });
        }
        let gatewayTx = null;
        let providerError = null;
        try {
            gatewayTx = yield fetchGatewayTransaction(verificationId, 'deposit');
        }
        catch (directError) {
            providerError = directError;
        }
        if (!gatewayTx) {
            const existingStatus = normalizeStatus(existingPayment === null || existingPayment === void 0 ? void 0 : existingPayment.status);
            if (existingStatus === 'PENDING') {
                return res.status(400).json({
                    message: 'Payment is still pending confirmation. Complete payment and try again.'
                });
            }
            return res.status(400).json({
                message: 'Unable to verify payment yet. Please try again shortly.',
                debug: extractErrorMessage(providerError)
            });
        }
        const providerStatus = toPaymentStatus(gatewayTx.status);
        if (existingPayment) {
            yield prisma_1.default.payment.update({
                where: { id: existingPayment.id },
                data: {
                    status: providerStatus,
                    amount: gatewayTx.amount || existingPayment.amount,
                    currency: gatewayTx.currency || existingPayment.currency
                }
            }).catch(() => null);
        }
        if (!isSuccessfulStatus(providerStatus)) {
            const providerMessage = extractProviderStatusMessage(gatewayTx.raw);
            return res.status(400).json({
                message: providerStatus === 'PENDING'
                    ? 'Payment is still pending confirmation. Please try again.'
                    : providerMessage
                        ? `Payment verification failed: ${providerMessage}`
                        : 'Payment verification failed',
                status: providerStatus || 'UNKNOWN',
                providerMessage: providerMessage || null
            });
        }
        const { payment, unlock } = yield finalizeUnlock(gatewayTx.amount || (existingPayment === null || existingPayment === void 0 ? void 0 : existingPayment.amount) || 0, gatewayTx.currency || (existingPayment === null || existingPayment === void 0 ? void 0 : existingPayment.currency) || 'RWF');
        yield sendUnlockNotifications();
        return res.json({
            message: 'Profile unlocked successfully',
            unlock,
            paymentId: payment.id
        });
    }
    catch (error) {
        console.error('Payment Verification Error:', ((_b = error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message || error);
        return res.status(500).json({
            message: 'Internal server error during verification',
            debug: extractErrorMessage(error)
        });
    }
});
exports.verifyProfileUnlock = verifyProfileUnlock;
const verifyJobPostingPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const employerId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!employerId)
            return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth()) {
            return res.status(500).json({ message: 'Payment gateway is not configured' });
        }
        const verificationId = String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.transaction_id) || '').trim();
        const salaryMax = sanitizeAmount((_c = req.body) === null || _c === void 0 ? void 0 : _c.salaryMax);
        if (!verificationId || !salaryMax) {
            return res.status(400).json({ message: 'Missing required fields: transaction_id, salaryMax' });
        }
        const requiredAmount = calculateJobPostingFee(salaryMax);
        const existingPayment = yield prisma_1.default.payment.findUnique({
            where: { transactionId: verificationId }
        });
        if (existingPayment && existingPayment.employerId !== employerId) {
            return res.status(403).json({ message: 'Transaction does not belong to this user' });
        }
        if ((existingPayment === null || existingPayment === void 0 ? void 0 : existingPayment.type) === 'JOB_POSTING_USED') {
            return res.status(400).json({ message: 'This payment has already been used to post a job.' });
        }
        if ((existingPayment === null || existingPayment === void 0 ? void 0 : existingPayment.type)
            && !['DEPOSIT', 'JOB_POSTING', 'JOB_POSTING_USED'].includes(existingPayment.type)) {
            return res.status(400).json({
                message: `This transaction is reserved for ${existingPayment.type} and cannot be used for job posting.`
            });
        }
        const ensureJobPostingPayment = (amount, currency) => __awaiter(void 0, void 0, void 0, function* () {
            return upsertPaymentByReference({
                transactionId: verificationId,
                employerId,
                amount: Number(amount) || 0,
                currency: String(currency || (existingPayment === null || existingPayment === void 0 ? void 0 : existingPayment.currency) || 'RWF'),
                status: 'SUCCESSFUL',
                type: 'JOB_POSTING'
            });
        });
        if (existingPayment && isSuccessfulStatus(existingPayment.status)) {
            if (Number(existingPayment.amount || 0) + 0.001 < requiredAmount) {
                return res.status(400).json({
                    message: `Payment amount is too low for this job post. Required ${requiredAmount} RWF, paid ${Number(existingPayment.amount || 0)} RWF.`,
                    status: 'UNDERPAID',
                    requiredAmount,
                    paidAmount: Number(existingPayment.amount || 0)
                });
            }
            yield prisma_1.default.payment.update({
                where: { id: existingPayment.id },
                data: { type: 'JOB_POSTING' }
            }).catch(() => null);
            return res.json({
                message: 'Job posting payment verified',
                transaction_id: verificationId,
                requiredAmount,
                paidAmount: Number(existingPayment.amount || 0)
            });
        }
        let gatewayTx = null;
        let providerError = null;
        try {
            gatewayTx = yield fetchGatewayTransaction(verificationId, 'deposit');
        }
        catch (directError) {
            providerError = directError;
        }
        if (!gatewayTx) {
            const existingStatus = normalizeStatus(existingPayment === null || existingPayment === void 0 ? void 0 : existingPayment.status);
            if (existingStatus === 'PENDING') {
                return res.status(400).json({
                    message: 'Payment is still pending confirmation. Complete payment and try again.'
                });
            }
            return res.status(400).json({
                message: 'Unable to verify payment yet. Please try again shortly.',
                debug: extractErrorMessage(providerError)
            });
        }
        const providerStatus = toPaymentStatus(gatewayTx.status);
        if (existingPayment) {
            yield prisma_1.default.payment.update({
                where: { id: existingPayment.id },
                data: {
                    status: providerStatus,
                    amount: gatewayTx.amount || existingPayment.amount,
                    currency: gatewayTx.currency || existingPayment.currency
                }
            }).catch(() => null);
        }
        if (!isSuccessfulStatus(providerStatus)) {
            const providerMessage = extractProviderStatusMessage(gatewayTx.raw);
            return res.status(400).json({
                message: providerStatus === 'PENDING'
                    ? 'Payment is still pending confirmation. Please try again.'
                    : providerMessage
                        ? `Payment verification failed: ${providerMessage}`
                        : 'Payment verification failed',
                status: providerStatus || 'UNKNOWN',
                providerMessage: providerMessage || null
            });
        }
        const paidAmount = Number(gatewayTx.amount || (existingPayment === null || existingPayment === void 0 ? void 0 : existingPayment.amount) || 0);
        const paidCurrency = gatewayTx.currency || (existingPayment === null || existingPayment === void 0 ? void 0 : existingPayment.currency) || 'RWF';
        yield ensureJobPostingPayment(paidAmount, paidCurrency);
        if (paidAmount + 0.001 < requiredAmount) {
            return res.status(400).json({
                message: `Payment amount is too low for this job post. Required ${requiredAmount} RWF, paid ${paidAmount} RWF.`,
                status: 'UNDERPAID',
                requiredAmount,
                paidAmount
            });
        }
        return res.json({
            message: 'Job posting payment verified',
            transaction_id: verificationId,
            requiredAmount,
            paidAmount
        });
    }
    catch (error) {
        console.error('Job posting payment verification failed:', ((_d = error.response) === null || _d === void 0 ? void 0 : _d.data) || error.message || error);
        return res.status(500).json({
            message: 'Internal server error during job payment verification',
            debug: extractErrorMessage(error)
        });
    }
});
exports.verifyJobPostingPayment = verifyJobPostingPayment;
const ensurePaymentAccess = (userId, transactionId, res) => __awaiter(void 0, void 0, void 0, function* () {
    const payment = yield prisma_1.default.payment.findUnique({ where: { transactionId } });
    if (payment && payment.employerId !== userId) {
        res.status(403).json({ message: 'Transaction does not belong to this user' });
        return null;
    }
    return payment;
});
const getDepositStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth())
            return res.status(500).json({ message: 'Payment gateway is not configured' });
        const depositId = String(req.params.depositId || '').trim();
        if (!depositId)
            return res.status(400).json({ message: 'Missing depositId' });
        const payment = yield ensurePaymentAccess(userId, depositId, res);
        if (payment === null)
            return;
        console.log(`📱 Checking deposit status for txRef=${depositId}, current status=${payment.status}`);
        const gatewayTx = yield fetchGatewayTransaction(depositId, 'deposit');
        const providerStatus = toPaymentStatus(gatewayTx.status);
        console.log(`🔄 Gateway reports status=${providerStatus} for deposit ${depositId}`);
        // Only update if status changed
        if (payment && providerStatus !== payment.status) {
            console.log(`✅ Updating deposit ${depositId} from ${payment.status} to ${providerStatus}`);
            yield prisma_1.default.payment.update({
                where: { id: payment.id },
                data: {
                    status: providerStatus,
                    amount: gatewayTx.amount || payment.amount,
                    currency: gatewayTx.currency || payment.currency,
                    // CRITICAL: Preserve type to ensure balance calculation includes this payment
                    type: payment.type || 'DEPOSIT'
                }
            }).catch(() => null);
        }
        return res.json({
            depositId,
            localStatus: payment.status,
            providerStatus,
            updated: providerStatus !== payment.status,
            amount: payment.amount,
            currency: payment.currency,
            deposit: gatewayTx.raw
        });
    }
    catch (error) {
        console.error('❌ Get deposit status failed:', ((_b = error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message || error);
        return res.status(400).json({
            message: 'Failed to fetch deposit status',
            debug: extractErrorMessage(error),
            gateway: gatewayMode
        });
    }
});
exports.getDepositStatus = getDepositStatus;
const resendDepositCallback = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth())
            return res.status(500).json({ message: 'Payment gateway is not configured' });
        const depositId = String(req.params.depositId || '').trim();
        if (!depositId)
            return res.status(400).json({ message: 'Missing depositId' });
        const payment = yield ensurePaymentAccess(userId, depositId, res);
        if (payment === null)
            return;
        if (gatewayMode === 'paypack' || gatewayMode === 'intouchpay') {
            return res.status(501).json({
                message: `${gatewayMode === 'paypack' ? 'PayPack' : 'IntouchPay'} does not support resend callback by transaction id`
            });
        }
        const response = yield axios_1.default.post(buildGatewayUrl(`/v2/deposits/resend-callback/${encodeURIComponent(depositId)}`), {}, {
            headers: yield createGatewayHeaders()
        });
        return res.json({
            depositId,
            result: response === null || response === void 0 ? void 0 : response.data
        });
    }
    catch (error) {
        console.error('Resend deposit callback failed:', ((_b = error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message || error);
        return res.status(400).json({
            message: 'Failed to resend deposit callback',
            debug: extractErrorMessage(error)
        });
    }
});
exports.resendDepositCallback = resendDepositCallback;
const getPayoutStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth())
            return res.status(500).json({ message: 'Payment gateway is not configured' });
        const payoutId = String(req.params.payoutId || '').trim();
        if (!payoutId)
            return res.status(400).json({ message: 'Missing payoutId' });
        const payment = yield ensurePaymentAccess(userId, payoutId, res);
        if (payment === null)
            return;
        const gatewayTx = yield fetchGatewayTransaction(payoutId, 'payout');
        const providerStatus = toPaymentStatus(gatewayTx.status);
        if (payment) {
            yield prisma_1.default.payment.update({
                where: { id: payment.id },
                data: {
                    status: providerStatus,
                    amount: gatewayTx.amount || payment.amount,
                    currency: gatewayTx.currency || payment.currency,
                    // CRITICAL: Preserve type to ensure balance calculation includes this payment
                    type: payment.type || 'PAYOUT'
                }
            }).catch(() => null);
        }
        return res.json({
            payoutId,
            status: providerStatus || null,
            payout: gatewayTx.raw
        });
    }
    catch (error) {
        console.error('Get payout status failed:', ((_b = error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message || error);
        return res.status(400).json({
            message: 'Failed to fetch payout status',
            debug: extractErrorMessage(error)
        });
    }
});
exports.getPayoutStatus = getPayoutStatus;
const getRefundStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth())
            return res.status(500).json({ message: 'Payment gateway is not configured' });
        if (gatewayMode === 'paypack' || gatewayMode === 'intouchpay') {
            return res.status(501).json({
                message: `${gatewayMode === 'paypack' ? 'PayPack' : 'IntouchPay'} refund status endpoint is not available in this integration`
            });
        }
        const refundId = String(req.params.refundId || '').trim();
        if (!refundId)
            return res.status(400).json({ message: 'Missing refundId' });
        const payment = yield ensurePaymentAccess(userId, refundId, res);
        if (payment === null)
            return;
        const gatewayTx = yield fetchGatewayTransaction(refundId, 'refund');
        const providerStatus = toPaymentStatus(gatewayTx.status);
        if (payment) {
            yield prisma_1.default.payment.update({
                where: { id: payment.id },
                data: {
                    status: providerStatus,
                    amount: gatewayTx.amount || payment.amount,
                    currency: gatewayTx.currency || payment.currency,
                    // CRITICAL: Preserve type to ensure balance calculation includes this payment
                    type: payment.type || 'REFUND'
                }
            }).catch(() => null);
        }
        return res.json({
            refundId,
            status: providerStatus || null,
            refund: gatewayTx.raw
        });
    }
    catch (error) {
        console.error('Get refund status failed:', ((_b = error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message || error);
        return res.status(400).json({
            message: 'Failed to fetch refund status',
            debug: extractErrorMessage(error)
        });
    }
});
exports.getRefundStatus = getRefundStatus;
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
        return res.json({ unlocked: !!unlock });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Failed to check unlock status' });
    }
});
exports.checkUnlockStatus = checkUnlockStatus;
