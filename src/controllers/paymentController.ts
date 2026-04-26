import { Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from './notificationController';

type GatewayMode = 'paypack' | 'pawapay' | 'intouchpay' | 'none';
type GatewayKind = 'deposit' | 'payout' | 'refund';
type GatewayTransaction = {
    reference: string;
    status: string;
    amount: number;
    currency: string;
    raw: any;
    exists?: boolean;
};

const APP_URL = process.env.APP_URL || 'http://localhost:8000';

const PAYPACK_APPLICATION_ID = process.env.PAYPACK_APPLICATION_ID || process.env.PAYPACK_CLIENT_ID;
const PAYPACK_APPLICATION_SECRET = process.env.PAYPACK_APPLICATION_SECRET || process.env.PAYPACK_CLIENT_SECRET;
const normalizePaypackBaseUrl = (value: unknown) => {
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
const PAYPACK_WEBHOOK_MODE = String(
    process.env.PAYPACK_WEBHOOK_MODE || (APP_URL.includes('localhost') ? 'development' : 'production')
).toLowerCase();

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

const resolveGatewayMode = (): GatewayMode => {
    if (requestedGatewayMode === 'paypack') return hasPaypackCredentials ? 'paypack' : 'none';
    if (requestedGatewayMode === 'pawapay') return hasPawaPayCredentials ? 'pawapay' : 'none';
    if (requestedGatewayMode === 'intouchpay') return hasIntouchPayCredentials ? 'intouchpay' : 'none';
    if (requestedGatewayMode === 'none') return 'none';

    if (hasPaypackCredentials) return 'paypack';
    if (hasPawaPayCredentials) return 'pawapay';
    if (hasIntouchPayCredentials) return 'intouchpay';
    return 'none';
};

const gatewayMode: GatewayMode = resolveGatewayMode();
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
    if (gatewayMode === 'pawapay') return /sandbox/i.test(PAWAPAY_BASE_URL);
    if (gatewayMode === 'intouchpay') return INTOUCHPAY_SANDBOX;
    return false;
};
const createTxRef = (prefix: string, userId: number | string) => `${prefix}_${userId}_${Date.now()}`;
const createProviderId = () => crypto.randomUUID();
const createIdempotencyKey = (seed: string) => crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32);

const normalizeStatus = (status: unknown) => String(status || '').trim().toUpperCase();
const SUCCESS_STATUSES = new Set(['SUCCESSFUL', 'SUCCESS', 'COMPLETED']);
const FAILED_STATUSES = new Set(['FAILED', 'FAILURE', 'REJECTED', 'CANCELLED', 'CANCELED', 'ERROR']);
const PENDING_STATUSES = new Set(['PENDING', 'PROCESSING', 'CREATED', 'INITIATED']);
const isSuccessfulStatus = (status: unknown) => SUCCESS_STATUSES.has(normalizeStatus(status));
const isFailedStatus = (status: unknown) => FAILED_STATUSES.has(normalizeStatus(status));
const JOB_POST_FEE_PERCENTAGE_RAW = Number(process.env.JOB_POST_FEE_PERCENTAGE || '0.1');
const JOB_POST_FEE_PERCENTAGE = Number.isFinite(JOB_POST_FEE_PERCENTAGE_RAW) && JOB_POST_FEE_PERCENTAGE_RAW > 0
    ? JOB_POST_FEE_PERCENTAGE_RAW
    : 0.1;
const calculateJobPostingFee = (salaryMax: number) => Math.ceil(salaryMax * JOB_POST_FEE_PERCENTAGE);
const toPaymentStatus = (status: unknown) => {
    const normalized = normalizeStatus(status);
    if (!normalized) return 'PENDING';
    if (SUCCESS_STATUSES.has(normalized)) return 'SUCCESSFUL';
    if (FAILED_STATUSES.has(normalized)) return 'FAILED';
    if (PENDING_STATUSES.has(normalized)) return 'PENDING';
    return normalized;
};

const INTOUCHPAY_SUCCESS_CODES = new Set(['01', '2001']);
const INTOUCHPAY_PENDING_CODES = new Set(['1000']);
const INTOUCHPAY_REFERENCE_SEPARATOR = '|';

const createIntouchTimestamp = () => {
    const iso = new Date().toISOString().replace(/\D/g, '');
    return iso.slice(0, 14);
};

const createIntouchPassword = (timestamp: string) => {
    const secret = `${INTOUCHPAY_USERNAME}${INTOUCHPAY_ACCOUNT_NO}${INTOUCHPAY_PARTNER_PASSWORD}${timestamp}`;
    return crypto.createHash('sha256').update(secret).digest('hex');
};

const normalizeIntouchResponseCode = (code: unknown) => String(code ?? '').trim().toUpperCase();

