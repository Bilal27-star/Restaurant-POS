type QueueTask<T> = () => Promise<T>;

/**
 * Serializes async work (e.g. USB writes) so concurrent `invoke` calls do not interleave on one device.
 */
export class PrintQueue {
  private chain: Promise<void> = Promise.resolve();

  enqueue<T>(task: QueueTask<T>): Promise<T> {
    const run = this.chain.then(() => task());
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
