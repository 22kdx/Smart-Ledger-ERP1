import assert from "node:assert/strict";
import { test } from "node:test";
import {
  customFetch,
  setAuthTokenGetter,
  setBaseUrl,
} from "../../../lib/api-client-react/src/custom-fetch";

test("a base URL ending in /api does not duplicate generated /api paths", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  let authGetterCalled = false;

  setBaseUrl("https://api.example.test/erp/api");
  setAuthTokenGetter(() => {
    authGetterCalled = true;
    return "not-used-for-bootstrap";
  });
  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input));
    return new Response('{"ok":true}', {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await customFetch("/api/auth/login", {
      method: "POST",
      body: "{}",
      responseType: "json",
      skipAuth: true,
    });
    assert.equal(authGetterCalled, false);

    await customFetch("/healthz", { responseType: "json" });
    assert.equal(authGetterCalled, true);
    assert.deepEqual(requestedUrls, [
      "https://api.example.test/erp/api/auth/login",
      "https://api.example.test/erp/api/healthz",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    setAuthTokenGetter(null);
    setBaseUrl(null);
  }
});
