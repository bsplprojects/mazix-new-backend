import sql from "mssql";
import { poolPromise } from "../db.js";

export const saveUserInfo = async (req, res) => {
  const mem = req.body;

  if (!mem || mem.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid request data",
    });
  }

  let tmemMRP = 0;
  let TMRP = 0;
  let tBV = 0;

  // replace session
  const MemberID = req.user?.username;
  const MID = req.user?.mid;

  const pool = await sql.connect();

  try {
    // get wallet
    const walletResult = await pool
      .request()
      .input("MemberID", sql.VarChar, MemberID)
      .query(`SELECT dbo.Get_MainWallet(@MemberID) AS Value`);

    const CurrentWallet = Number(walletResult.recordset[0]?.Value || 0);

    if (CurrentWallet < 50) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
      });
    }

    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const request = new sql.Request(transaction);

      // 1. Insert MemberProductActivation
      const insertPro = await request
        .input("MID", sql.BigInt, mem[0].MID)
        .input("MPADate", sql.DateTime, new Date())
        .input("TotalMemberMRP", sql.Decimal(18, 2), mem[0].TotalMemberMRP)
        .input("TotalMRP", sql.Decimal(18, 2), mem[0].TotalMRP)
        .input("TotalBV", sql.Decimal(18, 2), mem[0].TotalBV)
        .input("Status", sql.VarChar, "Active")
        .input("ModifyDate", sql.DateTime, new Date())
        .input("LoginID", sql.BigInt, MID).query(`
          INSERT INTO MemberProductActivation
          (MID, MPADate, TotalMemberMRP, TotalMRP, TotalBV, Status, ModifyDate, LoginID)
          OUTPUT INSERTED.MPActivationID
          VALUES
          (@MID, @MPADate, @TotalMemberMRP, @TotalMRP, @TotalBV, @Status, @ModifyDate, @LoginID)
        `);

      const MPActivationID = insertPro.recordset[0].MPActivationID;

      // 2. Loop products
      for (const item of mem) {
        await request
          .input("MPActivationID", sql.BigInt, MPActivationID)
          .input("MID2", sql.BigInt, mem[0].MID)
          .input("ProductName", sql.VarChar, item.ProductName)
          .input("ProductID", sql.BigInt, item.ProductID)
          .input("MRP", sql.Decimal(18, 2), item.MRP)
          .input("MemberMRP", sql.Decimal(18, 2), item.MemberMRP)
          .input("BV", sql.Decimal(18, 2), item.BV)
          .input("Qty", sql.Int, item.Qty)
          .input("Status", sql.VarChar, "Active")
          .input("MPDate", sql.DateTime, new Date())
          .input("ModifyDate", sql.DateTime, new Date())
          .input("LoginID", sql.BigInt, MID).query(`
            INSERT INTO MemberProductActivationParticulars
            (MPActivationID, MID, ProductName, ProductID, MRP, MemberMRP, BV, Qty, Status, MPDate, ModifyDate, LoginID)
            VALUES
            (@MPActivationID, @MID2, @ProductName, @ProductID, @MRP, @MemberMRP, @BV, @Qty, @Status, @MPDate, @ModifyDate, @LoginID)
          `);

        tmemMRP += Number(item.MemberMRP) * Number(item.Qty);
        TMRP += Number(item.MRP) * Number(item.Qty);
        tBV += Number(item.BV) * Number(item.Qty);
      }

      // 3. Update totals
      await request
        .input("MPActivationID2", sql.BigInt, MPActivationID)
        .input("tBV", sql.Decimal(18, 2), tBV)
        .input("tmemMRP", sql.Decimal(18, 2), tmemMRP)
        .input("TMRP", sql.Decimal(18, 2), TMRP).query(`
          UPDATE MemberProductActivation
          SET TotalBV = @tBV,
              TotalMemberMRP = @tmemMRP,
              TotalMRP = @TMRP
          WHERE MPActivationID = @MPActivationID2
        `);

      // 4. Wallet Used
      const usedMemberID = mem[0].MID;

      const walletUsed = await request
        .input("MID3", sql.BigInt, MID)
        .input("MemberID2", sql.VarChar, MemberID)
        .input("Amount", sql.Decimal(18, 2), tmemMRP)
        .input("TotalBV2", sql.Decimal(18, 2), mem[0].TotalBV)
        .input("UsedMID", sql.BigInt, usedMemberID).query(`
          INSERT INTO WalletUsed
          (MID, MemberID, UsedDate, Amount, TotalBV, UsedType, UsedFor, UsedMID, UsedMemberID, Status, ModifyDate, LoginID)
          OUTPUT INSERTED.WUsedID
          VALUES
          (@MID3, @MemberID2, GETDATE(), @Amount, @TotalBV2,
           'In', 'Member Activation', @UsedMID,
           (SELECT MemberID FROM MemberEnrollments WHERE MID = @UsedMID),
           'Active', GETDATE(), @MID3)
        `);

      const WUsedID = walletUsed.recordset[0].WUsedID;

      // 5. Member Activation
      await request
        .input("MID4", sql.BigInt, usedMemberID)
        .input("WUsedID", sql.BigInt, WUsedID)
        .input("Amount2", sql.Decimal(18, 2), mem[0].TotalMemberMRP)
        .input("BV2", sql.Decimal(18, 2), mem[0].TotalBV).query(`
          INSERT INTO MemberActivation
          (MID, MemberID, TokenID, Amount, BV, Status, ModifyDate, LoginID)
          VALUES
          (@MID4,
           (SELECT MemberID FROM MemberEnrollments WHERE MID = @MID4),
           @WUsedID,
           @Amount2,
           @BV2,
           'Active',
           GETDATE(),
           @MID3)
        `);

      await transaction.commit();

      return res.json({
        success: true,
        message: "User activation completed",
        data: { MPActivationID, WUsedID },
      });
    } catch (err) {
      await transaction.rollback();
      console.error(err);

      return res.status(500).json({
        success: false,
        message: "Transaction failed",
      });
    }
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export async function getMemberDetail(req, res) {
  try {
    const id = req.params.mid;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "MID or MemberID is required",
      });
    }

    const pool = await poolPromise;
    const request = await pool.request();

    let query = `
    SELECT *
    FROM MemberPersonalInfo
  `;

    if (typeof id === "string" && id.toUpperCase().startsWith("MAZ")) {
      query += ` WHERE MemberID = @MemberID`;
      request.input("MemberID", sql.VarChar, id);
    } else {
      query += ` WHERE MID = @MID`;
      request.input("MID", sql.BigInt, Number(id));
    }

    const result = await request.query(query);

    return res.status(200).json({
      success: true,
      data: result.recordset[0] || null,
    });
  } catch (error) {
    console.error("getMemberDetail error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
}

export const getNomineeInfo = async (req, res) => {
  try {
    const mid = req.params.mid;

    console.log(mid);

    const pool = await poolPromise;

    const result = await pool.request().input("MID", sql.BigInt, mid).query(`
        SELECT MNomeeID, MID, Nominee, Sex, Age, Relation
        FROM MemberNomineeDetail
        WHERE MID = @MID
      `);

    let data = result.recordset;

    if (!data || data.length === 0) {
      data = [
        {
          MNomeeID: 0,
          MID: mid,
          Nominee: "",
          Sex: "Male",
          Age: "",
          Relation: "",
        },
      ];
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("getNomineeInfo error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getBankInfo = async (req, res) => {
  try {
    const mid = req.params.mid;

    const pool = await poolPromise;

    const result = await pool.request().input("MID", sql.BigInt, mid).query(`
        SELECT MBankID, MID, AcName, AcNo, AcType, Bank, IFSC, Branch
        FROM MemberBankDetail
        WHERE MID = @MID
      `);

    let data = result.recordset;

    if (data && data.length > 0) {
      data = data.map((item) => ({
        MBankID: item.MBankID,
        MID: item.MID,
        AcName: item.AcName,
        AcNo: item.AcNo,
        AcType: item.AcType,
        Bank: item.Bank,
        IFSC: item.IFSC,
        Branch: item.Branch,
        Flag: item.AcNo && item.AcNo !== "" ? "1" : "0",
      }));
    } else {
      data = [
        {
          MBankID: 0,
          MID: mid,
          AcName: "",
          AcNo: "",
          AcType: "Saving",
          Bank: "",
          IFSC: "",
          Branch: "",
          Flag: "0",
        },
      ];
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("getBankInfo error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getKYCDocumentsList = async (req, res) => {
  try {
    const mid = req.params.mid;

    const pool = await poolPromise;

    const result = await pool.request().input("MID", sql.BigInt, mid).query(`
        SELECT KYCID, MID, MemberID, DocName, DocPath, ModifyDate, Status
        FROM MemberKYC
        WHERE MID = @MID
      `);

    const data = result.recordset || [];

    const response = data.map((item) => ({
      KYCID: item.KYCID,
      MID: item.MID,
      MemberID: item.MemberID,
      DocName: item.DocName,
      DocPath: item.DocPath,
      ModifyDate: item.ModifyDate,
      Status: item.Status,
    }));

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("getKYCDocumentsList error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getMemberIDCardInfo = async (req, res) => {
  try {
    const memid = req.params.mid;

    if (!memid) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const pool = await poolPromise;

    const result = await pool.request().input("MemberID", sql.VarChar, memid)
      .query(`
        SELECT *
        FROM MemberPersonalInfo
        WHERE MemberID = @MemberID
      `);

    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error("GetMemberIDCardInfo Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

export const getLeftRightTeam = async (req, res) => {
  try {
    const memno = req.params.mid;

    if (!memno) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const pool = await poolPromise;

    const rm = [
      {
        MemberID: memno,
        PlacementID: "",
        SponserID: memno,
        Leaf: "",
      },
    ];

    for (let i = 0; i < rm.length; i++) {
      const memberId = rm[i].MemberID;

      const result = await pool
        .request()
        .input("PlacementID", sql.VarChar, memberId).query(`
          SELECT MemberID, SponserID, PlacementID, Leaf
          FROM MemberEnrollment
          WHERE PlacementID = @PlacementID
        `);

      for (const row of result.recordset) {
        rm.push({
          MemberID: row.MemberID,
          SponserID: row.SponserID,
          PlacementID: row.PlacementID,
          Leaf: row.Leaf,
        });
      }
    }

    const leftCount = rm.filter((x) => x.Leaf?.toLowerCase() === "left").length;

    const rightCount = rm.filter(
      (x) => x.Leaf?.toLowerCase() === "right",
    ).length;

    return res.status(200).json({
      Pos1: leftCount,
      Pos2: rightCount,
    });
  } catch (error) {
    console.error("GetLeftRightTeam Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

export const updateMemberDetail = async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  const mid = req.params.mid;

  try {
    await transaction.begin();

    const otpRequest = new sql.Request(transaction);

    const otpExists = await otpRequest.input("OTP", sql.NVarChar, req.body.OTP)
      .query(`
      SELECT TOP 1 *
      FROM OTPMaster
      WHERE OTP = @OTP AND ExpireTime >= GETDATE()
      ORDER BY OTPId DESC
    `);

    if (!otpExists.recordset.length) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid OTP or Expired",
      });
    }

    const checkRequest = new sql.Request(transaction);

    const userExists = await checkRequest.input("MID", sql.BigInt, mid).query(`
      SELECT MID
      FROM MemberPersonalInfo
      WHERE MID = @MID
    `);

    if (!userExists.recordset.length) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Member does not exist",
      });
    }

    const req1 = new sql.Request(transaction);
    await req1
      .input("MemberName", sql.VarChar, req.body.MemberName)
      .input("GuardianName", sql.VarChar, req.body.GuardianName)
      .input("Gender", sql.VarChar, req.body.Gender)
      .input("Age", sql.VarChar, req.body.Age)
      .input("ContactNo", sql.VarChar, req.body.ContactNo)
      .input("EmailID", sql.VarChar, req.body.EmailID)
      .input("NomineeName", sql.VarChar, req.body.NomineeName)
      .input("Relation", sql.VarChar, req.body.Relation)
      .input("MID", sql.BigInt, mid).query(`
      UPDATE MemberPersonalInfo
      SET MemberName = @MemberName,
          GuardianName = @GuardianName,
          Gender = @Gender,
          Age = @Age,
          ContactNo = @ContactNo,
          EmailID = @EmailID
      WHERE MID = @MID
    `);

    const req2 = new sql.Request(transaction);
    await req2
      .input("Nominee", sql.VarChar, req.body.NomineeName)
      .input("Age", sql.VarChar, req.body.NomineeAge)
      .input("Sex", sql.VarChar, req.body.NomineeGender)
      .input("Relation", sql.VarChar, req.body.Relation)
      .input("MID", sql.BigInt, mid).query(`
      UPDATE MemberNomineeDetail
      SET Nominee = @Nominee,
          Age = @Age,
          Sex = @Sex,
          Relation = @Relation
      WHERE MID = @MID
    `);

    const req3 = new sql.Request(transaction);
    await req3
      .input("AcName", sql.VarChar, req.body.AccountName)
      .input("AcNo", sql.VarChar, req.body.AccountNo)
      .input("AcType", sql.VarChar, req.body.AccountType)
      .input("Bank", sql.VarChar, req.body.BankName)
      .input("IFSC", sql.VarChar, req.body.IFSC)
      .input("Branch", sql.VarChar, req.body.Branch)
      .input("MID", sql.BigInt, mid).query(`
      UPDATE MemberBankDetail
      SET AcName = @AcName,
          AcNo = @AcNo,
          AcType = @AcType,
          Bank = @Bank,
          IFSC = @IFSC,
          Branch = @Branch
      WHERE MID = @MID
    `);

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Updated successfully",
    });
  } catch (err) {
    await transaction.rollback();
    console.log(err);
    return res.status(500).json({
      success: false,
      message: "Update failed",
      error: err.message,
    });
  }
};

export const getMemberDashboard = async (req, res) => {
  try {
    const MemberID = req.query?.MemberID;

    if (!MemberID) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const pool = await poolPromise;

    const walletResult = await pool
      .request()
      .input("MemberID", sql.VarChar, MemberID)
      .execute("Get_MainWallet");

    const currentWallet = walletResult.recordset?.[0]?.Value || 0;

    const placementResult = await pool.request().query(`
        SELECT *
        FROM MemberEnrollment
        WHERE PlacementID = '${MemberID}'
      `);

    const getPla = placementResult.recordset;

    const getL = getPla.filter((x) => x.Leaf === "Left");
    const getR = getPla.filter((x) => x.Leaf === "Right");

    let leftBuss = 0;
    let rightBuss = 0;

    // Future Business Calculation
    /*
    if (getL.length > 0) {
      leftBuss = await GetMemberBussinessDateWise(
        getL[0].MemberID,
        "01/01/2022",
        new Date()
      );
    }

    if (getR.length > 0) {
      rightBuss = await GetMemberBussinessDateWise(
        getR[0].MemberID,
        "01/01/2022",
        new Date()
      );
    }
    */

    const repWalletResult = await pool
      .request()
      .input("MemberID", sql.VarChar, MemberID)
      .execute("Get_RepMainWallet");

    const voucherResult = await pool
      .request()
      .input("MemberID", sql.VarChar, MemberID)
      .execute("Get_VoucherAmount");

    const currentRepWallet = repWalletResult.recordset?.[0]?.Value || 0;
    const voucherTotal = voucherResult.recordset?.[0]?.TotalAmount || 0;
    const voucher = voucherResult.recordset?.[0]?.TotalVoucher || 0;

    const obj = {
      CurrentWallet: currentWallet.toString(),
      CurrentRepWallet: currentRepWallet.toString(),
      LeftBV: leftBuss.toString(),
      RightBV: rightBuss.toString(),
      Voucher: voucher.toString(),
      Total: voucherTotal.toString(),
    };

    return res.json({
      success: true,
      data: obj,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch member dashboard",
      error: err.message,
    });
  }
};

export const getMemberReward = async (req, res) => {
  try {
    const MemberID = req.params?.MemberID;

    if (!MemberID) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const pool = await poolPromise;

    const ses = "2025-26";

    const frmDate = new Date("2025-07-17T00:00:00");
    const toDate = new Date("2026-07-17T23:59:59");

    // Binary Pair Total
    const binResult = await pool
      .request()
      .input("MemberID", sql.VarChar, MemberID)
      .input("FromDate", sql.DateTime, frmDate)
      .input("ToDate", sql.DateTime, toDate).query(`
        SELECT ISNULL(SUM(Pair),0) AS Pair
        FROM PayoutBinary
        WHERE MemberID = @MemberID
        AND PayoutDate >= @FromDate
        AND PayoutDate <= @ToDate
      `);

    const achiverPV = Number(binResult.recordset[0]?.Pair || 0);

    const rewards = [
      {
        RewardName: "Bronze",
        Reward: "Gift",
        RequiredPV: "5",
        AchiveBV: "1000",
        Target: 500,
      },
      {
        RewardName: "Silver",
        Reward: "Gift",
        RequiredPV: "15",
        AchiveBV: "3000",
        Target: 2000,
      },
      {
        RewardName: "Star",
        Reward: "Gift",
        RequiredPV: "40",
        AchiveBV: "6000",
        Target: 6000,
      },
      {
        RewardName: "Double Star",
        Reward: "Gift",
        RequiredPV: "80",
        AchiveBV: "10000",
        Target: 14000,
      },
      {
        RewardName: "Platinum",
        Reward: "Gift",
        RequiredPV: "180",
        AchiveBV: "20000",
        Target: 32000,
      },
      {
        RewardName: "Director",
        Reward: "Gift",
        RequiredPV: "380",
        AchiveBV: "40000",
        Target: 70000,
      },
      {
        RewardName: "Sapphire",
        Reward: "National Tour",
        RequiredPV: "880",
        AchiveBV: "80000",
        Target: 158000,
      },
      {
        RewardName: "Diamond",
        Reward: "Thailand Tour",
        RequiredPV: "2380",
        AchiveBV: "200000",
        Target: 396000,
      },
      {
        RewardName: "Crown",
        Reward: "Sri-Lanka Tour",
        RequiredPV: "6380",
        AchiveBV: "400000",
        Target: 1034000,
      },
      {
        RewardName: "Crown Diamond",
        Reward: "Dubai Tour With Couple",
        RequiredPV: "14380",
        AchiveBV: "800000",
        Target: 2472000,
      },
      {
        RewardName: "Ambassador",
        Reward: "Singapore Tour With Couple",
        RequiredPV: "29380",
        AchiveBV: "2000000",
        Target: 5410000,
      },
      {
        RewardName: "Crown Ambassador",
        Reward: "Switzerland Couple With 2 Child",
        RequiredPV: "50000",
        AchiveBV: "4000000",
        Target: 7938000,
      },
      {
        RewardName: "Prince",
        Reward: "London Couple 6D 5N",
        RequiredPV: "75000",
        AchiveBV: "8000000",
        Target: 10410000,
      },
      {
        RewardName: "Crown Prince",
        Reward: "Star Cruise Couple + 2 Child",
        RequiredPV: "100000",
        AchiveBV: "10000000",
        Target: 25000000,
      },
      {
        RewardName: "King Of Mazix",
        Reward: "3 Country with Couple + Child",
        RequiredPV: "150000",
        AchiveBV: "20000000",
        Target: 50000000,
      },
    ];

    const rm = rewards.map((item) => ({
      ...item,
      AchivePV: (achiverPV / 100).toString(),
      Status: achiverPV >= item.Target ? "Achieved" : "Pending",
    }));

    // Insert Achieved Rewards
    for (const reward of rm) {
      if (reward.Status === "Achieved") {
        const checkReward = await pool
          .request()
          .input("Designation", sql.VarChar, reward.RewardName)
          .input("MemberID", sql.VarChar, MemberID)
          .input("Flag", sql.VarChar, ses).query(`
            SELECT TOP 1 *
            FROM MemberRewardSection
            WHERE Designation=@Designation
            AND MemberID=@MemberID
            AND Flag=@Flag
          `);

        if (checkReward.recordset.length === 0) {
          await pool
            .request()
            .input("Designation", sql.VarChar, reward.RewardName)
            .input("RewardName", sql.VarChar, reward.Reward)
            .input("MemberID", sql.VarChar, MemberID)
            .input("RequiredPV", sql.VarChar, reward.RequiredPV)
            .input("RequiredBV", sql.VarChar, reward.AchiveBV)
            .input("AchievedPV", sql.VarChar, reward.AchivePV)
            .input("AchievedBV", sql.VarChar, reward.AchiveBV)
            .input("Status", sql.VarChar, reward.Status)
            .input("AchievedPVAmt", sql.Decimal(18, 2), Number(reward.AchivePV))
            .input("AchievedBVAmt", sql.Decimal(18, 2), Number(reward.AchiveBV))
            .input("Flag", sql.VarChar, ses).query(`
              INSERT INTO MemberRewardSection
              (
                Designation,
                RewardName,
                MemberID,
                RequiredPV,
                RequiredBV,
                AchievedPV,
                AchievedBV,
                Status,
                AchievedPVAmt,
                AchievedBVAmt,
                Flag,
                ModifyDate
              )
              VALUES
              (
                @Designation,
                @RewardName,
                @MemberID,
                @RequiredPV,
                @RequiredBV,
                @AchievedPV,
                @AchievedBV,
                @Status,
                @AchievedPVAmt,
                @AchievedBVAmt,
                @Flag,
                GETDATE()
              )
            `);
        }
      }
    }

    return res.json({
      success: true,
      data: rm,
    });
  } catch (error) {
    console.error("getMemberRewardReward Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getInvoiceAtJoining = async (req, res) => {
  try {
    const memberId = req.params?.id;

    const pool = await poolPromise;

    const result = await pool.request().input("MemberID", sql.VarChar, memberId)
      .query(`
        SELECT
            d.MemberID,
            d.MemberName,
            SUM(ISNULL(c.BV,0) * ISNULL(c.Qty,0)) AS TotalBV,
            SUM(ISNULL(c.MemberMRP,0) * ISNULL(c.Qty,0)) AS MMRP,
            MAX(c.MPDate) AS MPDate
        FROM MemberProductActivationParticular c
        INNER JOIN MemberPersonalInfo d
            ON c.MID = d.MID
        WHERE d.MemberID = @MemberID
        GROUP BY d.MemberID, d.MemberName
      `);

    return res.status(200).json({
      status: true,
      data: result.recordset,
    });
  } catch (error) {
    console.log(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch member dashboard",
      error: err.message,
    });
  }
};

export const uploadUserKYCDocs = async (req, res) => {
  try {
    const { mid, memberID } = req.query;
    const files = req.files;

    if (!files || Object.keys(files).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files selected.",
      });
    }

    const pool = await poolPromise;

    const documentMapping = {
      Aadhar: "AADHAR",
      Pan: "PAN",
      Passbook: "BANK PASSBOOK",
      Photo: "PHOTO",
    };

    for (const [fieldName, docName] of Object.entries(documentMapping)) {
      const uploadedFile = files[fieldName]?.[0];

      if (!uploadedFile) continue;

      const docPath = `../../Uploads/${uploadedFile.filename}`;

      const existing = await pool
        .request()
        .input("MemberID", sql.VarChar, memberID).query(`
          SELECT KYCID
          FROM MemberKYC
          WHERE MemberID = @MemberID
        `);

      if (existing.recordset.length > 0) {
        // Update existing document
        await pool
          .request()
          .input("MemberID", sql.VarChar, memberID)
          .input("DocName", sql.VarChar, docName)
          .input("DocPath", sql.VarChar, docPath)
          .input("ModifyDate", sql.DateTime, new Date()).query(`
            UPDATE MemberKYC
            SET
              DocPath = @DocPath,
              Status = 'Not Verified',
              ModifyDate = @ModifyDate
            WHERE MemberID = @MemberID 
            AND DocName = @DocName
          `);
      } else {
        // Insert new document
        await pool
          .request()
          .input("MID", sql.BigInt, mid)
          .input("MemberID", sql.VarChar, memberID)
          .input("DocName", sql.VarChar, docName)
          .input("DocPath", sql.VarChar, docPath)
          .input("Status", sql.VarChar, "Not Verified")
          .input("ModifyDate", sql.DateTime, new Date()).query(`
            INSERT INTO MemberKYC
            (
              MID,
              MemberID,
              DocName,
              DocPath,
              Status,
              ModifyDate
            )
            VALUES
            (
              @MID,
              @MemberID,
              @DocName,
              @DocPath,
              @Status,
              @ModifyDate
            )
          `);
      }
    }

    return res.json({
      success: true,
      message: "Documents uploaded successfully.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updatePersonalInfo = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      MemberName,
      EmailID,
      Gender,
      Address,
      District,
      StateID,
      Pincode,
      Country,
      ContactNo,
    } = req.body;

    const pool = await poolPromise;

    await pool
      .request()
      .input("MemberID", sql.NVarChar, id)
      .input("MemberName", sql.NVarChar, MemberName)
      .input("EmailID", sql.NVarChar, EmailID)
      .input("Gender", sql.NVarChar, Gender)
      .input("Address", sql.NVarChar, Address)
      .input("District", sql.Int, Number(District))
      .input("StateID", sql.Int, Number(StateID))
      .input("Pincode", sql.NVarChar, Pincode)
      .input("Country", sql.NVarChar, Country)
      .input("ContactNo", sql.NVarChar, ContactNo)
      .query(`UPDATE MemberPersonalInfo
        SET
            MemberName = @MemberName,
            Gender = @Gender,
            Address = @Address,
            District = @District,
            Country = @Country,
            Pincode = @Pincode,
            ContactNo = @ContactNo,
            EmailID = @EmailID,
            StateID = @StateID,
            ModifyDate = GETDATE(),
            Status = 'Active'
        WHERE MemberID = @MemberID
      `);

    return res.json({
      success: true,
      message: "Personal information updated successfully.",
    });
  } catch (error) {
    console.error("Update Personal Info:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateNomineeInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, age, sex, relation } = req.body;

    const pool = await poolPromise;

    // Check if nominee already exists
    const existing = await pool.request().input("MID", sql.BigInt, id).query(`
        SELECT MNomeeID
        FROM MemberNomineeDetail
        WHERE MID = @MID
      `);

    if (existing.recordset.length > 0) {
      // Update existing nominee
      await pool
        .request()
        .input("MNomeeID", sql.BigInt, id)
        .input("Nominee", sql.NVarChar, name)
        .input("Age", sql.Int, age)
        .input("Sex", sql.NVarChar, sex)
        .input("Relation", sql.NVarChar, relation).query(`
          UPDATE MemberNomineeDetail
          SET
              Nominee = @Nominee,
              Age = @Age,
              Sex = @Sex,
              Relation = @Relation,
              Status = 'Active'
          WHERE MNomeeID = @MNomeeID
        `);
    } else {
      // Insert new nominee
      await pool
        .request()
        .input("MID", sql.BigInt, id)
        .input("Nominee", sql.NVarChar, name)
        .input("Age", sql.Int, age)
        .input("Sex", sql.NVarChar, sex)
        .input("Relation", sql.NVarChar, relation ? relation : "Nothing")
        .query(`
          INSERT INTO MemberNomineeDetails
          (
              MID,
              Nominee,
              Age,
              Sex,
              Relation,
              Status
          )
          VALUES
          (
              @MID,
              @Nominee,
              @Age,
              @Sex,
              @Relation,
              'Active'
          )
        `);
    }

    return res.json({
      success: true,
      message: "Nominee information updated successfully.",
    });
  } catch (error) {
    console.error("Update Nominee Info:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateBankInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const { accountHolder, bankName, accNo, ifsc, branch, accType } = req.body;
    console.log(id);
    const pool = await poolPromise;

    // Check if bank details already exist
    const existing = await pool.request().input("MID", sql.BigInt, Number(id))
      .query(`
        SELECT MBankID
        FROM MemberBankDetail
        WHERE MID = @MID
      `);

    if (existing.recordset.length > 0) {
      // Update existing bank details
      await pool
        .request()
        .input("MID", sql.BigInt, Number(id))
        .input("AcName", sql.NVarChar, accountHolder)
        .input("AcNo", sql.NVarChar, accNo)
        .input("AcType", sql.NVarChar, accType)
        .input("Bank", sql.NVarChar, bankName)
        .input("IFSC", sql.NVarChar, ifsc)
        .input("Branch", sql.NVarChar, branch)
        .input("ModifyDate", sql.DateTime, new Date()).query(`
          UPDATE MemberBankDetail
          SET
              AcName = @AcName,
              MID = @MID,
              AcNo = @AcNo,
              AcType = @AcType,
              Bank = @Bank,
              IFSC = @IFSC,
              Branch = @Branch,
              ModifyDate = @ModifyDate,
              Status = 'Active'
          WHERE MID = @MID
        `);
    } else {
      // Insert new bank details
      await pool
        .request()
        .input("MID", sql.BigInt, id)
        .input("AcName", sql.NVarChar, accountHolder)
        .input("AcNo", sql.NVarChar, accNo)
        .input("AcType", sql.NVarChar, accType)
        .input("Bank", sql.NVarChar, bankName)
        .input("IFSC", sql.NVarChar, ifsc)
        .input("Branch", sql.NVarChar, branch)
        .input("ModifyDate", sql.DateTime, new Date()).query(`
          INSERT INTO MemberBankDetail
          (
              MID,
              AcName,
              AcNo,
              AcType,
              Bank,
              IFSC,
              Branch,
              ModifyDate,
              Status
          )
          VALUES
          (
              @MID,
              @AcName,
              @AcNo,
              @AcType,
              @Bank,
              @IFSC,
              @Branch,
              @ModifyDate,
              'Active'
          )
        `);
    }

    return res.json({
      success: true,
      message: "Bank information updated successfully.",
    });
  } catch (error) {
    console.error("Update Bank Info:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