const intouchStatusFromResponse = (status: unknown, responseCode: unknown) => {
    const normalizedStatus = normalizeStatus(status);
    if (normalizedStatus) {
        if (SUCCESS_STATUSES.has(normalizedStatus)) return normalizedStatus;
        if (PENDING_STATUSES.has(normalizedStatus)) return normalizedStatus;
    }

    const code = normalizeIntouchResponseCode(responseCode);
    if (INTOUCHPAY_SUCCESS_CODES.has(code)) return 'SUCCESSFUL';
    if (INTOUCHPAY_PENDING_CODES.has(code)) return 'PENDING';
    if (code) return 'FAILED';
    return normalizedStatus || 'PENDING';
};

const combineIntouchReference = (requestTransactionId: unknown, providerTransactionId: unknown) => {
    const requestId = String(requestTransactionId || '').trim();
    const providerId = String(providerTransactionId || '').trim();
    if (!requestId) return providerId;
    if (!providerId) return requestId;
    return `${requestId}${INTOUCHPAY_REFERENCE_SEPARATOR}${providerId}`;
};

const splitIntouchReference = (reference: string) => {
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

const sanitizeAmount = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const toNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeCurrency = (value: unknown, fallback = 'RWF') => String(value || fallback).toUpperCase();
const digitsOnly = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizePhoneForCurrency = (value: unknown, currency: string) => {
    let phone = digitsOnly(value);
    if (!phone) return '';

    // Rwanda convenience: convert 07XXXXXXXX to 2507XXXXXXXX
    if (currency === 'RWF' && phone.startsWith('0') && phone.length >= 10) {
        phone = `250${phone.slice(1)}`;
    }
    return phone;
};

const buildGatewayUrl = (path: string) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (gatewayMode === 'paypack') return `${PAYPACK_BASE_URL}${normalizedPath}`;
    if (gatewayMode === 'pawapay') return `${PAWAPAY_BASE_URL}${normalizedPath}`;
    return `${INTOUCHPAY_BASE_URL}${normalizedPath}`;
};

const getRawBodyBuffer = (req: Request) => {
    const raw = (req as any).rawBody;
    if (Buffer.isBuffer(raw)) return raw;
    if (typeof raw === 'string') return Buffer.from(raw);
    return Buffer.from(JSON.stringify(req.body || {}));
};

const isWebhookValid = (req: Request) => {
    if (gatewayMode === 'paypack') {
        const signature = String(req.headers['x-paypack-signature'] || '').trim();
        if (!PAYPACK_WEBHOOK_SECRET_HASH || !signature) return true;

        const expectedSignature = crypto
            .createHmac('sha256', PAYPACK_WEBHOOK_SECRET_HASH)
            .update(getRawBodyBuffer(req))
            .digest('base64');
        return signature === expectedSignature;
    }

    if (gatewayMode === 'pawapay') {
        const signature = String(req.headers['verif-hash'] || '');
        if (!PAWAPAY_WEBHOOK_SECRET_HASH || !signature) return true;

        const payload = JSON.stringify(req.body || {});
        const expectedSignature = crypto.createHmac('sha256', PAWAPAY_WEBHOOK_SECRET_HASH).update(payload).digest('hex');
        return signature === expectedSignature;
    }

    return true;
};

type PaypackTokenCache = {
    accessToken: string | null;
    refreshToken: string | null;
    expiresAtMs: number;
};

const paypackTokenCache: PaypackTokenCache = {
    accessToken: null,
    refreshToken: null,
    expiresAtMs: 0
};

const parsePaypackExpiryMs = (expires: unknown) => {
    const value = Number(expires);
    if (!Number.isFinite(value) || value <= 0) return Date.now() + (14 * 60 * 1000);

    // Handle both epoch timestamps and relative seconds.
    if (value > 10_000_000_000) return value - 60_000;
    if (value > 1_000_000_000) return (value * 1000) - 60_000;
    return Date.now() + (value * 1000) - 60_000;
};

const authorizePaypack = async () => {
    if (!PAYPACK_APPLICATION_ID || !PAYPACK_APPLICATION_SECRET) {
        throw new Error('PayPack credentials are not configured');
    }

    const response = await axios.post(
        buildGatewayUrl('/auth/agents/authorize'),
        {
            client_id: PAYPACK_APPLICATION_ID,
            client_secret: PAYPACK_APPLICATION_SECRET
        },
        {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            }
        }
    ) as any;

    const data = response?.data || {};
    const access = String(data.access || '').trim();
    if (!access) {
        throw new Error('PayPack authorize response did not include an access token');
    }

    paypackTokenCache.accessToken = access;
    paypackTokenCache.refreshToken = String(data.refresh || '').trim() || null;
    paypackTokenCache.expiresAtMs = parsePaypackExpiryMs(data.expires);
    return access;
};

const refreshPaypackAccessToken = async () => {
    const refreshToken = paypackTokenCache.refreshToken;
    if (!refreshToken) return null;

    try {
        const response = await axios.get(
            buildGatewayUrl(`/auth/agents/refresh/${encodeURIComponent(refreshToken)}`),
            {
                headers: { Accept: 'application/json' }
            }
        ) as any;

        const data = response?.data || {};
        const access = String(data.access || '').trim();
        if (!access) return null;

        paypackTokenCache.accessToken = access;
        paypackTokenCache.refreshToken = String(data.refresh || refreshToken).trim() || refreshToken;
        paypackTokenCache.expiresAtMs = parsePaypackExpiryMs(data.expires);
        return access;
    } catch {
        return null;
    }
};

