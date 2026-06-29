import sql from "mssql";
import { poolPromise } from "../db.js";
import { getProductSaleWithJoin } from "../helpers/getSaleProduct.js";

export async function getSaleReport(req, res) {
  try {
    const { FromDate, MemberId, Todate } = req.query;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("memberID", sql.NVarChar, MemberId || "")
      .input("fromDate", sql.NVarChar, FromDate || "")
      .input("toDate", sql.NVarChar, Todate || "")
      .execute("Get_MemberEnrolledReport");

    return res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      msg: "Internal Server Error",
      err: error.message,
    });
  }
}

export async function getTDSReport(req, res) {
  try {
    const { MemberId, FromDate, Todate } = req.query;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MemberID", sql.NVarChar(sql.MAX), MemberId || "")
      .input("Fromdate", sql.NVarChar(sql.MAX), FromDate || "")
      .input("Todate", sql.NVarChar(sql.MAX), Todate || "")
      .execute("Get_TDSAdminReportFinal");

    return res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error("getTDSDetail Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getAdminChargeDetail(req, res) {
  try {
    const { MemberId, FromDate, Todate } = req.query;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MemberID", sql.NVarChar(sql.MAX), MemberId || "")
      .input("Fromdate", sql.NVarChar(sql.MAX), FromDate || "")
      .input("Todate", sql.NVarChar(sql.MAX), Todate || "")
      .execute("Get_AdminChargeReport");

    return res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error("getAdminChargeDetail Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getWalletTransferReport(req, res) {
  try {
    const { MemberId, FromDate, Todate } = req.query;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MemberID", sql.VarChar, MemberId)
      .input("Fromdate", sql.DateTime, FromDate)
      .input("Todate", sql.DateTime, Todate).query(`
        SELECT
            wt.MemberID,
            wt.PrevAmount,
            wt.Amount,
            wt.FromMemberID,
            wt.Flag,
            wt.ModifyDate,

            mpi.MemberName AS Status,

            CASE
                WHEN wt.FromMemberID = 'admin'
                THEN 'ADMIN'
                ELSE mpi2.MemberName
            END AS WalletType

        FROM WalletTransfer wt

        LEFT JOIN MemberPersonalInfo mpi
            ON mpi.MemberID = wt.MemberID

        LEFT JOIN MemberPersonalInfo mpi2
            ON mpi2.MemberID = wt.FromMemberID

        WHERE wt.MemberID = @MemberID
          AND CAST(wt.[Date] AS DATE)
              BETWEEN CAST(@Fromdate AS DATE)
                  AND CAST(@Todate AS DATE)

        ORDER BY wt.ModifyDate DESC
      `);

    return res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error("getWalletTransferHistory Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getRepurchaseReport(req, res) {
  try {
    const { MemberID, Fromdate, Todate } = req.query;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MemberID", sql.VarChar, MemberID)
      .input("Fromdate", sql.DateTime, Fromdate)
      .input("Todate", sql.DateTime, Todate).query(`
        SELECT
            rwt.MemberID,
            rwt.PrevAmount,
            rwt.Amount,
            rwt.FromMemberID,
            rwt.Flag,
            rwt.ModifyDate,

            mpi.MemberName AS Status,

            CASE
                WHEN rwt.FromMemberID = 'admin'
                THEN 'ADMIN'
                ELSE mpi2.MemberName
            END AS WalletType

        FROM RepurchaseWalletTransfer rwt

        LEFT JOIN MemberPersonalInfo mpi
            ON mpi.MemberID = rwt.MemberID

        LEFT JOIN MemberPersonalInfo mpi2
            ON mpi2.MemberID = rwt.FromMemberID

        WHERE rwt.MemberID = @MemberID
          AND CAST(rwt.[Date] AS DATE)
              BETWEEN CAST(@Fromdate AS DATE)
                  AND CAST(@Todate AS DATE)

        ORDER BY rwt.ModifyDate DESC
      `);

    return res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error("getRepTransferHistory Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getPayTransferReport(req, res) {
  try {
    const { dateList, memberId } = req.query;

    const pool = await poolPromise;
    console.log(dateList);

    const result = await pool
      .request()
      .input("fromDate", sql.NVarChar(sql.MAX), dateList || "")
      .input("MemberID", sql.NVarChar(sql.MAX), memberId || "")
      .execute("Get_MemberPaymentTransferedDetail");

    return res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      msg: "Internal Server Error",
      err: error.message,
    });
  }
}

export async function getRewardReport(req, res) {
  try {
    const { MemberID, Designation, Fromdate, Todate, all } = req.query;

    const pool = await poolPromise;

    let resultData = [];

    // 1️⃣ DATE RANGE SETUP
    let from = null;
    let to = null;

    if (Fromdate && Todate) {
      from = new Date(Fromdate + " 00:00:00");
      to = new Date(Todate + " 23:59:59");
    }

    // 2️⃣ CASE: DESIGNATION FILTER
    if (Designation) {
      const result = await pool
        .request()
        .input("Designation", sql.VarChar, Designation).query(`
          SELECT *
          FROM MemberRewardSection
          WHERE Designation = @Designation
          ORDER BY ModifyDate DESC
        `);

      for (const itm of result.recordset) {
        const member = await pool
          .request()
          .input("MemberID", sql.VarChar, itm.MemberID).query(`
            SELECT MemberName, ContactNo
            FROM MemberPersonalInfo
            WHERE MemberID = @MemberID
          `);

        resultData.push({
          RewardID: itm.RewardID,
          MemberID: itm.MemberID,
          Designation: itm.Designation,
          RewardName: itm.RewardName,
          RequiredPV: itm.RequiredPV,
          RequiredBV: member.recordset[0]?.ContactNo || null,
          AchievedPV: itm.AchievedPV,
          AchievedBV: itm.AchievedBV,
          AchievedPVAmt: itm.AchievedPVAmt,
          AchievedBVAmt: itm.AchievedBVAmt,
          Status: itm.Status,
          Flag: member.recordset[0]?.MemberName || null,
          ModifyDate: itm.ModifyDate,
        });
      }
    }

    // 3️⃣ CASE: DATE RANGE ONLY
    else if (Fromdate && Todate) {
      const result = await pool.request().query(`
        SELECT *
        FROM MemberRewardSection
        WHERE ModifyDate BETWEEN @from AND @to
      `);

      const grouped = {};

      for (const row of result.recordset) {
        if (!grouped[row.MemberID]) {
          grouped[row.MemberID] = row;
        }
      }

      for (const v of Object.values(grouped)) {
        const member = await pool
          .request()
          .input("MemberID", sql.VarChar, v.MemberID).query(`
            SELECT MemberName, ContactNo
            FROM MemberPersonalInfo
            WHERE MemberID = @MemberID
          `);

        resultData.push({
          RewardID: v.RewardID,
          MemberID: v.MemberID,
          Designation: v.Designation,
          RewardName: v.RewardName,
          AchievedBV: v.AchievedBV,
          AchievedBVAmt: v.AchievedBVAmt,
          AchievedPV: v.AchievedPV,
          AchievedPVAmt: v.AchievedPVAmt,
          Status: v.Status,
          Flag: member.recordset[0]?.MemberName || null,
          ModifyDate: v.ModifyDate,
          RequiredPV: v.RequiredPV,
          RequiredBV: member.recordset[0]?.ContactNo || null,
        });
      }
    }

    // 4️⃣ CASE: MEMBER ID
    else if (MemberID) {
      const result = await pool
        .request()
        .input("MemberID", sql.VarChar, MemberID).query(`
          SELECT *
          FROM MemberRewardSection
          WHERE MemberID = @MemberID
          ORDER BY ModifyDate DESC
        `);

      for (const itm of result.recordset) {
        const member = await pool
          .request()
          .input("MemberID", sql.VarChar, itm.MemberID).query(`
            SELECT MemberName, ContactNo
            FROM MemberPersonalInfo
            WHERE MemberID = @MemberID
          `);

        resultData.push({
          RewardID: itm.RewardID,
          MemberID: itm.MemberID,
          Designation: itm.Designation,
          RewardName: itm.RewardName,
          RequiredPV: itm.RequiredPV,
          RequiredBV: member.recordset[0]?.ContactNo || null,
          AchievedPV: itm.AchievedPV,
          AchievedBV: itm.AchievedBV,
          AchievedPVAmt: itm.AchievedPVAmt,
          AchievedBVAmt: itm.AchievedBVAmt,
          Status: itm.Status,
          Flag: member.recordset[0]?.ContactNo || null,
          ModifyDate: itm.ModifyDate,
        });
      }
    }

    // 5️⃣ CASE: ALL DATA
    else if (all === "All") {
      const result = await pool.request().query(`
        SELECT *
        FROM MemberRewardSection
        ORDER BY ModifyDate DESC
      `);

      for (const itm of result.recordset) {
        const member = await pool
          .request()
          .input("MemberID", sql.VarChar, itm.MemberID).query(`
            SELECT MemberName, ContactNo
            FROM MemberPersonalInfo
            WHERE MemberID = @MemberID
          `);

        resultData.push({
          RewardID: itm.RewardID,
          MemberID: itm.MemberID,
          Designation: itm.Designation,
          RewardName: itm.RewardName,
          RequiredPV: itm.RequiredPV,
          RequiredBV: member.recordset[0]?.ContactNo || null,
          AchievedPV: itm.AchievedPV,
          AchievedBV: itm.AchievedBV,
          AchievedPVAmt: itm.AchievedPVAmt,
          AchievedBVAmt: itm.AchievedBVAmt,
          Status: itm.Status,
          Flag: member.recordset[0]?.ContactNo || null,
          ModifyDate: itm.ModifyDate,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: resultData,
    });
  } catch (error) {
    console.error("getRewardHistory Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getProductSaleReport(req, res) {
  try {
    const { MemberId, FromDate, Todate } = req.query;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MemberID", sql.VarChar, MemberId)
      .input("Fromdate", sql.VarChar, FromDate)
      .input("Todate", sql.VarChar, Todate)
      .execute("Get_SaleProductWiseJoin");

    const data = result.recordset;

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error :", error);
    return res
      .status(500)
      .json({ success: false, msg: "Internal Server Error" });
  }
}

export async function getProductSaleWithJoining(req, res) {
  try {
    const { MemberID, Fromdate, Todate } = req.query;

    let data;

    if (MemberID && Fromdate && Todate) {
      data = await getProductSaleWithJoin({
        MemberID,
        Fromdate,
        Todate,
      });
    } else if (Fromdate && Todate) {
      data = await getProductSaleWithJoin({
        Fromdate,
        Todate,
      });
    } else if (MemberID) {
      data = await getProductSaleWithJoin({
        MemberID,
      });
    } else {
      const today = new Date().toISOString().split("T")[0];

      data = await getProductSaleWithJoin({
        Fromdate: today,
        Todate: today,
      });
    }

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

export async function getProductList(req, res) {
  try {
    try {
      const { MemberID } = req.query;

      if (!MemberID) {
        return res.status(400).json({
          success: false,
          message: "MemberID is required",
        });
      }

      const pool = await poolPromise;

      // Get Member Details
      const memberResult = await pool
        .request()
        .input("MemberID", sql.VarChar, MemberID).query(`
        SELECT MID, StateID
        FROM MemberPersonalInfo
        WHERE MemberID = @MemberID
      `);

      const member = memberResult.recordset[0];

      if (!member) {
        return res.status(404).json({
          success: false,
          message: "Member not found",
        });
      }

      const mid = Number(member.MID);
      const stateId = Number(member.StateID || 0);

      // Get Products
      const productResult = await pool.request().input("MID", sql.BigInt, mid)
        .query(`
        SELECT
          p.Product,
          p.GST,
          d.MRP,
          d.MemberMRP,
          d.Qty
        FROM MemberProductActivationParticular d
        INNER JOIN ProductMaster p
          ON d.ProductID = p.pID
        WHERE d.MID = @MID
      `);

      let totalTaxable = 0;

      const data = productResult.recordset.map((item) => {
        const totalMemberMRP =
          Number(item.MemberMRP || 0) * Number(item.Qty || 0);

        const obj = {
          ProductName: item.Product,
          MRP: Number(item.MRP || 0),
          MemberMRP: Number(item.MemberMRP || 0),
          Qty: Number(item.Qty || 0),
          GST: Number(item.GST || 0),
        };

        // Jharkhand (StateID = 20)
        if (stateId === 20) {
          const halfGST = Number(item.GST) / 2;

          const cgst = (totalMemberMRP * halfGST) / (100 + halfGST);

          const sgst = (totalMemberMRP * halfGST) / (100 + halfGST);

          obj.CGST = Number(cgst.toFixed(2));
          obj.SGST = Number(sgst.toFixed(2));
          obj.IGST = 0;

          obj.CGSTPer = Math.round(halfGST);
          obj.SGSTPer = Math.round(halfGST);
          obj.IGSTPer = 0;

          obj.TaxAbleAmnt =
            totalMemberMRP -
            (Number(cgst.toFixed(2)) + Number(sgst.toFixed(2)));
        } else {
          const igst =
            (totalMemberMRP * Number(item.GST)) / (100 + Number(item.GST));

          obj.IGST = Number(igst.toFixed(2));
          obj.CGST = 0;
          obj.SGST = 0;

          obj.IGSTPer = Math.round(Number(item.GST));
          obj.CGSTPer = 0;
          obj.SGSTPer = 0;

          obj.TaxAbleAmnt = totalMemberMRP - Number(igst.toFixed(2));
        }

        totalTaxable += obj.TaxAbleAmnt;

        obj.TotalTaxAbleAmnt = Number(totalTaxable.toFixed(2));

        return obj;
      });

      return res.status(200).json({
        success: true,
        count: data.length,
        data,
      });
    } catch (error) {
      console.error("GetProductList Error:", error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  } catch (error) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

export async function getPurchaseReport(req, res) {
  try {
    let { FromDate, ToDate, MemberID, OrderNo, PayMode, DeliveryStatus } =
      req.query;

    const pool = await poolPromise;

    let query = `
      SELECT 
        om.OrderNo,
        om.OrderDate,
        om.Name AS CustomerName,
        om.Phone,
        om.City,
        om.TotalAmount,
        om.PayMode,
        om.DeliveryPartner,
        om.TrackingID,

        CASE 
          WHEN om.DeliveryStatus IS NULL OR om.DeliveryStatus = '' 
          THEN 'Pending'
          ELSE om.DeliveryStatus
        END AS DeliveryStatus,

        ISNULL(SUM(oi.Qty), 0) AS ItemCount,
        ISNULL(SUM(oi.CGST), 0) AS TotalCGST,
        ISNULL(SUM(oi.SGST), 0) AS TotalSGST,
        ISNULL(SUM(oi.IGST), 0) AS TotalIGST,
        ISNULL(SUM(oi.CGST + oi.SGST + oi.IGST), 0) AS TotalGST

      FROM OrderMaster om
      LEFT JOIN OrderItems oi ON oi.OrderID = om.OrderNo
      WHERE 1=1
    `;

    let request = pool.request();

    // Date filters
    if (FromDate) {
      query += ` AND om.OrderDate >= @FromDate`;
      request.input("FromDate", sql.DateTime, new Date(FromDate));
    }

    if (ToDate) {
      query += ` AND om.OrderDate < @ToDate`;
      request.input(
        "ToDate",
        sql.DateTime,
        new Date(new Date(ToDate).getTime() + 24 * 60 * 60 * 1000),
      );
    }

    // Filters
    if (OrderNo) {
      query += ` AND om.OrderNo LIKE @OrderNo`;
      request.input("OrderNo", sql.VarChar, `%${OrderNo}%`);
    }

    if (MemberID) {
      query += ` AND CAST(om.MemberID AS VARCHAR) = @MemberID`;
      request.input("MemberID", sql.VarChar, MemberID);
    }

    if (PayMode) {
      query += ` AND om.PayMode = @PayMode`;
      request.input("PayMode", sql.VarChar, PayMode);
    }

    if (DeliveryStatus && DeliveryStatus !== "All") {
      if (DeliveryStatus === "Pending") {
        query += ` AND (om.DeliveryStatus IS NULL OR om.DeliveryStatus = '')`;
      } else {
        query += ` AND om.DeliveryStatus = @DeliveryStatus`;
        request.input("DeliveryStatus", sql.VarChar, DeliveryStatus);
      }
    }

    query += `
      GROUP BY 
        om.OrderNo,
        om.OrderDate,
        om.Name,
        om.Phone,
        om.City,
        om.TotalAmount,
        om.PayMode,
        om.DeliveryPartner,
        om.TrackingID,
        om.DeliveryStatus
      ORDER BY om.OrderDate DESC
    `;

    const result = await request.query(query);

    return res.json({
      status: true,
      totalRecords: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    return res.json({
      status: false,
      message: err.message,
    });
  }
}

export async function getRepurchaseVoucherReport(req, res) {
  try {
    const { MemberId, FromDate, Todate } = req.query;

    const pool = await poolPromise;

    const request = pool.request();

    request.input("MemberID", sql.VarChar, MemberId || null);
    request.input("Fromdate", sql.VarChar, FromDate || null);
    request.input("Todate", sql.VarChar, Todate || null);

    const result = await request.execute("Get_AdminMemberRepurchase");

    let data = result.recordset || [];

    const sync = data.filter((z) => z.OrderStatus && z.OrderStatus === "VOCH");

    return res.json(sync);
  } catch (err) {
    return res.json({
      status: false,
      message: err.message,
    });
  }
}

export async function getVerificationList(req, res) {
  try {
    const { MemberID, Status } = req.query;

    const pool = await poolPromise;

    // Call stored procedure
    const result = await pool
      .request()
      .input("MemberID", sql.VarChar, MemberID)
      .input("fromDate", sql.VarChar, Status)
      .input("toDate", sql.VarChar, "")
      .execute("Get_MemberKYCVefivation");

    const rows = result.recordset;

    const grouped = {};

    rows.forEach((item) => {
      const id = item.KYCMemberID;

      if (!grouped[id]) {
        grouped[id] = {
          KYCMemberID: id,
          MemberName: item.MemberName,
          KYCStatus: item.KYCStatus,
          PHOTO: null,
          PAN: null,
          AADHAR: null,
          PASSBOOK: null,
        };
      }

      // map documents
      if (item.DocName === "PHOTO") {
        grouped[id].PHOTO = item.DocPath;
      } else if (item.DocName === "PAN") {
        grouped[id].PAN = item.DocPath;
      } else if (item.DocName === "AADHAR") {
        grouped[id].AADHAR = item.DocPath;
      } else if (item.DocName === "BANK PASSBOOK") {
        grouped[id].PASSBOOK = item.DocPath;
      }
    });

    return res.json(Object.values(grouped));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error" });
  }
}

export async function getPaidDatesPayout(req, res) {
  try {
    const pool = await poolPromise;

    const result = await pool.request().execute("Get_PaymentDate");

    const data = result.recordset || [];

    const response = data.map((row) => {
      const dt = new Date(row.PaymentDate);

      const year = dt.getFullYear();
      const month = dt.getMonth() + 1;
      const day = dt.getDate();

      return {
        Status: `${day}-${month}-${year}`,
        Flag: `${year}-${month}-${day}`,
      };
    });

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ msg: "Internal Server Error", err: error.message });
  }
}
