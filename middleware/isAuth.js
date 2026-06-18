import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

export const isAdmin = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role === "admin") {
      req.user = decoded;
      next();
    } else {
      return res.status(401).json({ success: false, msg: "Unauthorized" });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Failed to authorize",
      error: error.message,
    });
  }
};
