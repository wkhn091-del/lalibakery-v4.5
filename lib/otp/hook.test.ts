// The Send SMS hook against forged, foreign, repeated and failing requests.   npm test
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { Webhook } from "standardwebhooks";
import { DAILY_CAP, handleSendSms, type OtpHookDeps, smsText, type Verdict } from "./hook";

const SECRET = `whsec_${Buffer.from("a test secret, 32 bytes long....").toString("base64")}`;
const supabase = new Webhook(SECRET);
const stranger = new Webhook(`whsec_${Buffer.from("somebody else's secret, 32 bytes").toString("base64")}`);

let n = 0;
function hookRequest(body: unknown, { signer = supabase, at = new Date() } = {}) {
  const payload = JSON.stringify(body);
  const id = `msg_${++n}`;
  return new Request("https://lalibakery.test/api/hooks/send-sms", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(at.getTime() / 1000)),
      "webhook-signature": signer.sign(id, at, payload),
    },
    body: payload,
  });
}
const code = (phone = "972501234567", otp = "123456") => ({ user: { id: "u1", phone }, sms: { otp } });

/** a limit that counts per key, like Upstash's */
function counter(limit: number) {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  const check = async (key: string): Promise<Verdict> => {
    keys.push(key);
    const used = counts.get(key) ?? 0;
    if (used >= limit) return { success: false, remaining: 0 };
    counts.set(key, used + 1);
    return { success: true, remaining: limit - used - 1 };
  };
  return Object.assign(check, { keys });
}

type Sent = { to: string; text: string };
let sent: Sent[];
let reports: string[];
let deps: OtpHookDeps;
let limits: { phone: ReturnType<typeof counter>; phoneDay: ReturnType<typeof counter>; site: ReturnType<typeof counter> };

beforeEach(() => {
  sent = [];
  reports = [];
  limits = { phone: counter(3), phoneDay: counter(6), site: counter(DAILY_CAP) };
  deps = {
    verify: (raw, headers) => supabase.verify(raw, headers),
    limits: { phone: limits.phone, phoneDay: limits.phoneDay, site: () => limits.site("all") },
    salt: "a salt of sixteen+ characters",
    send: async (to, text) => void sent.push({ to, text }),
    report: {
      message: (text, level) => void reports.push(`${level}: ${text}`),
      exception: (_error, text) => void reports.push(`exception: ${text}`),
    },
    host: "www.lalibakery.co.il",
  };
});

const json = async (res: Response) => (res.headers.get("content-type")?.includes("json") ? res.json() : null);

