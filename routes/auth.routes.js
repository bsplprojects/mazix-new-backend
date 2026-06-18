// routes/auth.routes.js
import express from "express";
import sql from "mssql";
import jwt from "jsonwebtoken";
import { poolPromise } from "../db.js";
import OOPs from "../OOPs.js";

const router = express.Router();

//  MEMBER LOGIN
router.post("/login", async (req, res) => {
  try {
    const { MemberID, Password } = req.body;

    if (!MemberID || !Password) {
      return res.status(400).json({
        success: false,
        message: "MemberID and Password are required",
      });
    }

    const pool = await poolPromise;

    // Encrypt password before DB check
    const encPassword = await OOPs.encrypt(Password);
    const result = await pool
      .request()
      .input("MemberID", sql.NVarChar, MemberID)
      .input("Password", sql.NVarChar, encPassword).query(`
        SELECT TOP 1
          LoginID,
          MID,
          Password,
          MemberID,
          UserType,
          UserID,
          Status,
          Flag
        FROM MemberLoginDetail
        WHERE MemberID = @MemberID
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid MemberID or Password",
      });
    }

    const user = result.recordset[0];

    // const decryptedPassword = await OOPs.decrypt(user.Password);

    // if (decryptedPassword !== Password) {
    //   return res.status(401).json({
    //     success: false,
    //     message: "Invalid MemberID or Password",
    //   });
    // }

    if (user.Status === false || user.Flag === false) {
      return res.status(403).json({
        success: false,
        message: "Account blocked",
      });
    }

    const token = jwt.sign(
      {
        MID: user.MID,
        MemberID: user.MemberID,
        UserType: user.UserType,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    // return the token in the cookies
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

export default router;
