import "dotenv/config";

import { loadEnv } from "./config/env.js";
import { startPosHttpServer } from "./http-server.js";

const env = loadEnv();
const { gracefulShutdown } = await startPosHttpServer(env);

process.on("SIGINT", () => void gracefulShutdown("SIGINT").then(() => process.exit(0)));
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM").then(() => process.exit(0)));
