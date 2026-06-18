import sql from "mssql";
import { poolPromise } from "../db.js";

export const getRepurchaseHistory = async (req, res) => {
  try {
    const { fDate, tDate, limit } = req.query;

    const memid = req.params.memberID;

    if (!memid) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MemberID", sql.VarChar, memid)
      .input("FDate", sql.Date, new Date(fDate))
      .input("limit", sql.Int, limit)
      .input("TDate", sql.Date, new Date(tDate)).query(`
        SELECT TOP(@limit) *
        FROM RepProductOrder
        WHERE MemberID = @MemberID
          AND OrderDate >= @FDate
          AND OrderDate <= @TDate
        ORDER BY RepOrderID DESC 
      `);

    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error("Get Product Rep List Search Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};
