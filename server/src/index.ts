import { buildApp } from "./app.js";
import { corsOrigins, env } from "./env.js";
import { createSocketServer } from "./socket.js";

const app = buildApp();
await app.listen({ port: env.PORT, host: "0.0.0.0" });
createSocketServer(app.server, corsOrigins);
