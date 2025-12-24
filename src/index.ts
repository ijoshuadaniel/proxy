import axios, { AxiosRequestConfig } from "axios";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";

dotenv.config();

const PORT = process.env.PORT || 5010;
const app = express();
app.use(express.json({ limit: "100mb" }));

interface ProxyRequestBody {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  data?: unknown;
  timeout?: number;
}

const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey || typeof apiKey !== "string") {
    return res.status(401).json({ error: "API key missing" });
  }

  console.log(process.env.X_API_KEY);

  if (apiKey !== process.env.X_API_KEY) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  next();
};

/* =========================
   RATE LIMIT
   ========================= */
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: "Rate limit exceeded",
    });
  },
});

/* =========================
   PROXY ENDPOINT
   ========================= */
app.all(
  "/proxy",
  limiter,
  apiKeyAuth,
  async (req: Request<{}, {}, ProxyRequestBody>, res: Response) => {
    const {
      url,
      method = "GET",
      headers = {},
      query = {},
      data,
      timeout = 15000,
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: "Missing required field: url" });
    }

    const config: AxiosRequestConfig = {
      url,
      method: method.toUpperCase(),
      headers,
      params: query,
      data,
      timeout,
      validateStatus: () => true,
    };

    try {
      const response = await axios(config);

      return res.status(response.status).json({
        status: response.status,
        headers: response.headers,
        data: response.data,
      });
    } catch (err: any) {
      if (err.response) {
        return res.status(err.response.status).json({
          error: "Upstream API error",
          data: err.response.data,
        });
      }

      if (err.request) {
        return res.status(502).json({
          error: "No response from upstream API",
          message: err.message,
        });
      }

      return res.status(500).json({
        error: "Proxy internal error",
        message: err.message,
      });
    }
  }
);

app.listen(PORT, () => {
  console.log("proxy running on http://localhost:" + PORT);
});
