// Rate-limit keys, and the middleware letting requests through when it can't check them.   npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest, type NextFetchEvent } from "next/server";
import { middleware } from "../../middleware";
import { clientIp, ipKey } from "./ip";

describe("ipKey", () => {
  it("keeps an IPv4 address as it is", () => {
    assert.equal(ipKey("203.0.113.7"), "203.0.113.7");
  });
  it("counts IPv6 by its /64 network", () => {
    assert.equal(ipKey("2a02:6680:1100:0042:1d3:4a5b:9ff:1"), "2a02:6680:1100:42::/64");
    assert.equal(ipKey("2A02:6680:1100:42:FFFF::1"), "2a02:6680:1100:42::/64");
    assert.equal(ipKey("2001:db8::1"), "2001:db8:0:0::/64");
    assert.equal(ipKey("::1"), "0:0:0:0::/64");
    assert.equal(ipKey("2001:db8:1::"), "2001:db8:1:0::/64");
  });
  it("reads an IPv4 address written as IPv6", () => {
    assert.equal(ipKey("::ffff:198.51.100.4"), "198.51.100.4");
  });
});

describe("clientIp", () => {
  it("takes Vercel's x-real-ip, then the first x-forwarded-for", () => {
    assert.equal(clientIp(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" })), "203.0.113.7");
    assert.equal(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" })), "198.51.100.1");
    assert.equal(clientIp(new Headers()), "unknown");
  });
});

describe("middleware", () => {
  const event = { waitUntil() {} } as unknown as NextFetchEvent;
  const post = () => new NextRequest("https://lalibakery.test/custom-cake", { method: "POST", headers: { "next-action": "abc" } });
  const passed = (res: Response) => res.headers.get("x-middleware-next") === "1";

  it("lets everything through without Upstash", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.KV_REST_API_URL;
    assert.ok(passed(await middleware(post(), event)));
  });

  it("never asks Redis about a page view", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://127.0.0.1:1";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    const started = Date.now();
    assert.ok(passed(await middleware(new NextRequest("https://lalibakery.test/api/revalidate"), event)));
    assert.ok(Date.now() - started < 100);
  });

  it("lets a request through when Redis can't be reached", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://127.0.0.1:1";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    assert.ok(passed(await middleware(post(), event)));
  });
});