const getPaypackAccessToken = async () => {
    if (paypackTokenCache.accessToken && Date.now() < paypackTokenCache.expiresAtMs) {
        return paypackTokenCache.accessToken;
    }

    const refreshed = await refreshPaypackAccessToken();
    if (refreshed) return refreshed;
    return authorizePaypack();
};

const createGatewayAuthHeader = async () => {
    if (gatewayMode === 'paypack') {
        const accessToken = await getPaypackAccessToken();
        return { Authorization: `Bearer ${accessToken}` };
    }

    if (gatewayMode === 'pawapay' && PAWAPAY_API_KEY) {
        return { Authorization: `Bearer ${PAWAPAY_API_KEY}` };
    }

    return {};
};

const createGatewayHeaders = async (additional: Record<string, string> = {}) => {
    const auth = await createGatewayAuthHeader();
    return { ...auth, ...additional };
};

const parsePawaPayTransaction = (payload: any): GatewayTransaction => {
    const root = Array.isArray(payload) ? payload[0] : (payload?.data || payload || {});
    const reference = String(
        root.depositId
        || root.payoutId
        || root.refundId
        || root.clientReferenceId
        || root.tx_ref
        || root.id
        || ''
    ).trim();
    const amount = toNumber(root.amount ?? root.requestedAmount?.amount ?? 0);
    const currency = String(root.currency || root.requestedAmount?.currency || 'RWF');
    const status = String(root.status || root.result?.status || root.depositStatus || root.payoutStatus || root.refundStatus || '');

    return {
        reference,
        amount,
        currency,
        status,
        raw: root
    };
};

const parsePaypackTransaction = (payload: any): GatewayTransaction => {
    const root = Array.isArray(payload) ? payload[0] : (payload || {});
    const firstEvent = Array.isArray(root.transactions) && root.transactions.length > 0 ? root.transactions[0] : null;
    const firstEventData = firstEvent?.data || firstEvent || {};
    const data = root.data || {};

    const reference = String(
        data.ref
        || root.ref
        || firstEventData.ref
        || firstEventData.reference
        || ''
    ).trim();
    const amount = toNumber(data.amount ?? root.amount ?? firstEventData.amount ?? 0);
    const status = String(data.status || root.status || firstEventData.status || '');

    return {
        reference,
        amount,
        currency: 'RWF',
        status,
        raw: root
    };
};

const parseIntouchTransaction = (payload: any): GatewayTransaction => {
    const root = payload?.jsonpayload || payload?.data || payload || {};
    const responseCode = normalizeIntouchResponseCode(root.responsecode);
    const reference = combineIntouchReference(
        root.requesttransactionid || root.requestTransactionId,
        root.transactionid || root.referenceid || root.referenceId
    );
    const status = intouchStatusFromResponse(root.status, responseCode);
    const amount = toNumber(root.amount ?? root.requestedamount ?? 0);
    const currency = normalizeCurrency(root.currency || 'RWF');

    return {
        reference,
        amount,
        currency,
        status,
        raw: root
    };
};

const toFormBody = (payload: Record<string, unknown>) => {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
        if (value === undefined || value === null) continue;
        form.append(key, String(value));
    }
    return form.toString();
};

const extractErrorMessage = (error: any) => {
    const intouchPayload = error?.response?.data?.jsonpayload || error?.response?.data;
    const intouchCode = intouchPayload?.responsecode;
    const intouchStatusDesc = intouchPayload?.statusdesc;
    if (intouchCode || intouchStatusDesc) {
        return [intouchCode ? `code=${intouchCode}` : null, intouchStatusDesc || intouchPayload?.message]
            .filter(Boolean)
            .join(' ');
    }

    const providerMessage = error?.response?.data?.failureReason?.failureMessage
        || error?.response?.data?.message
        || error?.response?.data?.error
        || error?.message;

    if (typeof providerMessage === 'string') return providerMessage;
    return JSON.stringify(providerMessage || 'Unknown gateway error');
};

