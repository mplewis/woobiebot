import type { FastifyReply, FastifyRequest } from "fastify";
import type { Logger } from "pino";
import type { UrlSigner } from "./urlSigner.js";

/**
 * Authenticated management context attached to requests after successful verification.
 */
export interface ManageAuthContext {
  userId: string;
  expiresAt: number;
}

/**
 * Parameters required for management authentication.
 */
interface ManageAuthParams {
  userId: string;
  signature: string;
  expiresAt: string;
}

/**
 * Extracts authentication parameters from query string or request body.
 * Query params take precedence over body params.
 *
 * @param request - Fastify request object containing query and body data
 * @returns Authentication parameters if all required fields are present, null otherwise
 */
function extractAuthParams(request: FastifyRequest): ManageAuthParams | null {
  const query = request.query as Record<string, unknown>;
  const body = (request.body as Record<string, unknown>) || {};

  const userId = (query["userId"] as string) || (body["userId"] as string);
  const signature = (query["signature"] as string) || (body["signature"] as string);
  const expiresAt = (query["expiresAt"] as string) || (body["expiresAt"] as string);

  if (!userId || !signature || !expiresAt) {
    return null;
  }

  return { userId, signature, expiresAt };
}

/**
 * Creates a Fastify preHandler hook that verifies management URL authentication.
 * Attaches ManageAuthContext to request.manageAuth on successful verification.
 *
 * @param urlSigner - URL signing utility for signature verification
 * @param baseUrl - Base URL for reconstructing signed management URLs
 * @param log - Logger instance for audit logging
 * @returns Fastify preHandler hook function
 */
export function createManageAuthHook(
  urlSigner: UrlSigner,
  baseUrl: string,
  log: Logger,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const params = extractAuthParams(request);

    if (!params) {
      log.info({ url: request.url }, "Missing authentication parameters for management endpoint");
      return reply.status(400).send({ error: "Missing authentication parameters" });
    }

    const { userId, signature, expiresAt: expiresAtStr } = params;

    const expiresAt = Number.parseInt(expiresAtStr, 10);
    if (Number.isNaN(expiresAt)) {
      log.info(
        { userId, url: request.url },
        "Invalid expiration timestamp for management endpoint",
      );
      return reply.status(400).send({ error: "Invalid expiration timestamp" });
    }

    if (Date.now() > expiresAt) {
      log.info(
        { userId, url: request.url, expiresAt },
        "Expired authentication token for management endpoint",
      );
      return reply.status(403).send({ error: "Authentication token has expired" });
    }

    const manageUrl = urlSigner.signManageUrl(baseUrl, userId, expiresAt - Date.now());
    const manageUrlObj = new URL(manageUrl);
    const expectedSignature = manageUrlObj.searchParams.get("signature");

    if (signature !== expectedSignature) {
      log.info(
        { userId, url: request.url },
        "Invalid authentication signature for management endpoint",
      );
      return reply.status(403).send({ error: "Invalid authentication signature" });
    }

    request.manageAuth = { userId, expiresAt };
    log.debug({ userId, url: request.url }, "Management authentication successful");
  };
}
