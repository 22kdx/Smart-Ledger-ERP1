import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const proxyHopsSetting = process.env.TRUST_PROXY_HOPS;
if (proxyHopsSetting !== undefined) {
  const proxyHops = Number(proxyHopsSetting);
  if (!Number.isInteger(proxyHops) || proxyHops < 0) {
    throw new Error("TRUST_PROXY_HOPS must be a non-negative integer.");
  }
  app.set("trust proxy", proxyHops);
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