const extractProviderStatusMessage = (raw: any) => {
    const message = raw?.statusdesc
        || raw?.message
        || raw?.failureReason?.failureMessage
        || raw?.failureReason
        || '';
    return String(message || '').trim();
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const confirmPaypackTransaction = async (reference: string): Promise<GatewayTransaction | null> => {
    const delaysMs = [0, 700, 1500];
    for (const delayMs of delaysMs) {
        if (delayMs > 0) await sleep(delayMs);
        try {
            const response = await axios.get(
                buildGatewayUrl(`/transactions/find/${encodeURIComponent(reference)}`),
                {
                    headers: await createGatewayHeaders({
                        Accept: 'application/json'
                    })
                }
            ) as any;
            const parsed = parsePaypackTransaction(response?.data);
            if (parsed.reference) return parsed;
        } catch (error: any) {
            if (error?.response?.status === 404) continue;
            throw error;
        }
    }
    return null;
};

const predictPawaPayProviderAndPhone = async (phoneNumber: string) => {
    if (gatewayMode !== 'pawapay' || !phoneNumber) return null;

    try {
        const response = await axios.post(
            buildGatewayUrl('/v2/predict-provider'),
            { phoneNumber },
            {
                headers: await createGatewayHeaders({
                    'Content-Type': 'application/json'
                })
            }
        ) as any;

        const data = Array.isArray(response?.data) ? response.data[0] : response?.data;
        return {
            phoneNumber: digitsOnly(data?.phoneNumber || phoneNumber),
            provider: String(data?.provider || '').trim()
        };
    } catch (error: any) {
        console.warn('Provider prediction failed:', error?.response?.data || error?.message || error);
        return null;
    }
};

const upsertPaymentByReference = async (params: {
    transactionId: string;
    employerId: number;
    maidId?: number | null;
    amount: number;
    currency: string;
    status: string;
    type: string;
}) => {
    const existing = await prisma.payment.findUnique({
        where: { transactionId: params.transactionId }
    });

    if (existing) {
        if (existing.employerId !== params.employerId) {
            throw new Error('Transaction reference belongs to a different employer');
        }

        return prisma.payment.update({
            where: { id: existing.id },
            data: {
                maidId: params.maidId ?? existing.maidId,
                amount: params.amount || existing.amount,
                currency: params.currency || existing.currency,
                status: params.status || existing.status,
                type: params.type || existing.type
            }
        });
    }

    return prisma.payment.create({
        data: {
            transactionId: params.transactionId,
            employerId: params.employerId,
            maidId: params.maidId ?? undefined,
            amount: params.amount,
            currency: params.currency,
            status: params.status,
            type: params.type
        }
    });
};

const initiateGatewayDeposit = async (params: {
    amount: number;
    currency: string;
    phoneNumber: string;
    provider: string;
    preAuthorisationCode?: string;
    clientReferenceId: string;
    customerMessage: string;
    metadata: any[];
}) => {
    if (gatewayMode === 'paypack') {
        const response = await axios.post(
            buildGatewayUrl('/transactions/cashin'),
            {
                amount: params.amount,
                number: params.phoneNumber
            },
            {
                headers: await createGatewayHeaders({
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'Idempotency-Key': createIdempotencyKey(params.clientReferenceId),
                    'X-Webhook-Mode': PAYPACK_WEBHOOK_MODE
                })
            }
        ) as any;

        const parsed = parsePaypackTransaction(response?.data);
        if (!parsed.reference) {
            throw new Error('PayPack did not return a transaction reference');
        }

        const confirmed = await confirmPaypackTransaction(parsed.reference);
        if (confirmed) {
            return {
                ...confirmed,
                amount: confirmed.amount || parsed.amount || params.amount,
                currency: params.currency,
                exists: true
            };
        }

        return {
            ...parsed,
            amount: parsed.amount || params.amount,
            currency: params.currency,
            exists: false
        };
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

        const response = await axios.post(
            buildGatewayUrl('/requestpayment/'),
            toFormBody(payload),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json'
                }
            }
        ) as any;

        const parsed = parseIntouchTransaction(response?.data);
        return {
            ...parsed,
            reference: parsed.reference || requestTransactionId,
            amount: parsed.amount || params.amount,
            currency: params.currency,
            exists: true
        };
    }

    const payload: any = {
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

    const response = await axios.post(
        buildGatewayUrl('/v2/deposits'),
        payload,
        {
            headers: await createGatewayHeaders({
                'Content-Type': 'application/json'
            })
        }
    ) as any;

    const parsed = parsePawaPayTransaction(response?.data);
    if (!parsed.reference) {
        parsed.reference = payload.depositId;
    }
    return parsed;
};

const initiateGatewayPayout = async (params: {
    amount: number;
    currency: string;
    phoneNumber: string;
    provider: string;
    clientReferenceId: string;
    customerMessage: string;
    metadata: any[];
}) => {
    if (gatewayMode === 'paypack') {
        const response = await axios.post(
            buildGatewayUrl('/transactions/cashout'),
            {
                amount: params.amount,
                number: params.phoneNumber
            },
            {
                headers: await createGatewayHeaders({
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'Idempotency-Key': createIdempotencyKey(params.clientReferenceId),
                    'X-Webhook-Mode': PAYPACK_WEBHOOK_MODE
                })
            }
        ) as any;

        const parsed = parsePaypackTransaction(response?.data);
        if (!parsed.reference) {
            throw new Error('PayPack did not return a payout reference');
        }

        return {
            ...parsed,
            amount: parsed.amount || params.amount,
            currency: params.currency
        };
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

        const response = await axios.post(
            buildGatewayUrl('/requestdeposit/'),
            toFormBody(payload),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json'
                }
            }
        ) as any;

        const parsed = parseIntouchTransaction(response?.data);
        return {
            ...parsed,
            reference: parsed.reference || requestTransactionId,
            amount: parsed.amount || params.amount,
            currency: params.currency
        };
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

    const response = await axios.post(
        buildGatewayUrl('/v2/payouts'),
        payload,
        {
            headers: await createGatewayHeaders({
                'Content-Type': 'application/json'
            })
        }
    ) as any;

    const parsed = parsePawaPayTransaction(response?.data);
    if (!parsed.reference) {
        parsed.reference = payload.payoutId;
    }
    return parsed;
};

