require("dotenv").config();
const express = require("express");
const cors = require("cors");

const teamRoutes = require("./routes/team.routes");
const joiningRoutes = require("./routes/joining.routes");
const authRoutes = require("./routes/auth.routes");
const rewardRoutes = require("./routes/reward.route");
const usersRoutes = require("./routes/users.routes");

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173", 
    credentials: true, 
  })
);

app.use(express.json());

app.use("/api/team", teamRoutes);
app.use("/api/joining", joiningRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/reward", rewardRoutes);
app.use("/api/users", usersRoutes);

app.listen(5000, () => {
  console.log("Server running on port 5000");
});