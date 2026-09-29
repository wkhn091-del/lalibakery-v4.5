// The SMS sender: which provider, and what Twilio receives.   npm test
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { SmsError, smsSender } from "./sms";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Call = { url: string; init: RequestInit };
function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Response.json(body, { status });
  }) as typeof fetch;
  return calls;
}

const TWILIO = { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "token", TWILIO_MESSAGING_SERVICE_SID: "MG456", NODE_ENV: "production" };

describe("smsSender", () => {
  it("has no sender in production without keys, and prints in development", () => {
    assert.equal(smsSender({ NODE_ENV: "production" }), null);
    assert.equal(smsSender({ NODE_ENV: "production", TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "token" }), null, "no sender set");
    assert.equal(typeof smsSender({ NODE_ENV: "development" }), "function");
  });

  it("posts the message to Twilio with the messaging service", async () => {
    const calls = fakeFetch(201, { sid: "SM1" });
    await smsSender(TWILIO)!("+972501234567", "קוד: 123456");
    assert.equal(calls.length, 1);
    const { url, init } = calls[0];
    assert.equal(url, "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    assert.equal(init.method, "POST");
    assert.equal((init.headers as Record<string, string>).Authorization, `Basic ${btoa("AC123:token")}`);
    const form = new URLSearchParams(String(init.body));
    assert.equal(form.get("To"), "+972501234567");
    assert.equal(form.get("Body"), "קוד: 123456");
    assert.equal(form.get("MessagingServiceSid"), "MG456");
    assert.equal(form.get("From"), null);
    assert.ok(init.signal instanceof AbortSignal);
  });

  it("uses an API key and a sender name when given", async () => {
    const calls = fakeFetch(201, {});
    const env = { NODE_ENV: "production", TWILIO_ACCOUNT_SID: "AC123", TWILIO_API_KEY_SID: "SK1", TWILIO_API_KEY_SECRET: "s3cret", TWILIO_FROM: "LaliBakery" };
    await smsSender(env)!("+972501234567", "x");
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, `Basic ${btoa("SK1:s3cret")}`);
    assert.equal(new URLSearchParams(String(calls[0].init.body)).get("From"), "LaliBakery");
  });

  it("throws the status and Twilio's code, never its message (it can quote the number)", async () => {
    fakeFetch(400, { code: 21211, message: "The 'To' number +972501234567 is not a valid phone number.", status: 400 });
    await assert.rejects(smsSender(TWILIO)!("+972501234567", "x"), (error: unknown) => {
      assert.ok(error instanceof SmsError);
      assert.equal(error.status, 400);
      assert.equal(error.code, 21211);
      assert.doesNotMatch(error.message, /972/);
      return true;
    });
  });

  it("passes the caller's deadline to the request", async () => {
    const calls = fakeFetch(201, {});
    const signal = AbortSignal.timeout(1234);
    await smsSender(TWILIO)!("+972501234567", "x", signal);
    assert.equal(calls[0].init.signal, signal);
  });
});
