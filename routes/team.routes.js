import express from "express";
import { poolPromise } from "../db.js";
import sql from "mssql";
import {
  getMemberData,
  getDatewiseDownline,
} from "../controllers/team.controller.js";

const router = express.Router();

router.route("/updown").get(getMemberData);

async function getLegMembers(userId, leg, queue, limit = 10, search = "") {
  const pool = await poolPromise;

  let members = [];

  // FIRST REQUEST
  if (queue.length === 0) {
    const first = await pool
      .request()
      .input("userId", sql.NVarChar, userId)
      .input("leg", sql.NVarChar, leg).query(`
        SELECT MemberID,MemberName,PlacementID,
               SponserID,DOJ,Leaf,BV
        FROM Member_View
        WHERE PlacementID=@userId
        AND Leaf=@leg
      `);

    if (!first.recordset.length) {
      return {
        members: [],
        nextCursor: null,
      };
    }

    const firstMember = first.recordset[0];

    members.push(firstMember);

    queue.push(firstMember.MemberID);
  }

  while (queue.length && members.length < limit) {
    const currentBatch = [...queue];
    queue = [];

    const request = pool.request();

    currentBatch.forEach((id, index) => {
      request.input(`id${index}`, sql.NVarChar, id);
    });

    if (search) {
      request.input("search", sql.NVarChar, `%${search}%`);
    }

    const ids = currentBatch.map((_, i) => `@id${i}`).join(",");

    const downline = await request.query(`
      SELECT
          MemberID,
          MemberName,
          PlacementID,
          SponserID,
          DOJ,
          Leaf,
          BV
      FROM Member_View
      WHERE PlacementID IN (${ids})
      ${
        search
          ? `
      AND (
          MemberID LIKE @search
          OR MemberName LIKE @search
      )
      `
          : ""
      }
  `);

    members.push(...downline.recordset);

    queue.push(...downline.recordset.map((x) => x.MemberID));
  }

  members = members.slice(0, limit);

  return {
    members: members.map((m) => ({
      id: m.MemberID,
      name: m.MemberName,
      placementId: m.PlacementID,
      joinDate: m.DOJ,
      leg: m.Leaf,
      bv: Number(m.BV || 0),
      active: Number(m.BV || 0) > 0,
      rank: "Distributor",
    })),

    nextCursor:
      queue.length > 0
        ? Buffer.from(JSON.stringify(queue)).toString("base64")
        : null,
  };
}

async function getLegStats(userId, leg) {
  const pool = await poolPromise;

  const stats = {
    total: 0,
    active: 0,
    totalBV: 0,
  };

  // Get first member of the requested leg
  const first = await pool
    .request()
    .input("userId", sql.NVarChar, userId)
    .input("leg", sql.NVarChar, leg).query(`
      SELECT
          MemberID,
          BV
      FROM Member_View
      WHERE PlacementID = @userId
      AND Leaf = @leg
    `);

  if (!first.recordset.length) {
    return stats;
  }

  const firstMember = first.recordset[0];

  let queue = [firstMember.MemberID];

  // Count first member
  stats.total++;
  stats.totalBV += Number(firstMember.BV || 0);

  if (Number(firstMember.BV || 0) > 0) {
    stats.active++;
  }

  // BFS Traversal
  while (queue.length) {
    const currentBatch = [...queue];
    queue = [];

    const request = pool.request();

    currentBatch.forEach((id, index) => {
      request.input(`id${index}`, sql.NVarChar, id);
    });

    const ids = currentBatch.map((_, i) => `@id${i}`).join(",");

    const result = await request.query(`
      SELECT
          MemberID,
          BV
      FROM Member_View
      WHERE PlacementID IN (${ids})
    `);

    if (!result.recordset.length) {
      continue;
    }

    for (const member of result.recordset) {
      queue.push(member.MemberID);

      const bv = Number(member.BV || 0);

      stats.total++;
      stats.totalBV += bv;

      if (bv > 0) {
        stats.active++;
      }
    }
  }

  return stats;
}

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

router.get("/right/:userId", async (req, res) => {
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
