export declare class TimeoutPromise<T> implements Promise<T> {
    private promise;
    private onTimeout;
    private timeout;
    constructor(ms: number, functor: (resolver: (value?: any) => void, rejector: (reason?: any) => void) => void, onTimeout?: () => void);
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2>;
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): Promise<T | TResult>;
    finally(onfinally?: (() => void) | undefined | null): Promise<T>;
    resetTimeout(ms: number): void;
    [Symbol.toStringTag]: string;
}
//# sourceMappingURL=timeoutPromise.d.ts.map