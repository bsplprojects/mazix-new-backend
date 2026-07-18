import dotenv from "dotenv";
dotenv.config();

import helmet from "helmet";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";

import authRoutes from "./routes/auth.routes.js";
import joiningRoutes from "./routes/joining.routes.js";
import rewardRoutes from "./routes/reward.routes.js";
import memberRoutes from "./routes/member.routes.js";
import walletRoutes from "./routes/wallet.routes.js";
import repurchaseRoutes from "./routes/repurchase.routes.js";
import teamRoutes from "./routes/team.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import reportRoutes from "./routes/report.routes.js";
import globalSearchRoutes from "./routes/search.routes.js";
import swaggerSpec from "./swagger.js";
import swaggerUI from "swagger-ui-express";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://api.mymazix.com/

const app = express();
const PORT = process.env.PORT ?? 3000;

// CORS for React frontend

const allowedOrigins = [
  "http://localhost:5173",
  "https://mymazix.com",
  "https://www.mymazix.com",
];

console.log("🚀 RUNNING APP.JS");
app.use((req, res, next) => {
  console.log(">>>", req.method, req.originalUrl);
  next();
});

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.options(/.*/, cors());

app.use(express.json());
app.use(compression());
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", "data:", "https://app.mymazix.com"],
      },
    },
  }),
);
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

// app.use(limiter);

// API Docs
app.use("/api-docs", swaggerUI.serve, swaggerUI.setup(swaggerSpec));

app.use("/uploads", express.static(path.join(__dirname, "Uploads")));

// Routes
app.use("/api/v1/search", globalSearchRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/joining", joiningRoutes);
app.use("/api/v1/reward", rewardRoutes);
app.use("/api/v1/member", memberRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/repurchase", repurchaseRoutes);
app.use("/api/v1/team", teamRoutes);
app.use("/api/v1/reports", reportRoutes);
app.use("/api/v1/admin", adminRoutes);

app.get("/", (req, res) => {
  res.send("Server Running 🚀");
});

const server = app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);

process.on("SIGTERM", () => {
  console.log("SIGTERM signal received, Closing the HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
  });
});
