const queues = new Map<string, Promise<void>>();

export async function runExclusive<T>(
    key: string,
    fn: () => Promise<T>,
): Promise<T> {
    const previous = queues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const turn = new Promise<void>((resolve) => {
        release = resolve;
    });
    const chain = previous.then(() => turn);
    queues.set(key, chain);

    await previous;
    try {
        return await fn();
    } finally {
        release();
        if (queues.get(key) === chain) {
            queues.delete(key);
        }
    }
}

