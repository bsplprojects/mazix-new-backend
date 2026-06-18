import { poolPromise } from "../db.js";
import sql from "mssql";

export const getMemberWallet = async (req, res) => {
  try {
    const memberID = req.params.memberID;

    if (!memberID) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again.",
      });
    }

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("memberID", sql.VarChar, memberID)
      .execute("Get_MainWallet");

    const walletAmount = result.recordset?.[0]?.Value || 0;

    const response = [
      {
        MemberID: memberID,
        Amount: walletAmount,
      },
    ];

    return res.status(200).json(response);
  } catch (error) {
    console.error("GetMemberWallet Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getWalletSendHistory = async (req, res) => {
  try {
    const memberID = req.params?.memberID;

    if (!memberID) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again.",
      });
    }

    const pool = await poolPromise;

    const fdt = new Date();
    const tdt = new Date();

    const result = await pool
      .request()
      .input("memberID", sql.VarChar, memberID)
      .input("fromDate", sql.VarChar, fdt.toISOString())
      .input("toDate", sql.VarChar, tdt.toISOString())
      .input("status", sql.VarChar, "Received")
      .execute("Get_WalletTransferHistory");

    return res.status(200).json(result.recordset || []);
  } catch (error) {
    console.error("GetWalletSendHistory Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const transferMainWallet = async (req, res) => {
  const transaction = new sql.Transaction();

  try {
    const { FromMemberID, ToMemberID, TransferWallet, MainWallet } = req.body;

    if (
      !FromMemberID ||
      !ToMemberID ||
      !TransferWallet ||
      TransferWallet <= 0
    ) {
      return res.status(400).json({
        Message: "From or To MemberID,Wallet Not Valid",
      });
    }

    const pool = await poolPromise;

    const fromMember = await pool
      .request()
      .input("MemberID", sql.VarChar, FromMemberID).query(`
        SELECT TOP 1 *
        FROM MemberEnrollment
        WHERE MemberID = @MemberID
      `);

    const toMember = await pool
      .request()
      .input("MemberID", sql.VarChar, ToMemberID).query(`
        SELECT TOP 1 *
        FROM MemberEnrollment
        WHERE MemberID = @MemberID
      `);

    if (fromMember.recordset.length === 0 || toMember.recordset.length === 0) {
      return res.status(400).json({
        Message: "From or To MemberID,Wallet Not Valid",
      });
    }

    const walletResult = await pool
      .request()
      .input("MemberID", sql.VarChar, FromMemberID)
      .execute("Get_MainWallet");

    const currentWallet = Number(walletResult.recordset?.[0]?.Value || 0);

    if (TransferWallet > currentWallet) {
      return res.status(400).json({
        Message: "Insufficient Wallet Balance",
      });
    }

    await transaction.begin();

    // SEND ENTRY
    await new sql.Request(transaction)
      .input("MID", sql.Int, fromMember.recordset[0].MID)
      .input("MemberID", sql.VarChar, FromMemberID)
      .input("FromMemberID", sql.VarChar, ToMemberID)
      .input("PrevAmount", sql.Decimal(18, 2), MainWallet || 0)
      .input("Amount", sql.Decimal(18, 2), TransferWallet)
      .input("Date", sql.Date, new Date())
      .input("Status", sql.VarChar, "Active")
      .input("Flag", sql.VarChar, "Send")
      .input("WalletType", sql.VarChar, "Wallet")
      .input("ModifyDate", sql.DateTime, new Date()).query(`
        INSERT INTO WalletTransfer
        (
          MID,
          MemberID,
          FromMemberID,
          PrevAmount,
          Amount,
          Date,
          Status,
          Flag,
          WalletType,
          ModifyDate
        )
        VALUES
        (
          @MID,
          @MemberID,
          @FromMemberID,
          @PrevAmount,
          @Amount,
          @Date,
          @Status,
          @Flag,
          @WalletType,
          @ModifyDate
        )
      `);

    // RECEIVED ENTRY
    await new sql.Request(transaction)
      .input("MID", sql.Int, toMember.recordset[0].MID)
      .input("MemberID", sql.VarChar, ToMemberID)
      .input("FromMemberID", sql.VarChar, FromMemberID)
      .input("PrevAmount", sql.Decimal(18, 2), 0)
      .input("Amount", sql.Decimal(18, 2), TransferWallet)
      .input("Date", sql.Date, new Date())
      .input("Status", sql.VarChar, "Active")
      .input("Flag", sql.VarChar, "Received")
      .input("WalletType", sql.VarChar, "Wallet")
      .input("ModifyDate", sql.DateTime, new Date()).query(`
        INSERT INTO WalletTransfer
        (
          MID,
          MemberID,
          FromMemberID,
          PrevAmount,
          Amount,
          Date,
          Status,
          Flag,
          WalletType,
          ModifyDate
        )
        VALUES
        (
          @MID,
          @MemberID,
          @FromMemberID,
          @PrevAmount,
          @Amount,
          @Date,
          @Status,
          @Flag,
          @WalletType,
          @ModifyDate
        )
      `);

    await transaction.commit();

    const updatedWallet = await pool
      .request()
      .input("MemberID", sql.VarChar, FromMemberID)
      .execute("Get_MainWallet");

    return res.status(200).json({
      Amount: updatedWallet.recordset?.[0]?.Value || 0,
      Message: "Wallet Transfered Successfully",
    });
  } catch (error) {
    if (transaction._aborted === false) {
      try {
        await transaction.rollback();
      } catch {}
    }

    console.error(error);

    return res.status(500).json({
      Message: error.message,
    });
  }
};

export const getRepurchaseMemberWallet = async (req, res) => {
  try {
    const memberID = req.params?.memberID;

    if (!memberID) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again.",
      });
    }

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MemberID", sql.VarChar, memberID)
      .execute("Get_RepMainWallet");

    const walletAmount = result.recordset?.[0]?.Value || 0;

    const response = [
      {
        MemberID: memberID,
        Amount: walletAmount,
      },
    ];

    return res.status(200).json(response);
  } catch (error) {
    console.error("GetReMemberWallet Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const getRepurchaseMemberWalletHistory = async (req, res) => {
  try {
    const memberID = req.params?.memberID;

    if (!memberID) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again.",
      });
    }

    const pool = await poolPromise;

    const fdt = new Date();
    const tdt = new Date();

    const result = await pool
      .request()
      .input("memberID", sql.VarChar, memberID)
      .input("fromDate", sql.VarChar, fdt.toISOString())
      .input("toDate", sql.VarChar, tdt.toISOString())
      .input("status", sql.VarChar, "Received")
      .execute("Get_RepWalletTransferHistory");

    return res.status(200).json(result.recordset || []);
  } catch (error) {
    console.error("GetRepWalletSendHistory Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const repTransferMainWallet = async (req, res) => {
  const transaction = new sql.Transaction();

  try {
    const { FromMemberID, ToMemberID, TransferWallet, MainWallet } = req.body;

    if (
      !FromMemberID ||
      !ToMemberID ||
      !TransferWallet ||
      TransferWallet <= 0
    ) {
      return res.status(400).json({
        Message: "From or To MemberID,Wallet Not Valid",
      });
    }

    const pool = await poolPromise;

    const fromMember = await pool
      .request()
      .input("MemberID", sql.VarChar, FromMemberID).query(`
        SELECT TOP 1 *
        FROM MemberEnrollments
        WHERE MemberID = @MemberID
      `);

    const toMember = await pool
      .request()
      .input("MemberID", sql.VarChar, ToMemberID).query(`
        SELECT TOP 1 *
        FROM MemberEnrollments
        WHERE MemberID = @MemberID
      `);

    if (fromMember.recordset.length === 0 || toMember.recordset.length === 0) {
      return res.status(400).json({
        Message: "From or To MemberID,Wallet Not Valid",
      });
    }

    await transaction.begin();

    await new sql.Request(transaction)
      .input("MID", sql.Int, fromMember.recordset[0].MID)
      .input("MemberID", sql.VarChar, FromMemberID)
      .input("FromMemberID", sql.VarChar, ToMemberID)
      .input("PrevAmount", sql.Decimal(18, 2), MainWallet || 0)
      .input("Amount", sql.Decimal(18, 2), TransferWallet)
      .input("Date", sql.Date, new Date())
      .input("Status", sql.VarChar, "Active")
      .input("Flag", sql.VarChar, "Send")
      .input("WalletType", sql.VarChar, "Wallet")
      .input("ModifyDate", sql.DateTime, new Date()).query(`
        INSERT INTO RepurchaseWalletTransfers
        (
          MID,
          MemberID,
          FromMemberID,
          PrevAmount,
          Amount,
          Date,
          Status,
          Flag,
          WalletType,
          ModifyDate
        )
        VALUES
        (
          @MID,
          @MemberID,
          @FromMemberID,
          @PrevAmount,
          @Amount,
          @Date,
          @Status,
          @Flag,
          @WalletType,
          @ModifyDate
        )
      `);

    await new sql.Request(transaction)
      .input("MID", sql.Int, toMember.recordset[0].MID)
      .input("MemberID", sql.VarChar, ToMemberID)
      .input("FromMemberID", sql.VarChar, FromMemberID)
      .input("PrevAmount", sql.Decimal(18, 2), 0)
      .input("Amount", sql.Decimal(18, 2), TransferWallet)
      .input("Date", sql.Date, new Date())
      .input("Status", sql.VarChar, "Active")
      .input("Flag", sql.VarChar, "Received")
      .input("WalletType", sql.VarChar, "Wallet")
      .input("ModifyDate", sql.DateTime, new Date()).query(`
        INSERT INTO RepurchaseWalletTransfers
        (
          MID,
          MemberID,
          FromMemberID,
          PrevAmount,
          Amount,
          Date,
          Status,
          Flag,
          WalletType,
          ModifyDate
        )
        VALUES
        (
          @MID,
          @MemberID,
          @FromMemberID,
          @PrevAmount,
          @Amount,
          @Date,
          @Status,
          @Flag,
          @WalletType,
          @ModifyDate
        )
      `);

    await transaction.commit();

    const walletResult = await pool
      .request()
      .input("MemberID", sql.VarChar, FromMemberID)
      .execute("Get_RepMainWallet");

    return res.status(200).json({
      Amount: walletResult.recordset?.[0]?.Value || 0,
      Message: "Wallet Transfer Successfully",
    });
  } catch (error) {
    try {
      if (transaction._aborted !== true) {
        await transaction.rollback();
      }
    } catch (rollbackError) {}

    console.error("RepTransferMainWallet Error:", error);

    return res.status(500).json({
      Message: error.message,
    });
  }
};

export const getWalletJoiningSendHistory = async (req, res) => {
  try {
    const { fdate, tdate } = req.query;

    if (!fdate || !tdate) {
      return res.status(400).json({
        success: false,
        message: "From date and To date are required",
      });
    }

    const fdt = new Date(fdate);
    const tdt = new Date(tdate);

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("memberID", sql.VarChar, "")
      .input("fromDate", sql.VarChar, fdt.toISOString())
      .input("toDate", sql.VarChar, tdt.toISOString())
      .input("status", sql.VarChar, "Received")
      .execute("Get_WalletTransferHistory");

    return res.status(200).json({ success: true, data: result.recordset });
  } catch (error) {
    console.error("getWalletJoiningSendHistory Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const getRepWalletSendHistory = async (req, res) => {
  try {
    const { fdate, tdate } = req.query;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("memberID", sql.VarChar, "")
      .input("FromDate", sql.VarChar, fdate)
      .input("ToDate", sql.VarChar, tdate)
      .input("status", sql.VarChar, "Received")
      .execute("Get_RepWalletTransferHistory");

    return res.status(200).json({ success: true, data: result.recordset });
  } catch (error) {
    console.error("getRepWalletSendHistory Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
