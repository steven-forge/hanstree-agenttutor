export declare function isRedisConfigured(): boolean;
export declare function redisCommand(command: (string | number)[]): Promise<unknown>;
export declare function redisEval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
export declare function getRedisConfig(): { url: string; token: string } | null;