describe("Send SMS hook", () => {
  it("sends the code to an Israeli mobile, with the autofill line", async () => {
    const res = await handleSendSms(hookRequest(code()), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await json(res), {});
    assert.deepEqual(sent, [{ to: "+972501234567", text: smsText("123456", "www.lalibakery.co.il") }]);
    assert.match(sent[0].text, /123456\n\n@www\.lalibakery\.co\.il #123456$/);
  });

  it("sends to sms.phone when Supabase gives it (a changed number)", async () => {
    await handleSendSms(hookRequest({ user: { phone: "972501234567" }, sms: { otp: "654321", phone: "972529876543" } }), deps);
    assert.equal(sent[0].to, "+972529876543");
  });

  it("refuses a request Supabase didn't sign, or signed too long ago", async () => {
    assert.equal((await handleSendSms(hookRequest(code(), { signer: stranger }), deps)).status, 401);
    const old = new Date(Date.now() - 10 * 60 * 1000);
    assert.equal((await handleSendSms(hookRequest(code(), { at: old }), deps)).status, 401);
    const unsigned = new Request("https://lalibakery.test/api/hooks/send-sms", { method: "POST", body: JSON.stringify(code()) });
    assert.equal((await handleSendSms(unsigned, deps)).status, 401);
    assert.equal(sent.length, 0);
  });

  it("sends nothing abroad or to a landline, before touching the limits", async () => {
    for (const phone of ["447700900123", "12025550123", "97225551234", "9725012345", "97250123456789", ""]) {
      const res = await handleSendSms(hookRequest(code(phone)), deps);
      assert.equal(res.status, 200, "Supabase reads a refusal only from a 200");
      assert.deepEqual(await json(res), { error: { http_code: 400, message: "Only Israeli mobile numbers can receive a code" } });
    }
    assert.equal(sent.length, 0);
    assert.equal(limits.phone.keys.length, 0);
  });

  it("refuses a payload that isn't a code", async () => {
    for (const body of [{ user: { phone: "972501234567" } }, code("972501234567", "12ab56"), code("972501234567", "1".repeat(20)), "text"]) {
      assert.equal((await json(await handleSendSms(hookRequest(body), deps))).error.http_code, 400);
    }
    assert.equal(sent.length, 0);
  });

  it("allows 3 codes per number per 15 minutes, counting the number by a keyed hash", async () => {
    for (let i = 0; i < 3; i++) assert.deepEqual(await json(await handleSendSms(hookRequest(code()), deps)), {});
    const fourth = await json(await handleSendSms(hookRequest(code()), deps));
    assert.equal(fourth.error.http_code, 429);
    assert.equal(sent.length, 3);
    // another number is unaffected
    assert.deepEqual(await json(await handleSendSms(hookRequest(code("972541112233")), deps)), {});
    const [key] = limits.phone.keys;
    assert.doesNotMatch(key, /501234567/);
    assert.equal(new Set(limits.phone.keys.slice(0, 4)).size, 1, "the same number, the same key");
  });

  it("keeps a refused number from using up the site's day", async () => {
    for (let i = 0; i < 10; i++) await handleSendSms(hookRequest(code()), deps);
    assert.equal(limits.site.keys.length, 3);
  });

  it("costs a customer who presses \"resend\" too often 15 minutes, not the day", async () => {
    for (let i = 0; i < 8; i++) await handleSendSms(hookRequest(code()), deps);
    assert.equal(sent.length, 3);
    assert.equal(limits.phoneDay.keys.length, 3, "the 5 refused codes don't count toward the day");
    limits.phone = counter(3); // 15 minutes later
    deps.limits = { ...deps.limits!, phone: limits.phone };
    for (let i = 0; i < 4; i++) await handleSendSms(hookRequest(code()), deps);
    assert.equal(sent.length, 6, "3 more that day, then the daily limit");
  });

  it("sends when Redis is too slow, without a false alarm about the cap", async () => {
    deps.limits = { ...deps.limits!, site: async () => ({ success: true, remaining: 0, reason: "timeout" }) };
    assert.deepEqual(await json(await handleSendSms(hookRequest(code()), deps)), {});
    assert.equal(sent.length, 1);
    assert.deepEqual(reports, ["warning: OTP: Redis was too slow, the code was sent without some of its limits"]);
  });

  it("warns Sentry at 80% of the daily cap and pauses at the cap", async () => {
    deps.limits = { phone: counter(1e6), phoneDay: counter(1e6), site: () => limits.site("all") };
    for (let i = 0; i < DAILY_CAP; i++) await handleSendSms(hookRequest(code()), deps);
    assert.equal(sent.length, DAILY_CAP);
    assert.deepEqual(reports, [
      `warning: OTP: 80% of today's SMS cap (${DAILY_CAP}) is used`,
      `error: OTP: today's SMS cap (${DAILY_CAP}) is reached, codes are paused until midnight UTC`,
    ]);
    const next = await json(await handleSendSms(hookRequest(code()), deps));
    assert.equal(next.error.http_code, 429);
    assert.equal(sent.length, DAILY_CAP);
  });

  it("still sends when Redis fails, and tells Sentry", async () => {
    deps.limits = { ...deps.limits!, phone: async () => Promise.reject(new Error("Redis unreachable")) };
    assert.deepEqual(await json(await handleSendSms(hookRequest(code()), deps)), {});
    assert.equal(sent.length, 1);
    assert.deepEqual(reports, ["exception: OTP: rate limits unavailable, the code was sent without them"]);
  });

  it("answers 502 when the provider fails, within Supabase's 5 s", async () => {
    let signal: AbortSignal | undefined;
    deps.send = async (_to, _text, s) => {
      signal = s;
      throw new Error("provider down");
    };
    const res = await json(await handleSendSms(hookRequest(code()), deps));
    assert.equal(res.error.http_code, 502);
    assert.ok(signal instanceof AbortSignal);
    assert.deepEqual(reports, ["exception: OTP: the SMS provider refused the code or timed out"]);
  });

  it("works without Redis in development", async () => {
    deps.limits = null;
    assert.deepEqual(await json(await handleSendSms(hookRequest(code()), deps)), {});
    assert.equal(sent.length, 1);
  });

  it("writes the code without the autofill line when the site address is unknown", () => {
    assert.equal(smsText("4321"), "קוד הכניסה שלך ל-LaliBakery: 4321");
  });
});
