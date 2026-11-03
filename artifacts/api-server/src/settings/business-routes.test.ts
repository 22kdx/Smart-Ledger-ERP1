import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import { test } from "node:test";
import { createCompanyBusinessSettingsRouter } from "./business-routes";
import type { CompanyBusinessSettingsService } from "./business-service";
import type { AuthService } from "../auth/service";

test("business settings routes authenticate, validate, and normalize exchange dates", async (t) => {
  const companyId = randomUUID();
  const savedExchangeRates: Array<Record<string, unknown>> = [];
  const authService = {
    authenticateAccessToken: async (token: string) =>
      token === "test-access-token"
        ? {
            id: randomUUID(),
            email: "settings@example.test",
            displayName: "Settings Test",
          }
        : null,
    companyAccess: async () => ({
      companyId,
      role: "owner",
      permissions: ["companies:read", "settings:manage"],
    }),
  } as unknown as AuthService;
  const service = {
    listTaxRules: async () => [],
    createTaxRule: async (_companyId: string, rule: Record<string, unknown>) => ({
      id: randomUUID(),
      ...rule,
    }),
    updateTaxRule: async () => null,
    listExchangeRates: async () => [],
    createExchangeRate: async (
      _companyId: string,
      rate: Record<string, unknown>,
    ) => {
      savedExchangeRates.push(rate);
      return { id: randomUUID(), ...rate };
    },
    deleteExchangeRate: async () => false,
  } as unknown as CompanyBusinessSettingsService;

  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createCompanyBusinessSettingsRouter(authService, service),
  );
  const server = app.listen(0, "127.0.0.1");
  t.after(async () => closeServer(server));
  await waitForListening(server);

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/companies/${companyId}/exchange-rates`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: "Bearer test-access-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fromCurrency: "SAR",
      toCurrency: "YER",
      rate: 140.125,
      effectiveDate: "2026-11-03",
      source: "manual",
    }),
  });
  assert.equal(response.status, 201);
  const created = (await response.json()) as { effectiveDate: string };
  assert.equal(created.effectiveDate, "2026-11-03");
  assert.equal(savedExchangeRates[0]?.effectiveDate, "2026-11-03");

  const unauthorizedResponse = await fetch(url, { method: "GET" });
  assert.equal(unauthorizedResponse.status, 401);
});

async function waitForListening(server: Server): Promise<void> {
  if (server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