const fetchGatewayTransaction = async (reference: string, kind: GatewayKind): Promise<GatewayTransaction> => {
    if (gatewayMode === 'paypack') {
        const response = await axios.get(
            buildGatewayUrl(`/transactions/find/${encodeURIComponent(reference)}`),
            {
                headers: await createGatewayHeaders({
                    Accept: 'application/json'
                })
            }
        ) as any;

        const parsed = parsePaypackTransaction(response?.data);
        return {
            ...parsed,
            reference: parsed.reference || reference
        };
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

        const response = await axios.post(
            buildGatewayUrl('/gettransactionstatus/'),
            toFormBody(payload),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json'
                }
            }
        ) as any;

        const parsed = parseIntouchTransaction(response?.data);
        return {
            ...parsed,
            reference: parsed.reference || combineIntouchReference(requestTransactionId, providerTransactionId) || reference
        };
    }

    const path = kind === 'deposit'
        ? `/v2/deposits/${encodeURIComponent(reference)}`
        : kind === 'payout'
            ? `/v2/payouts/${encodeURIComponent(reference)}`
            : `/v2/refunds/${encodeURIComponent(reference)}`;

    const response = await axios.get(buildGatewayUrl(path), {
        headers: await createGatewayHeaders()
    }) as any;
    const parsed = parsePawaPayTransaction(response?.data);
    return {
        ...parsed,
        reference: parsed.reference || reference
    };
};

export const getGatewayBalance = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
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

        const response = await axios.post(
            buildGatewayUrl('/getbalance/'),
            toFormBody(payload),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json'
                }
            }
        ) as any;

        const data = response?.data || {};
        const balance = toNumber(data.balance, 0);
        const success = Boolean(data.success);

        return res.json({
            gateway: gatewayMode,
            success,
            balance,
            raw: data
        });
    } catch (error: any) {
        console.error('Get gateway balance failed:', error.response?.data || error.message || error);
        return res.status(400).json({
            message: 'Failed to query gateway balance',
            debug: extractErrorMessage(error)
        });
    }
};

const updatePaymentStatus = async (txRef: string, status: string, metadata: any = {}) => {
    try {
        const existing = await prisma.payment.findUnique({ where: { transactionId: txRef } });
        if (!existing) {
            console.warn('Webhook received for unknown transaction reference:', txRef);
            return;
        }

        await prisma.payment.update({
            where: { transactionId: txRef },
            data: {
                status: toPaymentStatus(status),
                ...(metadata?.amount !== undefined ? { amount: toNumber(metadata.amount, existing.amount) } : {}),
                ...(metadata?.currency ? { currency: String(metadata.currency) } : {})
            }
        });
    } catch (error) {
        console.error('Failed to update payment status from webhook:', error);
    }
};

