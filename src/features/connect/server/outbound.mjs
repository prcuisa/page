import https from "node:https";
import { resolve4 } from "node:dns/promises";
import { isIP } from "node:net";
export function publicIPv4(ip) {
  if (isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export async function destination(raw) {
  const u = new URL(raw);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hash ||
    (u.port && u.port !== "443") ||
    raw.length > 2000
  )
    throw Error("UNSAFE_DESTINATION");
  const addresses = isIP(u.hostname)
    ? [u.hostname]
    : await resolve4(u.hostname);
  if (!addresses.length || !addresses.every(publicIPv4))
    throw Error("UNSAFE_DESTINATION");
  return { url: u, address: addresses[0] };
}
export async function pinnedAgent(raw) {
  const { url, address } = await destination(raw);
  return {
    url,
    agent: new https.Agent({
      keepAlive: false,
      lookup: (_host, options, cb) => {
        if (options?.all) cb(null, [{ address, family: 4 }]);
        else cb(null, address, 4);
      },
    }),
  };
}
export async function postSafe(raw, headers, body) {
  const { url, agent } = await pinnedAgent(raw);
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        agent,
        headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
        timeout: 10000,
      },
      (res) => {
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 65536) req.destroy(Error("RESPONSE_TOO_LARGE"));
        });
        res.on("end", () => {
          agent.destroy();
          resolve({ status: res.statusCode || 0 });
        });
      },
    );
    req.on("timeout", () => req.destroy(Error("TIMEOUT")));
    req.on("error", (e) => {
      agent.destroy();
      reject(e);
    });
    req.end(body);
  });
}
