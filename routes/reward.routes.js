import express from "express";
import sql from "mssql";

import { poolPromise } from "../db.js";

const router = express.Router();

router.get("/member-reward", async (req, res) => {
  try {
    const MemberID = req.query.MemberID;
    const ses = "2025-26";

    const pool = await poolPromise;

    const frmDate = new Date("2025-07-17 00:00:00");
    const toDate = new Date("2026-07-17 23:59:59");

    const pairResult = await pool
      .request()
      .input("MemberID", sql.VarChar, MemberID)
      .input("frmDate", sql.DateTime, frmDate)
      .input("toDate", sql.DateTime, toDate).query(`
        SELECT ISNULL(SUM(Pair),0) AS TotalPair
        FROM PayoutBinary
        WHERE MemberID=@MemberID
        AND PayoutDate BETWEEN @frmDate AND @toDate
      `);

    const achiverPV = pairResult.recordset[0].TotalPair || 0;

    const rewards = [
      ["Bronze", "Gift", 5, 1000, 500],
      ["Silver", "Gift", 15, 3000, 2000],
      ["Star", "Gift", 40, 6000, 6000],
      ["Double Star", "Gift", 80, 10000, 14000],
      ["Platinum", "Gift", 180, 20000, 32000],
      ["Director", "Gift", 380, 40000, 70000],
      ["Sapphire", "National Tour", 880, 80000, 158000],
      ["Diamond", "Thailand Tour", 2380, 200000, 396000],
      ["Crown", "Sri-Lanka Tour", 6380, 400000, 1034000],
      ["Crown Diamond", "Dubai Tour With Couple", 14380, 800000, 2472000],
      ["Ambassador", "Singapore Tour With Couple", 29380, 2000000, 5410000],
      [
        "Crown Ambassador",
        "Switzerland Couple With 2 Child",
        50000,
        4000000,
        7938000,
      ],
      ["Prince", "London Couple 6D 5N", 75000, 8000000, 10410000],
      [
        "Crown Prince",
        "Star Cruise Couple + 2 Child",
        100000,
        10000000,
        25000000,
      ],
      [
        "King Of Mazix",
        "3 Country with Couple + Child",
        150000,
        20000000,
        50000000,
      ],
    ];

    const rm = [];

    for (const r of rewards) {
      const status = achiverPV >= r[4] ? "Achieved" : "Pending";

      const rewardData = {
        RewardName: r[0],
        Reward: r[1],
        RequiredPV: r[2],
        AchiveBV: r[3],
        AchivePV: (achiverPV / 100).toFixed(2),
        Status: status,
      };

      rm.push(rewardData);

      if (status === "Achieved") {
        const check = await pool
          .request()
          .input("Designation", sql.VarChar, r[0])
          .input("MemberID", sql.VarChar, MemberID)
          .input("Flag", sql.VarChar, ses).query(`
            SELECT * FROM MemberRewardSection
            WHERE Designation=@Designation
            AND MemberID=@MemberID
            AND Flag=@Flag
          `);

        if (check.recordset.length === 0) {
          await pool
            .request()
            .input("Designation", sql.VarChar, r[0])
            .input("RewardName", sql.VarChar, r[1])
            .input("MemberID", sql.VarChar, MemberID)
            .input("RequiredPV", sql.VarChar, r[2])
            .input("AchievedPV", sql.VarChar, rewardData.AchivePV)
            .input("AchievedBV", sql.VarChar, r[3])
            .input("Status", sql.VarChar, status)
            .input("Flag", sql.VarChar, ses).query(`
              INSERT INTO MemberRewardSection
              (Designation,RewardName,MemberID,
               RequiredPV,AchievedPV,AchievedBV,
               Status,Flag,ModifyDate)
              VALUES
              (@Designation,@RewardName,@MemberID,
               @RequiredPV,@AchievedPV,@AchievedBV,
               @Status,@Flag,GETDATE())
            `);
        }
      }
    }

    res.json(rm);
  } catch (err) {
    console.error("Reward Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

export default router;
