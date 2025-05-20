export interface RateLimiterStore {
  add: (hash: string, ttl: number) => number | Promise<number>;
  clear: () => void | Promise<void>;
}
