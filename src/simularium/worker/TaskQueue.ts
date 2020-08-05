interface QueueItem<T> {
    // this is the actual task and the T is the return type
    promise: () => Promise<T>;
    // value is of promise's type
    resolve: (value?: T | PromiseLike<T> | undefined) => void;
    // reason is really any
    reject: (reason?: unknown) => void;
}

const MAX_ACTIVE_WORKERS = 4;

export default class TaskQueue {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private queue: QueueItem<any>[] = [];
    private numActiveWorkers = 0;
    private toCancel: QueueItem<any>[] = [];
    private cancelRequested = false;

    // add a task to the queue and start it immediately if not too busy
    public enqueue<T>(promise: () => Promise<T>): Promise<T> {
        // we will defer the resolve/reject until the item
        // is dequeued and its inner promise is resolved
        return new Promise<T>((resolve, reject) => {
            this.queue.push({
                promise,
                resolve,
                reject,
            });
            this.dequeue();
        });
    }

    public getLength(): number {
        return this.queue.length;
    }
    public getNumActive(): number {
        return this.numActiveWorkers;
    }

    public stopAll(): void {
        this.cancelRequested = true;

        // take whatever is in the queue and append it to the toCancel list.
        // and make sure it is removed from queue
        this.toCancel = this.toCancel.concat(
            this.queue.splice(0, this.queue.length)
        );
    }

    private dequeue(): boolean {
        // if there is anything to cancel, remove and reject
        while (this.toCancel.length > 0) {
            const item = this.toCancel.pop();
            if (item) {
                item.reject("Cancelled");
            }
        }
        // if (this.cancelRequested) {
        //     while (this.queue.length > 0) {
        //         const item = this.queue.pop();
        //         if (item) {
        //             item.reject("Cancelled");
        //         }
        //     }
        //     this.cancelRequested = false;
        // }
        if (this.numActiveWorkers >= MAX_ACTIVE_WORKERS) {
            // too many workers; keeping in queue
            return false;
        }
        const item = this.queue.shift();
        if (!item) {
            return false;
        }
        try {
            // we will process from the queue.
            // increment the number of concurrent tasks happening.
            this.numActiveWorkers++;
            // run the task
            item.promise()
                .then(value => {
                    this.numActiveWorkers--;
                    item.resolve(value);
                    // as soon as I finish, check the queue for another task
                    this.dequeue();
                })
                .catch(err => {
                    this.numActiveWorkers--;
                    item.reject(err);
                    // as soon as I fail, check the queue for another task
                    this.dequeue();
                });
        } catch (err) {
            this.numActiveWorkers--;
            item.reject(err);
            // as soon as I fail, check the queue for another task
            this.dequeue();
        }
        return true;
    }
}
