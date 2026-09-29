/*
  Who a request comes from, as a rate-limit key. Vercel sets x-real-ip and x-forwarded-for
  itself (a client can't forge them there). An IPv6 address counts by its /64 network: one home
  or phone gets a whole /64, and could otherwise take a fresh address for every request.
*/

export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function ipKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip); // IPv4 written as IPv6
  if (mapped) return mapped[1];
  const [head, tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  const net = groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=[0-9a-f])/, ""));
  return `${net.join(":")}::/64`;
}

export const clientKey = (headers: Headers) => ipKey(clientIp(headers));
