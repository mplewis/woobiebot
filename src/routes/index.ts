import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import type { CaptchaManager } from "../captcha.js";
import type { FileIndexer } from "../indexer.js";
import type { RateLimiter } from "../rateLimiter.js";
import type { UrlSigner } from "../urlSigner.js";
import { registerHealthRoutes } from "./health.js";
import { registerManageRoutes } from "./manage.js";
import { registerPublicRoutes } from "./public.js";

/**
 * Dependencies required for registering HTTP routes.
 */
export interface RoutesDependencies {
  urlSigner: UrlSigner;
  captchaManager: CaptchaManager;
  rateLimiter: RateLimiter;
  indexer: FileIndexer;
  log: Logger;
  baseUrl: string;
  allowedExtensions: readonly string[];
  maxFileSizeMB: number;
}

/**
 * Register all HTTP routes for the web server.
 */
export function registerRoutes(app: FastifyInstance, deps: RoutesDependencies): void {
  const {
    urlSigner,
    captchaManager,
    rateLimiter,
    indexer,
    log,
    baseUrl,
    allowedExtensions,
    maxFileSizeMB,
  } = deps;

  // Register public download routes (captcha-protected)
  registerPublicRoutes(app, {
    urlSigner,
    captchaManager,
    rateLimiter,
    indexer,
    log,
    baseUrl,
  });

  // Register file management routes (authenticated)
  registerManageRoutes(app, {
    urlSigner,
    indexer,
    log,
    baseUrl,
    allowedExtensions,
    maxFileSizeMB,
  });

  // Register health check route
  registerHealthRoutes(app);
}
