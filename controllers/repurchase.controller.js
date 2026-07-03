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

  try {
    if (!kotbills || kotbills.length === 0) {
      return res.status(400).json({ message: "No order data" });
    }

    const flag = kotbills[0].Flag;
    const memberID = req.user?.username || kotbills[0].MemberID;
    const MID = req.user?.mid || kotbills[0].MID;

    const pool = await poolPromise;

    let walletData;
    let walletBalance = 0;

    let orderStatus = "";
    let walletField = "";

    if (flag === "Repurchase") {
      const result = await pool
        .request()
        .input("memberID", memberID)
        .execute("Get_RepMainWallet");

      walletBalance = Object.values(result.recordset?.[0])[0] || 0;
      walletField = "rep";
      orderStatus = "RPO";
    }

    if (flag === "Voucher") {
      const result = await pool
        .request()
        .input("memberID", memberID)
        .execute("Get_VoucherAmount");

      walletBalance = result.recordset?.[0]?.TotalVoucher || 0;
      walletField = "voucher";
      orderStatus = "VOCH";
    }

    const totalAmount = kotbills[0].TotalAmount;

    if (totalAmount > walletBalance) {
      return res.json({ success: false, message: "Insufficient balance" });
    }

    const orderNo = `MZX/OR/${Date.now()}`;

    const headerResult = await pool
      .request()
      .input("MemberID", memberID)
      .input("MID", MID)
      .input("OrderNo", orderNo)
      .input("OrderStatus", orderStatus)
      .input("PrevWallet", walletBalance)
      .input("CurrentWallet", walletBalance - totalAmount)
      .execute("Insert_RepProductOrder_Header");

    const kotid = headerResult.recordset?.[0]?.RepOrderID;

    let tBV = 0;
    let tAMT = 0;
    let tGST = 0;

    for (const item of kotbills) {
      const qty = Number(item.Qty);
      const mrp = Number(item.MRP);
      const bv = Number(item.BV);

      const netAmount = mrp * qty;

      // get GST from product
      const product = await pool
        .request()
        .input("PID", item.pID)
        .query("SELECT GST FROM ProductMaster WHERE PID = @PID");

      const gstRate = product.recordset?.[0]?.GST || 0;
      const lgst = (mrp * gstRate) / 100;

      tBV += bv * qty;
      tAMT += netAmount;
      tGST += lgst;

      // insert order list
      await pool
        .request()
        .input("RepOrderID", kotid)
        .input("MemberID", memberID)
        .input("MID", MID)
        .input("pID", item.pID)
        .input("pCatID", item.pCatID)
        .input("MRP", mrp)
        .input("BV", bv)
        .input("Qty", qty)
        .input("NetAmount", netAmount)
        .input("LGST", lgst)
        .input("Status", "Active")
        .execute("Insert_RepProductOrder_List");
    }

    await pool
      .request()
      .input("RepOrderID", kotid)
      .input("TotalBV", tBV)
      .input("TotalAmount", tAMT)
      .input("TotalGST", tGST).query(`
        UPDATE RepProductOrders
        SET TotalBV = @TotalBV,
            TotalAmount = @TotalAmount,
            TotalGST = @TotalGST
        WHERE RepOrderID = @RepOrderID
      `);

    return res.json({
      success: true,
      orderId: kotid,
    });
  } catch (error) {
    console.error("InsertRepProduct Error:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};
