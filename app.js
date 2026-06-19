import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes.js";
import joiningRoutes from "./routes/joining.routes.js";
import rewardRoutes from "./routes/reward.routes.js";
import memberRoutes from "./routes/member.routes.js";
import walletRoutes from "./routes/wallet.routes.js";
import repurchaseRoutes from "./routes/repurchase.routes.js";
import teamRoutes from "./routes/team.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import reportRoutes from "./routes/report.routes.js";
import swaggerSpec from "./swagger.js";
import swaggerUI from "swagger-ui-express";
import rateLimit from "express-rate-limit";

// https://api.mymazix.com/

const app = express();
const PORT = process.env.PORT ?? 3000;

// CORS for React frontend
app.use(
  cors({
    origin: ["http://localhost:5173", "https://mymazix.com/"],
    credentials: true, // allow cookies if you keep session
  }),
);

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

app.use(limiter);

// API Docs
app.use("/api-docs", swaggerUI.serve, swaggerUI.setup(swaggerSpec));

// Routes
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

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);