export const initiateDeposit = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth()) {
            return res.status(500).json({ message: 'Payment gateway is not configured' });
        }

        const {
            amount,
            currency = 'RWF',
            email,
            fullName,
            phone,
            phoneNumber,
            provider,
            maidId,
            preAuthorisationCode,
            customerMessage,
            clientReferenceId,
            metadata
        } = req.body;

        const parsedAmount = sanitizeAmount(amount);
        if (!parsedAmount || !email || !fullName) {
            return res.status(400).json({ message: 'Missing required fields: amount, email, fullName' });
        }

        const safeCurrency = normalizeCurrency(currency);
        let payerPhoneNumber = normalizePhoneForCurrency(phoneNumber || phone, safeCurrency);
        let payerProvider = String(provider || DEFAULT_DEPOSIT_PROVIDER || '').trim();

        if (gatewayMode === 'pawapay' && payerPhoneNumber) {
            const prediction = await predictPawaPayProviderAndPhone(payerPhoneNumber);
            if (prediction?.phoneNumber) payerPhoneNumber = prediction.phoneNumber;
            if (!payerProvider && prediction?.provider) payerProvider = prediction.provider;
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

        const providerData = await initiateGatewayDeposit({
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
        const payment = await upsertPaymentByReference({
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
    } catch (error: any) {
        console.error('Deposit initiation failed:', error.response?.data || error.message || error);
        return res.status(400).json({
            message: 'Failed to initiate deposit',
            debug: extractErrorMessage(error)
        });
    }
};

export const initiatePayout = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth()) {
            return res.status(500).json({ message: 'Payment gateway is not configured' });
        }

        const {
            amount,
            currency = 'RWF',
            phoneNumber,
            provider,
            account_number,
            account_bank,
            customerMessage,
            clientReferenceId,
            metadata,
            maidId
        } = req.body;

        const parsedAmount = sanitizeAmount(amount);
        if (!parsedAmount) {
            return res.status(400).json({ message: 'Missing required payout field: amount' });
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

        const providerData = await initiateGatewayPayout({
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
        const payment = await upsertPaymentByReference({
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
    } catch (error: any) {
        console.error('Payout initiation failed:', error.response?.data || error.message || error);
        return res.status(400).json({
            message: 'Failed to initiate payout',
            debug: extractErrorMessage(error)
        });
    }
};

export const initiateRefund = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth()) {
            return res.status(500).json({ message: 'Payment gateway is not configured' });
        }

        if (gatewayMode === 'paypack' || gatewayMode === 'intouchpay') {
            return res.status(501).json({
                message: `${gatewayMode === 'paypack' ? 'PayPack' : 'IntouchPay'} refund endpoint is not available in this integration`
            });
        }

        const {
            transaction_id,
            depositId,
            amount,
            currency = 'RWF',
            clientReferenceId,
            metadata
        } = req.body;
        const targetDepositId = String(depositId || transaction_id || '').trim();
        if (!targetDepositId) {
            return res.status(400).json({ message: 'Missing required field: depositId' });
        }

        const safeCurrency = normalizeCurrency(currency);
        const parsedAmount = amount !== undefined && amount !== null ? sanitizeAmount(amount) : null;
        const safeClientReferenceId = String(clientReferenceId || createTxRef('refund', userId));
        const refundId = String(req.body?.refundId || safeClientReferenceId || createProviderId());
        const payload: any = {
            refundId,
            depositId: targetDepositId,
            currency: safeCurrency,
            clientReferenceId: safeClientReferenceId,
            metadata: Array.isArray(metadata) ? metadata : [{ employerId: String(userId) }, { depositId: targetDepositId }]
        };
        if (parsedAmount) payload.amount = parsedAmount.toString();

        const response = await axios.post(
            buildGatewayUrl('/v2/refunds'),
            payload,
            {
                headers: await createGatewayHeaders({
                    'Content-Type': 'application/json'
                })
            }
        ) as any;
        const providerData = parsePawaPayTransaction(response?.data);
        const txRef = providerData.reference || refundId;

        const payment = await upsertPaymentByReference({
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
    } catch (error: any) {
        console.error('Refund initiation failed:', error.response?.data || error.message || error);
        return res.status(400).json({
            message: 'Failed to initiate refund',
            debug: extractErrorMessage(error)
        });
    }
};

export const handlePawaPayWebhook = async (req: Request, res: Response) => {
    try {
        if (!isWebhookValid(req)) {
            console.warn('Invalid payment webhook signature');
            return res.status(401).json({ message: 'Invalid webhook signature' });
        }

        const event = req.body || {};
        const data = event.jsonpayload || event.data || event;
        const intouchRequestId = String(data.requesttransactionid || data.requestTransactionId || '').trim();
        const intouchTransactionId = String(data.transactionid || data.referenceid || data.referenceId || '').trim();
        const txRef = String(
            data.ref
            || data.tx_ref
            || data.reference
            || data.depositId
            || data.payoutId
            || data.refundId
            || combineIntouchReference(intouchRequestId, intouchTransactionId)
            || intouchRequestId
            || data.id
            || ''
        ).trim();
        const status = gatewayMode === 'intouchpay'
            ? intouchStatusFromResponse(data.status, data.responsecode)
            : String(data.status || event.status || event.kind || event.event || 'UNKNOWN');
        const amount = toNumber(data.amount ?? data.currency?.amount ?? 0);
        const currency = String(data.currency || 'RWF');

        if (txRef) {
            await updatePaymentStatus(txRef, status, {
                amount: amount || undefined,
                currency: currency || undefined
            });
        }

        return res.json({ status: 'success' });
    } catch (error: any) {
        console.error('Webhook handling failed:', error.response?.data || error.message || error);
        return res.status(500).json({ message: 'Failed to handle webhook', debug: extractErrorMessage(error) });
    }
};

export const verifyProfileUnlock = async (req: AuthRequest, res: Response) => {
    try {
        const employerId = req.user?.userId;
        if (!employerId) return res.status(401).json({ message: 'Unauthorized' });
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

        const existingUnlock = await prisma.unlockedProfile.findUnique({
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

        const existingPayment = await prisma.payment.findUnique({
            where: { transactionId: verificationId }
        });
        if (existingPayment && existingPayment.employerId !== employerId) {
            return res.status(403).json({ message: 'Transaction does not belong to this user' });
        }

        const finalizeUnlock = async (amount: number, currency: string) => {
            return prisma.$transaction(async (tx) => {
                const payment = existingPayment
                    ? await tx.payment.update({
                        where: { id: existingPayment.id },
                        data: {
                            maidId: maidIdNumber,
                            amount: Number(amount) || existingPayment.amount,
                            currency: String(currency || existingPayment.currency || 'RWF'),
                            status: 'SUCCESSFUL',
                            type: 'PROFILE_UNLOCK'
                        }
                    })
                    : await tx.payment.create({
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

                const unlock = await tx.unlockedProfile.upsert({
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
            });
        };

        const sendUnlockNotifications = async () => {
            const maid = await prisma.user.findUnique({ where: { id: maidIdNumber } });

            await createNotification(
                employerId,
                'Payment Successful',
                `You have successfully unlocked ${maid?.fullName || 'a profile'}. You can now view their full contact details and identification documents.`,
                'PAYMENT'
            );

            await createNotification(
                maidIdNumber,
                'New Interest in your Profile',
                'An employer has unlocked your contact details and may contact you soon!',
                'SYSTEM'
            );
        };

        if (existingPayment && isSuccessfulStatus(existingPayment.status)) {
            const { payment, unlock } = await finalizeUnlock(existingPayment.amount, existingPayment.currency);
            await sendUnlockNotifications();
            return res.json({
                message: 'Profile unlocked successfully',
                unlock,
                paymentId: payment.id
            });
        }

        let gatewayTx: GatewayTransaction | null = null;
        let providerError: any = null;

        try {
            gatewayTx = await fetchGatewayTransaction(verificationId, 'deposit');
        } catch (directError: any) {
            providerError = directError;
        }

        if (!gatewayTx) {
            const existingStatus = normalizeStatus(existingPayment?.status);
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
            await prisma.payment.update({
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

        const { payment, unlock } = await finalizeUnlock(
            gatewayTx.amount || existingPayment?.amount || 0,
            gatewayTx.currency || existingPayment?.currency || 'RWF'
        );
        await sendUnlockNotifications();

        return res.json({
            message: 'Profile unlocked successfully',
            unlock,
            paymentId: payment.id
        });
    } catch (error: any) {
        console.error('Payment Verification Error:', error.response?.data || error.message || error);
        return res.status(500).json({
            message: 'Internal server error during verification',
            debug: extractErrorMessage(error)
        });
    }
};

export const verifyJobPostingPayment = async (req: AuthRequest, res: Response) => {
    try {
        const employerId = req.user?.userId;
        if (!employerId) return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth()) {
            return res.status(500).json({ message: 'Payment gateway is not configured' });
        }

        const verificationId = String(req.body?.transaction_id || '').trim();
        const salaryMax = sanitizeAmount(req.body?.salaryMax);
        if (!verificationId || !salaryMax) {
            return res.status(400).json({ message: 'Missing required fields: transaction_id, salaryMax' });
        }

        const requiredAmount = calculateJobPostingFee(salaryMax);
        const existingPayment = await prisma.payment.findUnique({
            where: { transactionId: verificationId }
        });

        if (existingPayment && existingPayment.employerId !== employerId) {
            return res.status(403).json({ message: 'Transaction does not belong to this user' });
        }
        if (existingPayment?.type === 'JOB_POSTING_USED') {
            return res.status(400).json({ message: 'This payment has already been used to post a job.' });
        }
        if (
            existingPayment?.type
            && !['DEPOSIT', 'JOB_POSTING', 'JOB_POSTING_USED'].includes(existingPayment.type)
        ) {
            return res.status(400).json({
                message: `This transaction is reserved for ${existingPayment.type} and cannot be used for job posting.`
            });
        }

        const ensureJobPostingPayment = async (amount: number, currency: string) => {
            return upsertPaymentByReference({
                transactionId: verificationId,
                employerId,
                amount: Number(amount) || 0,
                currency: String(currency || existingPayment?.currency || 'RWF'),
                status: 'SUCCESSFUL',
                type: 'JOB_POSTING'
            });
        };

        if (existingPayment && isSuccessfulStatus(existingPayment.status)) {
            if (Number(existingPayment.amount || 0) + 0.001 < requiredAmount) {
                return res.status(400).json({
                    message: `Payment amount is too low for this job post. Required ${requiredAmount} RWF, paid ${Number(existingPayment.amount || 0)} RWF.`,
                    status: 'UNDERPAID',
                    requiredAmount,
                    paidAmount: Number(existingPayment.amount || 0)
                });
            }

            await prisma.payment.update({
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

        let gatewayTx: GatewayTransaction | null = null;
        let providerError: any = null;

        try {
            gatewayTx = await fetchGatewayTransaction(verificationId, 'deposit');
        } catch (directError: any) {
            providerError = directError;
        }

        if (!gatewayTx) {
            const existingStatus = normalizeStatus(existingPayment?.status);
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
            await prisma.payment.update({
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

        const paidAmount = Number(gatewayTx.amount || existingPayment?.amount || 0);
        const paidCurrency = gatewayTx.currency || existingPayment?.currency || 'RWF';
        await ensureJobPostingPayment(paidAmount, paidCurrency);

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
    } catch (error: any) {
        console.error('Job posting payment verification failed:', error.response?.data || error.message || error);
        return res.status(500).json({
            message: 'Internal server error during job payment verification',
            debug: extractErrorMessage(error)
        });
    }
};

const ensurePaymentAccess = async (userId: number, transactionId: string, res: Response) => {
    const payment = await prisma.payment.findUnique({ where: { transactionId } });
    if (payment && payment.employerId !== userId) {
        res.status(403).json({ message: 'Transaction does not belong to this user' });
        return null;
    }
    return payment;
};

export const getDepositStatus = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth()) return res.status(500).json({ message: 'Payment gateway is not configured' });

        const depositId = String(req.params.depositId || '').trim();
        if (!depositId) return res.status(400).json({ message: 'Missing depositId' });

        const payment = await ensurePaymentAccess(userId, depositId, res);
        if (payment === null) return;

        const gatewayTx = await fetchGatewayTransaction(depositId, 'deposit');
        const providerStatus = toPaymentStatus(gatewayTx.status);

        if (payment) {
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: providerStatus,
                    amount: gatewayTx.amount || payment.amount,
                    currency: gatewayTx.currency || payment.currency
                }
            }).catch(() => null);
        }

        return res.json({
            depositId,
            status: providerStatus || null,
            deposit: gatewayTx.raw
        });
    } catch (error: any) {
        console.error('Get deposit status failed:', error.response?.data || error.message || error);
        return res.status(400).json({
            message: 'Failed to fetch deposit status',
            debug: extractErrorMessage(error)
        });
    }
};

export const resendDepositCallback = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth()) return res.status(500).json({ message: 'Payment gateway is not configured' });

        const depositId = String(req.params.depositId || '').trim();
        if (!depositId) return res.status(400).json({ message: 'Missing depositId' });

        const payment = await ensurePaymentAccess(userId, depositId, res);
        if (payment === null) return;

        if (gatewayMode === 'paypack' || gatewayMode === 'intouchpay') {
            return res.status(501).json({
                message: `${gatewayMode === 'paypack' ? 'PayPack' : 'IntouchPay'} does not support resend callback by transaction id`
            });
        }

        const response = await axios.post(
            buildGatewayUrl(`/v2/deposits/resend-callback/${encodeURIComponent(depositId)}`),
            {},
            {
                headers: await createGatewayHeaders()
            }
        ) as any;

        return res.json({
            depositId,
            result: response?.data
        });
    } catch (error: any) {
        console.error('Resend deposit callback failed:', error.response?.data || error.message || error);
        return res.status(400).json({
            message: 'Failed to resend deposit callback',
            debug: extractErrorMessage(error)
        });
    }
};

export const getPayoutStatus = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth()) return res.status(500).json({ message: 'Payment gateway is not configured' });

        const payoutId = String(req.params.payoutId || '').trim();
        if (!payoutId) return res.status(400).json({ message: 'Missing payoutId' });

        const payment = await ensurePaymentAccess(userId, payoutId, res);
        if (payment === null) return;

        const gatewayTx = await fetchGatewayTransaction(payoutId, 'payout');
        const providerStatus = toPaymentStatus(gatewayTx.status);

        if (payment) {
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: providerStatus,
                    amount: gatewayTx.amount || payment.amount,
                    currency: gatewayTx.currency || payment.currency
                }
            }).catch(() => null);
        }

        return res.json({
            payoutId,
            status: providerStatus || null,
            payout: gatewayTx.raw
        });
    } catch (error: any) {
        console.error('Get payout status failed:', error.response?.data || error.message || error);
        return res.status(400).json({
            message: 'Failed to fetch payout status',
            debug: extractErrorMessage(error)
        });
    }
};

export const getRefundStatus = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        if (!hasGatewayAuth()) return res.status(500).json({ message: 'Payment gateway is not configured' });

        if (gatewayMode === 'paypack' || gatewayMode === 'intouchpay') {
            return res.status(501).json({
                message: `${gatewayMode === 'paypack' ? 'PayPack' : 'IntouchPay'} refund status endpoint is not available in this integration`
            });
        }

        const refundId = String(req.params.refundId || '').trim();
        if (!refundId) return res.status(400).json({ message: 'Missing refundId' });

        const payment = await ensurePaymentAccess(userId, refundId, res);
        if (payment === null) return;

        const gatewayTx = await fetchGatewayTransaction(refundId, 'refund');
        const providerStatus = toPaymentStatus(gatewayTx.status);

        if (payment) {
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: providerStatus,
                    amount: gatewayTx.amount || payment.amount,
                    currency: gatewayTx.currency || payment.currency
                }
            }).catch(() => null);
        }

        return res.json({
            refundId,
            status: providerStatus || null,
            refund: gatewayTx.raw
        });
    } catch (error: any) {
        console.error('Get refund status failed:', error.response?.data || error.message || error);
        return res.status(400).json({
            message: 'Failed to fetch refund status',
            debug: extractErrorMessage(error)
        });
    }
};

export const checkUnlockStatus = async (req: AuthRequest, res: Response) => {
    try {
        const employerId = req.user?.userId;
        if (!employerId) return res.status(401).json({ message: 'Unauthorized' });

        const { maidId } = req.params;
        const unlock = await prisma.unlockedProfile.findUnique({
            where: {
                employerId_maidId: {
                    employerId,
                    maidId: Number(maidId)
                }
            }
        });

        return res.json({ unlocked: !!unlock });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Failed to check unlock status' });
    }
};
