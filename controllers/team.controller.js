import sql from "mssql";
import { poolPromise } from "../db.js";

export const getMemberData = async (req, res) => {
  try {
    let member = req.query.member;

    if (!member) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("PlacementID", sql.VarChar, member).query(`
        SELECT
          me.MemberID,
          me.SponserID,
          me.PlacementID,
          me.DOJ,
          me.Leaf,
          mpi.MemberName
        FROM MemberEnrollment me
        LEFT JOIN MemberPersonalInfo mpi
          ON mpi.MemberID = me.MemberID
        WHERE me.PlacementID = @PlacementID
      `);

    const data = result.recordset.map((row) => ({
      MemberID: row.MemberID,
      SponserID: row.SponserID,
      PlacementID: row.PlacementID,
      DOJ: row.DOJ
        ? new Date(row.DOJ)
            .toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
            .replace(/ /g, "/")
        : "",
      Leaf: row.Leaf,
      Member: row.MemberName,
    }));

    return res.status(200).json(data);
  } catch (error) {
    console.error("GetMemberData Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

export const getDatewiseDownline = async (req, res) => {
  try {
    const { FromDate, Todate, position } = req.query;

    const memberId = req.params?.id;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const pool = await poolPromise;

    // Find Left/Right Child
    const placementResult = await pool
      .request()
      .input("PlacementID", sql.VarChar, memberId).query(`
        SELECT *
        FROM MemberEnrollment
        WHERE PlacementID = @PlacementID
      `);

    let downlineMemberId = "";

    if (placementResult.recordset.length > 0) {
      const child = placementResult.recordset.find((x) => x.Leaf === position);

      if (child) {
        downlineMemberId = child.MemberID;
      }
    }

    if (!downlineMemberId) {
      return res.json([]);
    }

    // Stored Procedure
    const teamResult = await pool
      .request()
      .input("FromDate", sql.VarChar, FromDate)
      .input("Todate", sql.VarChar, Todate)
      .input("MemberID", sql.VarChar, downlineMemberId)
      .execute("Get_FromMemberID");

    const members = teamResult.recordset || [];

    const rm = [];

    for (const item of members) {
      const memid = Object.values(item)[0]?.toString();

      if (!memid) continue;

      // Enrollment
      const enrolResult = await pool
        .request()
        .input("MemberID", sql.VarChar, memid).query(`
          SELECT TOP 1 *
          FROM MemberEnrollment
          WHERE MemberID = @MemberID
        `);

      const enrol = enrolResult.recordset[0];

      if (!enrol) continue;

      // Member Name
      const nameResult = await pool
        .request()
        .input("MemberID", sql.VarChar, memid).query(`
          SELECT TOP 1 MemberName
          FROM MemberPersonalInfo
          WHERE MemberID = @MemberID
        `);

      // Activation
      const activationResult = await pool
        .request()
        .input("MID", sql.BigInt, enrol.MID).query(`
          SELECT TOP 1 BV
          FROM MemberActivation
          WHERE MID = @MID
        `);

      rm.push({
        MemberID: memid,
        PlacementID: enrol.PlacementID,
        SponserID: enrol.SponserID,
        DOJ: enrol.DOJ,
        Leaf: enrol.Leaf === "Left" ? "Position1" : "Position2",
        MemberName: nameResult.recordset[0]?.MemberName || "",
        BV: activationResult.recordset[0]?.BV || 0,
      });
    }

    return res.json(rm);
  } catch (error) {
    console.error("getTeamData Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
