// Upstash Redis REST client (native fetch only, no SDK dependency).
// Never logs tokens/URLs or raw provider error bodies.

const REQUEST_TIMEOUT_MS = 5000;

export function getRedisConfig() {
  const pairs = [
    [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN],
    [process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN]
  ];
  for (const [url, token] of pairs) {
    if (url && token && url.startsWith("https://")) return { url, token };
  }
  return null;
}

export function isRedisConfigured() {
  return getRedisConfig() !== null;
}

/**
 * @param {(string|number)[]} command
 * @returns {Promise<unknown>}
 */
export async function redisCommand(command) {
  const config = getRedisConfig();
  if (!config) throw new Error("redis_not_configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(command),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    });

    if (!res.ok) throw new Error("redis_http_error");

    const data = await res.json();
    if (data && typeof data === "object" && "error" in data && data.error) {
      throw new Error("redis_command_error");
    }
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

export async function redisEval(script, keys, args) {
  return redisCommand(["EVAL", script, String(keys.length), ...keys, ...args]);
}
