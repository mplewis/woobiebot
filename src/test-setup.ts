/**
 * Test setup configuration to prevent EventEmitter memory leak warnings.
 * Sets unlimited max listeners on the process object since tests legitimately
 * create many Fastify and Chokidar instances that add signal handlers.
 */
import { setMaxListeners } from "node:events";

setMaxListeners(0, process);
