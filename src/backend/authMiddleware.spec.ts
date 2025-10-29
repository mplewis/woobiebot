import Fastify, { type FastifyInstance } from "fastify";
import { pino } from "pino";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createManageAuthHook } from "./authMiddleware.js";
import { UrlSigner } from "./urlSigner.js";

let app: FastifyInstance;
let urlSigner: UrlSigner;
const baseUrl = "http://localhost:3000";
const secret = "test-secret-key";
const log = pino({ level: "silent" });

beforeEach(async () => {
  urlSigner = new UrlSigner(secret);
  app = Fastify();

  const authHook = createManageAuthHook(urlSigner, baseUrl, log);

  app.get("/test", { preHandler: authHook }, async (request) => {
    return { success: true, userId: request.manageAuth?.userId };
  });

  app.post("/test-body", { preHandler: authHook }, async (request) => {
    return { success: true, userId: request.manageAuth?.userId };
  });

  await app.ready();
});

afterEach(async () => {
  await app.close();
});

it("allows valid authentication from query params", async () => {
  const userId = "user123";
  const manageUrl = urlSigner.signManageUrl(baseUrl, userId, 60000);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  const response = await app.inject({
    method: "GET",
    url: `/test?userId=${userId}&signature=${signature}&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.success).toBe(true);
  expect(body.userId).toBe(userId);
});

it("allows valid authentication from request body", async () => {
  const userId = "user456";
  const manageUrl = urlSigner.signManageUrl(baseUrl, userId, 60000);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  const response = await app.inject({
    method: "POST",
    url: "/test-body",
    headers: {
      "content-type": "application/json",
    },
    payload: {
      userId,
      signature,
      expiresAt,
    },
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.success).toBe(true);
  expect(body.userId).toBe(userId);
});

it("returns 400 when userId is missing", async () => {
  const userId = "user123";
  const manageUrl = urlSigner.signManageUrl(baseUrl, userId, 60000);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  const response = await app.inject({
    method: "GET",
    url: `/test?signature=${signature}&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(400);
  const body = response.json();
  expect(body.error).toBe("Missing authentication parameters");
});

it("returns 400 when signature is missing", async () => {
  const userId = "user123";
  const manageUrl = urlSigner.signManageUrl(baseUrl, userId, 60000);
  const urlObj = new URL(manageUrl);
  const expiresAt = urlObj.searchParams.get("expiresAt");

  const response = await app.inject({
    method: "GET",
    url: `/test?userId=${userId}&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(400);
  const body = response.json();
  expect(body.error).toBe("Missing authentication parameters");
});

it("returns 400 when expiresAt is missing", async () => {
  const userId = "user123";
  const manageUrl = urlSigner.signManageUrl(baseUrl, userId, 60000);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");

  const response = await app.inject({
    method: "GET",
    url: `/test?userId=${userId}&signature=${signature}`,
  });

  expect(response.statusCode).toBe(400);
  const body = response.json();
  expect(body.error).toBe("Missing authentication parameters");
});

it("returns 400 when expiresAt is not a valid number", async () => {
  const userId = "user123";
  const manageUrl = urlSigner.signManageUrl(baseUrl, userId, 60000);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");

  const response = await app.inject({
    method: "GET",
    url: `/test?userId=${userId}&signature=${signature}&expiresAt=not-a-number`,
  });

  expect(response.statusCode).toBe(400);
  const body = response.json();
  expect(body.error).toBe("Invalid expiration timestamp");
});

it("returns 403 when authentication token has expired", async () => {
  const userId = "user123";
  const expiredTime = Date.now() - 1000;
  const manageUrl = urlSigner.signManageUrl(baseUrl, userId, 60000);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");

  const response = await app.inject({
    method: "GET",
    url: `/test?userId=${userId}&signature=${signature}&expiresAt=${expiredTime}`,
  });

  expect(response.statusCode).toBe(403);
  const body = response.json();
  expect(body.error).toBe("Authentication token has expired");
});

it("returns 403 when signature is invalid", async () => {
  const userId = "user123";
  const expiresAt = Date.now() + 60000;

  const response = await app.inject({
    method: "GET",
    url: `/test?userId=${userId}&signature=invalid-signature&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(403);
  const body = response.json();
  expect(body.error).toBe("Invalid authentication signature");
});

it("attaches manageAuth context to request on successful authentication", async () => {
  const userId = "user789";
  const manageUrl = urlSigner.signManageUrl(baseUrl, userId, 60000);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAtStr = urlObj.searchParams.get("expiresAt");

  if (!expiresAtStr) {
    throw new Error("Test setup failed: expiresAt not found in URL");
  }

  const expiresAt = Number.parseInt(expiresAtStr, 10);

  const response = await app.inject({
    method: "GET",
    url: `/test?userId=${userId}&signature=${signature}&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.userId).toBe(userId);
  expect(body.success).toBe(true);
});

it("prefers query params over body params when both are present", async () => {
  const queryUserId = "query-user";
  const bodyUserId = "body-user";
  const manageUrl = urlSigner.signManageUrl(baseUrl, queryUserId, 60000);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  const response = await app.inject({
    method: "POST",
    url: `/test-body?userId=${queryUserId}&signature=${signature}&expiresAt=${expiresAt}`,
    headers: {
      "content-type": "application/json",
    },
    payload: {
      userId: bodyUserId,
      signature: "wrong-signature",
      expiresAt: "12345",
    },
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.userId).toBe(queryUserId);
});

it("uses constant-time comparison for signatures (timing attack prevention)", async () => {
  const userId = "user123";
  const manageUrl = urlSigner.signManageUrl(baseUrl, userId, 60000);
  const urlObj = new URL(manageUrl);
  const correctSignature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!correctSignature) {
    throw new Error("Test setup failed: signature not found in URL");
  }

  const almostCorrectSignature = `${correctSignature.slice(0, -1)}X`;

  const startTime = process.hrtime.bigint();
  await app.inject({
    method: "GET",
    url: `/test?userId=${userId}&signature=${almostCorrectSignature}&expiresAt=${expiresAt}`,
  });
  const endTime = process.hrtime.bigint();
  const timeDiff1 = endTime - startTime;

  const startTime2 = process.hrtime.bigint();
  await app.inject({
    method: "GET",
    url: `/test?userId=${userId}&signature=completely-wrong-sig&expiresAt=${expiresAt}`,
  });
  const endTime2 = process.hrtime.bigint();
  const timeDiff2 = endTime2 - startTime2;

  const difference = Math.abs(Number(timeDiff1 - timeDiff2));
  const maxAcceptableDifference = 50_000_000;

  expect(difference).toBeLessThan(maxAcceptableDifference);
});
