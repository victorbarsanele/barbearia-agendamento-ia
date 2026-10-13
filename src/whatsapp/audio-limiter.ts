export class AudioQueueFullError extends Error {
    readonly reason = 'queue_full' as const;

    constructor() {
        super('Fila de áudio cheia.');
        this.name = 'AudioQueueFullError';
    }
}

interface Waiter {
    resolve: (release: () => void) => void;
}

export class AudioLimiter {
    private active = 0;
    private readonly waiters: Waiter[] = [];

    constructor(
        private readonly maxConcurrency: number,
        private readonly maxQueue: number,
    ) {}

    acquire(): Promise<() => void> {
        if (this.active < this.maxConcurrency) {
            this.active += 1;
            return Promise.resolve(() => this.release());
        }

        if (this.waiters.length >= this.maxQueue) {
            return Promise.reject(new AudioQueueFullError());
        }

        return new Promise((resolve) => {
            this.waiters.push({ resolve });
        });
    }

    private release(): void {
        const next = this.waiters.shift();
        if (next) {
            next.resolve(() => this.release());
            return;
        }
        this.active -= 1;
    }
}
