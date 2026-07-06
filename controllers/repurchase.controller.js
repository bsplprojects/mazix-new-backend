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

export const getRepVoucherWalletAmount = async (req, res) => {
  try {
    const { Prefix, memberID } = req.query;

    const pool = await poolPromise;

    let rtn = {
      Repurchase: 0,
      Voucher: 0,
    };

    if (Prefix === "Repurchase") {
      const result = await pool
        .request()
        .input("memberID", memberID)
        .execute("Get_RepMainWallet");

      const value = Object.values(result.recordset?.[0])[0] || 0;

      rtn.Repurchase = value;
    } else if (Prefix === "Voucher") {
      const result = await pool
        .request()
        .input("memberID", memberID)
        .execute("Get_VoucherAmount");

      const voucher = result.recordset?.[0]?.TotalVoucher || 0;

      rtn.Voucher = voucher;
    }

    return res.status(200).json(rtn);
  } catch (error) {
    console.error("GetMemberWalletAmount Error:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

export const insertRepProduct = async (req, res) => {
  const kotbills = req.body.kotbills;

  let kotid = 0;
  let tBV = 0;
  let tAMT = 0;
  let tgst = 0;

  try {
    const pool = await poolPromise;

    const memberID = req.query.memberID;
    const MID = req.query.mid;

    if (!kotbills || kotbills.length === 0) {
      return res.status(400).json({
        success: false,
        message: "KOTBills is required",
        kotid,
      });
    }

    const flag = (kotbills[0].Flag || "").toLowerCase();

    if (flag === "repurchase") {
      const reWalletResult = await pool
        .request()
        .input("memberID", sql.NVarChar, memberID)
        .execute("Get_RepMainWallet");

      const getReWall = reWalletResult.recordset[0]
        ? Object.values(reWalletResult.recordset[0])[0]
        : null;

      if (!getReWall) {
        return res.status(404).json({
          success: false,
          message: "Wallet not found for this member",
          kotid,
        });
      }

      if (Number(kotbills[0].TotalAmount) > Number(getReWall.Value)) {
        return res.status(400).json({
          success: false,
          message: "Insufficient wallet balance",
          available: getReWall.Value,
          required: kotbills[0].TotalAmount,
          kotid,
        });
      }

      const countResult = await pool.request().query(`
        SELECT COUNT(*) AS cnt FROM RepProductOrder
      `);
      const orderCount = countResult.recordset[0].cnt;

      const orderNo = `MZX/OR/${orderCount}`;
      const repCurrentWallet =
        Number(getReWall.Value) - Number(kotbills[0].TotalAmount);
      const repPrevWallet = getReWall.Value;

      // insert header
      const insertHeaderResult = await pool
        .request()
        .input("MemberID", sql.NVarChar, memberID)
        .input("MID", sql.BigInt, Number(MID))
        .input("OrderNo", sql.NVarChar, orderNo)
        .input("OrderDate", sql.DateTime, new Date(new Date().toDateString()))
        .input("RepCurrentWallet", sql.Decimal(18, 2), repCurrentWallet)
        .input("RepPrevWallet", sql.Decimal(18, 2), repPrevWallet)
        .input("OrderStatus", sql.NVarChar, "RPO")
        .input("Status", sql.NVarChar, "Active")
        .input("ModifyDate", sql.DateTime, new Date()).query(`
          INSERT INTO RepProductOrder
            (MemberID, MID, OrderNo, OrderDate, RepCurrentWallet, RepPrevWallet, OrderStatus, Status, ModifyDate) OUTPUT INSERTED.RepOrderID
          VALUES (
            @MemberID, @MID, @OrderNo, @OrderDate, @RepCurrentWallet, @RepPrevWallet, @OrderStatus,
            @Status, @ModifyDate
          )
        `);

      kotid = insertHeaderResult.recordset[0].RepOrderID;

      for (let i = 0; i < kotbills.length; i++) {
        const item = kotbills[i];

        const netAmount = Number(item.MRP) * Number(item.Qty);
        tBV += Number(item.BV) * Number(item.Qty);
        tAMT += Number(item.MRP) * Number(item.Qty);

        const PID = Number(item.pID);
        const productResult = await pool
          .request()
          .input("PID", sql.BigInt, PID)
          .query(`SELECT * FROM ProductMaster WHERE pID = @PID`);

        const Pobj = productResult.recordset[0];

        if (!Pobj) {
          return res.status(400).json({
            success: false,
            message: `Product not found for PID ${PID}`,
            kotid,
          });
        }

        const lgst = (Number(item.MRP) * Number(Pobj.GST)) / 100;
        tgst += lgst;

        await pool
          .request()
          .input("RepOrderID", sql.BigInt, kotid)
          .input("MemberID", sql.NVarChar, memberID)
          .input("MID", sql.BigInt, Number(MID))
          .input("pID", sql.BigInt, Number(item.pID))
          .input("pCatID", sql.BigInt, Number(item.pCatID))
          .input("MRP", sql.Decimal(18, 2), Number(item.MRP))
          .input("BV", sql.Decimal(18, 2), Number(item.BV))
          .input("Qty", sql.Int, Number(item.Qty))
          .input("ModifyDate", sql.DateTime, new Date())
          .input("NetAmount", sql.Decimal(18, 2), netAmount)
          .input("Status", sql.NVarChar, "Active")
          .input("LGST", sql.Decimal(18, 2), lgst).query(`
            INSERT INTO RepProductOrderList (RepOrderID, MemberID, MID, pID, pCatID, MRP, BV, Qty, ModifyDate, NetAmount, Status, LGST)
            VALUES (
            @RepOrderID, @MemberID, @MID, @pID, @pCatID, @MRP, @BV, @Qty, @ModifyDate, @NetAmount, @Status, @LGST)
          `);
      }

      await pool
        .request()
        .input("RepOrderID", sql.BigInt, kotid)
        .input("TotalBV", sql.Decimal(18, 2), tBV)
        .input("TotalAmount", sql.Decimal(18, 2), tAMT)
        .input("TotalGST", sql.Decimal(18, 2), tgst).query(`
        UPDATE RepProductOrder
        SET TotalBV = @TotalBV,
            TotalAmount = @TotalAmount,
            TotalGST = @TotalGST
        WHERE RepOrderID = @RepOrderID  
      `);
    } else if (flag === "voucher") {
      const voucherResult = await pool
        .request()
        .input("MemberID", sql.NVarChar, memberID)
        .execute("Get_VoucherAmount");

      const getReWall = voucherResult.recordset[0];

      if (!getReWall) {
        return res.status(404).json({
          success: false,
          message: "Voucher wallet not found for this member",
          kotid,
        });
      }

      if (Number(kotbills[0].TotalAmount) > Number(getReWall.TotalVoucher)) {
        return res.status(400).json({
          success: false,
          message: "Insufficient voucher balance",
          available: getReWall.TotalVoucher,
          required: kotbills[0].TotalAmount,
          kotid,
        });
      }

      const countResult = await pool.request().query(`
          SELECT COUNT(*) AS cnt FROM RepProductOrder              
        `);
      const orderCount = countResult.recordset[0].cnt;

      const orderNo = `MZX/OR/${orderCount}`;
      const repCurrentWallet =
        Number(getReWall.TotalVoucher) - Number(kotbills[0].TotalAmount);
      const repPrevWallet = getReWall.TotalVoucher;

      const insertHeaderResult = await pool
        .request()
        .input("MemberID", sql.NVarChar, memberID)
        .input("MID", sql.BigInt, Number(MID))
        .input("OrderNo", sql.NVarChar, orderNo)
        .input("OrderDate", sql.DateTime, new Date(new Date().toDateString()))
        .input("RepCurrentWallet", sql.Decimal(18, 2), repCurrentWallet)
        .input("RepPrevWallet", sql.Decimal(18, 2), repPrevWallet)
        .input("OrderStatus", sql.NVarChar, "VOCH")
        .input("Status", sql.NVarChar, "Active")
        .input("ModifyDate", sql.DateTime, new Date()).query(`
          INSERT INTO RepProductOrder
          (MemberID, MID, OrderNo, OrderDate, RepCurrentWallet, RepPrevWallet, OrderStatus, Status, ModifyDate)
          OUTPUT INSERTED.RepOrderID
          VALUES
          (@MemberID, @MID, @OrderNo, @OrderDate, @RepCurrentWallet, @RepPrevWallet, @OrderStatus, @Status, @ModifyDate) 
        `);

      kotid = insertHeaderResult.recordset[0].RepOrderID;

      for (let i = 0; i < kotbills.length; i++) {
        const item = kotbills[i];

        const netAmount = Number(item.MRP) * Number(item.Qty);
        tBV += Number(item.BV) * Number(item.Qty);
        tAMT += Number(item.MRP) * Number(item.Qty);

        const PID = Number(item.pID);
        const productResult = await pool
          .request()
          .input("PID", sql.BigInt, PID)
          .query(`SELECT * FROM ProductMaster WHERE ID = @PID`);

        const Pobj = productResult.recordset[0];

        if (!Pobj) {
          return res.status(400).json({
            success: false,
            message: `Product not found for PID ${PID}`,
            kotid,
          });
        }

        const lgst = (Number(item.MRP) * Number(Pobj.GST)) / 100;
        tgst += lgst;

        await pool
          .request()
          .input("RepOrderID", sql.BigInt, kotid)
          .input("MemberID", sql.NVarChar, memberID)
          .input("MID", sql.BigInt, Number(MID))
          .input("pID", sql.BigInt, Number(item.pID))
          .input("pCatID", sql.BigInt, Number(item.pCatID))
          .input("MRP", sql.Decimal(18, 2), Number(item.MRP))
          .input("BV", sql.Decimal(18, 2), Number(item.BV))
          .input("Qty", sql.Int, Number(item.Qty))
          .input("ModifyDate", sql.DateTime, new Date())
          .input("NetAmount", sql.Decimal(18, 2), netAmount)
          .input("Status", sql.NVarChar, "Active")
          .input("LGST", sql.Decimal(18, 2), lgst).query(`
            INSERT INTO RepProductOrderList
              (RepOrderID, MemberID, MID, pID, pCatID, MRP, BV, Qty, ModifyDate, NetAmount, Status, LGST)
            VALUES
              (@RepOrderID, @MemberID, @MID, @pID, @pCatID, @MRP, @BV, @Qty, @ModifyDate, @NetAmount, @Status, @LGST)
          `);
      }

      await pool
        .request()
        .input("RepOrderID", sql.BigInt, kotid)
        .input("TotalBV", sql.Decimal(18, 2), tBV)
        .input("TotalAmount", sql.Decimal(18, 2), tAMT)
        .input("TotalGST", sql.Decimal(18, 2), tgst).query(`
          UPDATE RepProductOrder
          SET TotalBV = @TotalBV,
              TotalAmount = @TotalAmount,
              TotalGST = @TotalGST
          WHERE RepOrderID = @RepOrderID
        `);
    } else {
      return res.status(400).json({
        success: false,
        message: `Unsupported order flag: "${kotbills[0].Flag}"`,
        kotid,
      });
    }

    return res.json({
      success: true,
      orderId: kotid,
      message: "Order placed successfully",
    });
  } catch (error) {
    console.error("InsertRepProduct Error:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const getRepurchaseInvoiceDetails = async (req, res) => {
  try {
    const { orderId, MemberID } = req.query;

    const pool = await poolPromise;

    const headerResult = await pool
      .request()
      .input("RepOrderID", sql.BigInt, orderId)
      .input("MemberID", sql.NVarChar, MemberID)
      .query(
        `SELECT * FROM RepProductOrder WHERE RepOrderID = @RepOrderID AND MemberID = @MemberID`,
      );

    const header = headerResult.recordset[0];

    if (!header) {
      return res
        .status(404)
        .json({ success: false, message: "Order Not Found" });
    }

    // fetching order items
    const orderItems = await pool
      .request()
      .input("RepOrderID", sql.BigInt, orderId).query(`
    SELECT
      rol.RepOrderListID,
      rol.RepOrderID,
      rol.MemberID,
      rol.MID,
      rol.pID,
      rol.pCatID,
      rol.MRP,
      rol.BV,
      rol.Qty,
      rol.NetAmount,
      rol.Status,
      rol.ModifyDate,
      rol.LoginID,
      rol.LGST,
      pm.Product AS ProductName,
      pm.Image,
      pm.Description,
      pm.GST
    FROM RepProductOrderList AS rol
    LEFT JOIN ProductMaster AS pm
      ON rol.pID = pm.pID
    WHERE rol.RepOrderID = @RepOrderID
  `);

    const items = orderItems.recordset;

    return res.status(200).json({ success: true, header, items });
  } catch (error) {
    console.error("get repurchase invoice Error:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};
