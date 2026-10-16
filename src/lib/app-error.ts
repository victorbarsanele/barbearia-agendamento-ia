export class AppError extends Error {
    constructor(
        public readonly message: string,
        public readonly statusCode: number = 400,
        public readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'AppError';
    }
}
