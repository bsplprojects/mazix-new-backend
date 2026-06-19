import express from "express";
import { poolPromise } from "../db.js";
import sql from "mssql";
import {
  getMemberData,
  getDatewiseDownline,
} from "../controllers/team.controller.js";

const router = express.Router();

router.route("/updown").get(getMemberData);

async function getLegMembers(userId, leg) {
  const pool = await poolPromise;

  let members = [];

  // STEP 1 : FIRST PLACEMENT ONLY
  let result = await pool
    .request()
    .input("userId", sql.NVarChar, userId.trim())
    .input("leg", sql.NVarChar, leg.trim()).query(`
      SELECT MemberID,MemberName,PlacementID,
             SponserID,DOJ,Leaf,BV
      FROM Member_View
      WHERE PlacementID=@userId
      AND Leaf=@leg
    `);

  if (result.recordset.length === 0) return [];

  let firstMember = result.recordset[0];

  members.push(firstMember);

  let queue = [firstMember.MemberID];

  // STEP 2 : LOOP
  while (queue.length > 0) {
    let downline = await pool.request().query(`
        SELECT MemberID,MemberName,PlacementID,
               SponserID,DOJ,Leaf,BV
        FROM Member_View
        WHERE PlacementID IN (${queue.map((id) => `'${id}'`).join(",")})
      `);

    if (downline.recordset.length === 0) break;

    queue = downline.recordset.map((x) => x.MemberID);

    members.push(...downline.recordset);
  }

  return members.map((m) => ({
    id: m.MemberID,
    name: m.MemberName,
    placementId: m.PlacementID,
    joinDate: m.DOJ,
    leg: m.Leaf,
    bv: Number(m.BV || 0),
    active: Number(m.BV || 0) > 0,
    rank: "Distributor",
  }));
}

router.get("/left/:userId", async (req, res) => {
  try {
    const data = await getLegMembers(req.params.userId, "Left");
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/right/:userId", async (req, res) => {
  try {
    const data = await getLegMembers(req.params.userId, "Right");
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
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

export default router;
