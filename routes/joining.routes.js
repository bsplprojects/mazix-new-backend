import express from "express";
import sql from "mssql";

import { poolPromise } from "../db.js";
import OOPs from "../OOPs.js";

const router = express.Router();

router.get("/products", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT
       *
      FROM ProductMaster
      WHERE Status = 'Active'
      ORDER BY MemberMRP;
    `);

    res.json(
      result.recordset.map((p) => ({
        id: p.pID,
        catId: p.pCatID,
        name: p.Product,
        MRP: p.MRP,
        price: Number(p.MemberMRP || 0),
        bv: Number(p.BV || 0),
        gst: Number(p.GST || 0),
        image: p.Image || "📦",
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/products/:catId", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { catId } = req.params;
    const result = await pool.request().input("pCatID", sql.Int, catId).query(`
      SELECT
       *
      FROM ProductMaster
      WHERE Status = 'Active' AND pCatID = @pCatID
      ORDER BY MemberMRP;
    `);

    res.json(
      result.recordset.map((p) => ({
        id: p.pID,
        catId: p.pCatID,
        name: p.Product,
        MRP: p.MRP,
        price: Number(p.MemberMRP || 0),
        bv: Number(p.BV || 0),
        gst: Number(p.GST || 0),
        image: p.Image || "📦",
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/product/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res
        .status(400)
        .json({ success: false, msg: "Product ID missing" });
    }

    const pool = await poolPromise;

    const productDetails = await pool
      .request()
      .input("pID", sql.Int, Number(id)).query(`
      SELECT * FROM ProductMaster where pID = @pID     
    `);

    const productStock = await pool.request().input("pID", sql.Int, Number(id))
      .query(`
      SELECT Status, CreatedAt, UpdatedAt, stock, updatedStock from stockDetail where pID = @pID
    `);

    const product = productDetails.recordset[0];
    const stock = productStock.recordset[0];

    const data = {
      ...product,
      productStock: {
        ...stock,
      },
    };

    return res.status(200).json({
      success: true,
      msg: "Product Fetched successfully",
      data,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      msg: "Internal Server Error",
      err: error.message,
    });
  }
});

router.get("/member-dashboard", async (req, res) => {
  try {
    const pool = await poolPromise;

    const { MID, MemberID } = req.query;

    if (!MID || !MemberID) {
      return res.status(400).json({
        success: false,
        message: "MID or MemberID missing",
      });
    }

    const wallet = await pool
      .request()
      .input("MemberID", sql.NVarChar, MemberID)
      .execute("Get_MainWallet");

    const repWallet = await pool
      .request()
      .input("MemberID", sql.NVarChar, MemberID)
      .execute("Get_RepMainWallet");
      
    const currentWallet = Object.values(wallet.recordset?.[0] || {})[0] || 0;

    const currentRepWallet =
      Object.values(repWallet.recordset?.[0] || {})[0] || 0;

    return res.json({
      success: true,
      CurrentWallet: currentWallet,
      CurrentRepWallet: currentRepWallet,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

router.post("/register", async (req, res) => {
  const { sessionId, member, products } = req.body;

  if (!sessionId || !member || !products?.length) {
    return res.status(400).json({ success: false, message: "Invalid Data" });
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
    const request = new sql.Request(transaction);

    const MemberID = sessionId;

    const regBV = products.reduce(
      (a, b) => a + Number(b.BV || 0) * Number(b.Qty || 0),
      0,
    );
    const regAmnt = products.reduce(
      (a, b) => a + Number(b.MRP || 0) * Number(b.Qty || 0),
      0,
    );

    /* ================= WALLET ================= */
    const walletReq = new sql.Request(transaction);

    const wallet = await walletReq
      .input("MemberID", sql.NVarChar, MemberID)
      .execute("Get_MainWallet");

    const CurrentWallet = Object.values(wallet.recordset?.[0] || {})[0] || 0;

    if (Number(CurrentWallet) < regAmnt || regBV < 50) {
      await transaction.rollback();
      return res.json({
        success: false,
        code: "3",
        message: "Insufficient wallet",
      });
    }

    /* ================= SPONSOR CHECK ================= */
    const sponsor = await request.query(`
      SELECT COUNT(*) AS cnt
      FROM MemberEnrollment
      WHERE MemberID='${member.SponserID}'
    `);

    if (sponsor.recordset[0].cnt === 0) {
      await transaction.rollback();
      return res.json({
        success: false,
        code: "2",
        message: "Invalid sponsor",
      });
    }

    /* ================= MEMBER NO ================= */
    const MemberNo = "MAZ" + Math.floor(10000 + Math.random() * 90000);

    /* ================= INSERT MEMBER ================= */
    const insertMember = await request.query(`
      INSERT INTO MemberEnrollment
      (MemberID, SponserID, PlacementID, Leaf, DOJ, Status, ModifyDate)
      VALUES
      ('${MemberNo}', '${member.SponserID}', '${member.SponserID}', '${member.Leaf}', GETDATE(), 'Approved', GETDATE());

      SELECT SCOPE_IDENTITY() AS MID;
    `);

    const MID = insertMember.recordset[0].MID;

    if (!MID) {
      throw new Error("Member insert failed");
    }
   
    await request.query(`
      INSERT INTO MemberPersonalInfo
      (MID, MemberID, MemberName, GuardianName, Gender, Age, Address, District, StateID, Country, Pincode, ContactNo, EmailID)
      VALUES
      (${MID}, '${MemberNo}', '${member.MemberName}', '${member.GuardianName}', '${member.Gender}', '${member.Age}',
      '${member.Address}', '${member.District}', '${member.StateID}', '${member.Country}',
      '${member.Pincode}', '${member.ContactNo}', '${member.EmailID}')
    `);

    for (const item of products) {
      const r = await request.query(`
        INSERT INTO MemberProductActivationParticular
        (MID, ProductID, ProductName, MRP, BV, Qty, Status)
        VALUES
        (${MID}, ${item.ProductID}, '${item.ProductName}', ${item.MRP}, ${item.BV}, ${item.Qty}, 'Active')
      `);

      if (!r.rowsAffected[0]) {
        throw new Error("Product insert failed");
      }
    }

    await transaction.commit();

    return res.json({
      success: true,
      message: "Member registered successfully",
      MID,
      MemberID: MemberNo,
    });
  } catch (err) {
    await transaction.rollback();
    console.error("REGISTER ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Transaction Failed",
    });
  }
});


router.get("/check-sponsor/:sponsorId", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().input("SponsorID", req.params.sponsorId)
      .query(`
        SELECT TOP 1 c.MemberID, c.MID, d.MemberName
        FROM MemberEnrollment c
        INNER JOIN MemberPersonalInfo d ON c.MID = d.MID
        WHERE c.MemberID = @SponsorID
      `);

    if (result.recordset.length === 0) {
      return res.json({ valid: false });
    }

    res.json({
      valid: true,
      ...result.recordset[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= STATES ================= */
router.get("/states", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT StateID, StateName FROM StateMaster ORDER BY StateName
    `);

    res.json(
      result.recordset.map((s) => ({
        id: s.StateID,
        name: s.StateName,
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= CITIES ================= */
router.get("/cities/:stateId", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().input("StateID", req.params.stateId)
      .query(`
        SELECT CityID, CityName
        FROM CityMaster
        WHERE StateID = @StateID
        ORDER BY CityName
      `);

    res.json(
      result.recordset.map((c) => ({
        id: c.CityID,
        name: c.CityName,
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
