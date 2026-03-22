"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorAuth = exports.error500 = exports.error400 = exports.errorWithHeadersObject = exports.errorWithRetryAfterDate = exports.errorWithRetryAfterSeconds = exports.errorRateLimitType = exports.errorRateLimitedCode = exports.error429ResponseStatus = exports.error429StatusCode = exports.error429Status = void 0;
exports.error429Status = { status: 429, message: 'Rate limit exceeded' };
exports.error429StatusCode = { statusCode: 429, message: 'Rate limit exceeded' };
exports.error429ResponseStatus = { response: { status: 429 }, message: 'Rate limit exceeded' };
exports.errorRateLimitedCode = { code: 'rate_limited', message: 'Rate limited' };
exports.errorRateLimitType = { type: 'rate_limit_error', message: 'Rate limit error' };
exports.errorWithRetryAfterSeconds = {
    status: 429,
    headers: { 'retry-after': '30' },
};
exports.errorWithRetryAfterDate = {
    status: 429,
    headers: { 'retry-after': new Date(Date.now() + 30000).toUTCString() },
};
exports.errorWithHeadersObject = {
    status: 429,
    headers: {
        get: (name) => (name === 'retry-after' ? '60' : null),
    },
};
exports.error400 = { status: 400, message: 'Bad request' };
exports.error500 = { status: 500, message: 'Server error' };
exports.errorAuth = { status: 401, message: 'Unauthorized' };
//# sourceMappingURL=mock-errors.js.map