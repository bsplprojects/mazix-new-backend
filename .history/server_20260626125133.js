require("dotenv").config();

const express = require("express");
const cors = require("cors");

const teamRoutes = require("./routes/team.routes");
const joiningRoutes = require("./routes/joining.routes");
const authRoutes = require("./routes/auth.routes");
const rewardRoutes = require("./routes/reward.route");
const usersRoutes = require("./routes/users.routes");

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://mymazix.com",
  "https://www.mymazix.com",
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests from Postman, curl, server-to-server
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked: ${origin}`));
  },

  credentials: true,

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
  ],

  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.options("*", cors(corsOptions));

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Mazix API Running",
  });
});

app.use("/api/team", teamRoutes);
app.use("/api/joining", joiningRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/reward", rewardRoutes);
app.use("/api/users", usersRoutes);

app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
