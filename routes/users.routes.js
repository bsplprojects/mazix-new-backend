const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../db");
const { enrollUsers } = require("../controllers/user.controller");

router.get("/all-users", async (req, res) => {
  try {
    const { MemberID, Fromdate, Todate } = req.query;

    const pool = await poolPromise;

    // =========================================
    // EXECUTE STORED PROCEDURE
    // =========================================

    const result = await pool
      .request()
      .input("MemberID", sql.VarChar, MemberID || "")
      .input("Fromdate", sql.VarChar, Fromdate || "")
      .input("Todate", sql.VarChar, Todate || "")
      .execute("Get_MemberInfoReport");

    res.status(200).json({
      success: true,
      count: result.recordset.length,
      users: result.recordset,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

router.route("/enroll").post(enrollUsers);

module.exports = router;
