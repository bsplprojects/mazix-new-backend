import express from "express";
import { poolPromise } from "../db.js";
import sql from "mssql";
import {
  getMemberData,
  getDatewiseDownline,
  getTeamBV,
} from "../controllers/team.controller.js";
import { getLegMembers, getLegStats } from "../helpers/getLegMembers.js";

const router = express.Router();

router.route("/updown").get(getMemberData);

router.get("/my-income/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { fromDate, toDate, page = 1, pageSize = 10 } = req.query;
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MemberID", sql.NVarChar, id)
      .input("Fromdate", sql.VarChar, fromDate)
      .input("Todate", sql.VarChar, toDate)
      .execute("Get_BinaryPayoutMember");

    let data = result.recordset;

    const start = (page - 1) * pageSize;
    const items = data.slice(start, start + Number(pageSize));

    res.json({
      items,
      totalRecords: data.length,
      currentPage: Number(page),
      totalPages: Math.ceil(data.length / pageSize),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});

router.get("/direct/:userId", async (req, res) => {
  try {
    const pool = await poolPromise;

    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({ message: "userId required" });
    }

    const result = await pool
      .request()
      .input("sponserID", sql.NVarChar, userId.trim())
      .execute("Get_DirectTeamList");

    const data = result.recordset.map((m) => ({
      id: m.MemberID,
      name: m.MemberName,
      placementId: m.PlacementID,
      sponsorId: m.SponserID,
      joinDate: m.DOJ,
      leg: m.Leaf,
      bv: Number(m.BV || 0),
      active: Number(m.BV || 0) > 0,
      rank: "Distributor",
    }));

    res.json(data);
  } catch (err) {
    console.error("DIRECT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/old-income/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { fromDate, toDate, page = 1, pageSize = 10 } = req.query;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MemberID", sql.NVarChar, id)
      .input("Fromdate", sql.VarChar, fromDate)
      .input("Todate", sql.VarChar, toDate)
      .execute("Get_OldIncome");

    let data = result.recordset;

    const start = (page - 1) * pageSize;
    const items = data.slice(start, start + Number(pageSize));

    res.json({
      items,
      totalRecords: data.length,
      currentPage: Number(page),
      totalPages: Math.ceil(data.length / pageSize),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});

router.get("/payout-statement/:id", async (req, res) => {
  try {
    const BinaryPayoutID = req.params.id;

    console.log("BinaryPayoutID:", BinaryPayoutID);

    if (!BinaryPayoutID) {
      return res.status(400).json({ message: "BinaryPayoutID required" });
    }

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("BinaryPayoutID", sql.BigInt, BinaryPayoutID).query(`
        SELECT *
        FROM PayoutBinary
        WHERE BinaryPayoutID = @BinaryPayoutID
      `);

    const list = result.recordset;

    if (!list.length) {
      return res.status(404).json({ message: "No data found" });
    }

    // 2️⃣ map like your C# loop + join Member name
    const finalData = [];

    for (let itm of list) {
      const memberResult = await pool
        .request()
        .input("MemberID", sql.VarChar, itm.MemberID).query(`
          SELECT TOP 1 MemberName
          FROM MemberPersonalInfo
          WHERE MemberID = @MemberID
        `);

      finalData.push({
        MemberID: itm.MemberID,
        MemberName: memberResult.recordset[0]?.MemberName || "",

        CurrentLeft: itm.CurrentLeft,
        CurrentRight: itm.CurrentRight,

        PurCurrentLeft: itm.PurCurrentLeft,
        PurCurrentRight: itm.PurCurrentRight,

        OldLeftCarry: itm.OldLeftCarry,
        OldRightCarry: itm.OldRightCarry,

        TotalLeft: itm.TotalLeft,
        TotalRight: itm.TotalRight,

        Pair: itm.Pair,
        Capping: itm.Capping,

        CarryLeft: itm.CarryLeft,
        CarryRight: itm.CarryRight,

        Amount: itm.Amount,
        TDS: itm.TDS,
        AdminCharge: itm.AdminCharge,
        Vouchur: itm.Vouchur,
        Payable: itm.Payable,

        PayoutDate: itm.PayoutDate,
        PayoutFromDate: itm.PayoutFromDate,
        PayoutToDate: itm.PayoutToDate,

        Status: itm.Status,
        Flag: itm.Flag,
        Bonus: itm.Bonus,
      });
    }

    return res.json(finalData);
  } catch (err) {
    console.error("payout-statement error:", err);
    res.status(500).json({
      message: "Server Error",
      error: err.message,
    });
  }
});

router.get("/datewise/:id", getDatewiseDownline);

router.post("/:leg/:userId", async (req, res) => {
  try {
    const { userId, leg } = req.params;

    const limit = Number(req.query.limit || 10);

    const search = (req.body.search || "").trim();

    let queue = req.body.queue
      ? JSON.parse(Buffer.from(req.query.queue, "base64").toString())
      : [];

    const data = await getLegMembers(userId, leg, queue, limit, search);

    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get("/:leg/:userId", async (req, res) => {
  try {
    const { userId, leg } = req.params;

    const limit = Number(req.query.limit || 10);

    const search = (req.query.search || "").trim();

    // cursor from previous request
    let queue = req.query.queue
      ? JSON.parse(Buffer.from(req.query.queue, "base64").toString())
      : [];

    const data = await getLegMembers(userId, leg, queue, limit, search);

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get("/:leg/:userId/stats", async (req, res) => {
  try {
    const { userId, leg } = req.params;

    const stats = await getLegStats(userId, leg);

    res.json({
      success: true,
      stats,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get("/bv", getTeamBV);

export default router;
