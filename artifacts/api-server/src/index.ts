import app from "./app";
import { logger } from "./lib/logger";
import { closeAuthRuntime } from "./routes";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down API server");
  server.close((error) => {
    if (error) {
      logger.error({ error }, "Failed to close HTTP server cleanly");
      process.exitCode = 1;
    }
    void closeAuthRuntime().finally(() => {
      process.exit();
    });
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
