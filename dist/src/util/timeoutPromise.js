var _a;
export class TimeoutPromise {
    constructor(ms, functor, onTimeout) {
        this[_a] = "TimeoutPromise";
        this.promise = new Promise((resolve, reject) => {
            this.onTimeout = () => {
                if (onTimeout) {
                    onTimeout();
                }
                reject(new Error("Timeout"));
            };
            this.timeout = setTimeout(() => {
                if (this.onTimeout) {
                    this.onTimeout();
                }
                else {
                    throw new Error("Timeout callback not set");
                }
            }, ms);
            functor((value) => {
                clearTimeout(this.timeout);
                resolve(value);
            }, (reason) => {
                clearTimeout(this.timeout);
                reject(reason);
            });
        });
    }
    then(onfulfilled, onrejected) {
        return this.promise.then(onfulfilled, onrejected);
    }
    catch(onrejected) {
        return this.promise.catch(onrejected);
    }
    finally(onfinally) {
        return this.promise.finally(onfinally);
    }
    resetTimeout(ms) {
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            if (this.onTimeout) {
                this.onTimeout();
            }
            else {
                throw new Error("Timeout callback not set");
            }
        }, ms);
    }
}
_a = Symbol.toStringTag;
//# sourceMappingURL=timeoutPromise.js.map