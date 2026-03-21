export const error429Status = { status: 429, message: 'Rate limit exceeded' };

export const error429StatusCode = { statusCode: 429, message: 'Rate limit exceeded' };

export const error429ResponseStatus = { response: { status: 429 }, message: 'Rate limit exceeded' };

export const errorRateLimitedCode = { code: 'rate_limited', message: 'Rate limited' };

export const errorRateLimitType = { type: 'rate_limit_error', message: 'Rate limit error' };

export const errorWithRetryAfterSeconds = {
  status: 429,
  headers: { 'retry-after': '30' },
};

export const errorWithRetryAfterDate = {
  status: 429,
  headers: { 'retry-after': new Date(Date.now() + 30000).toUTCString() },
};

export const errorWithHeadersObject = {
  status: 429,
  headers: {
    get: (name: string) => (name === 'retry-after' ? '60' : null),
  },
};

export const error400 = { status: 400, message: 'Bad request' };

export const error500 = { status: 500, message: 'Server error' };

export const errorAuth = { status: 401, message: 'Unauthorized' };
