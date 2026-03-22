export declare const error429Status: {
    status: number;
    message: string;
};
export declare const error429StatusCode: {
    statusCode: number;
    message: string;
};
export declare const error429ResponseStatus: {
    response: {
        status: number;
    };
    message: string;
};
export declare const errorRateLimitedCode: {
    code: string;
    message: string;
};
export declare const errorRateLimitType: {
    type: string;
    message: string;
};
export declare const errorWithRetryAfterSeconds: {
    status: number;
    headers: {
        'retry-after': string;
    };
};
export declare const errorWithRetryAfterDate: {
    status: number;
    headers: {
        'retry-after': string;
    };
};
export declare const errorWithHeadersObject: {
    status: number;
    headers: {
        get: (name: string) => "60" | null;
    };
};
export declare const error400: {
    status: number;
    message: string;
};
export declare const error500: {
    status: number;
    message: string;
};
export declare const errorAuth: {
    status: number;
    message: string;
};
//# sourceMappingURL=mock-errors.d.ts.map