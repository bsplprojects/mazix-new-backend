import sql from "mssql";
import { poolPromise } from "../db.js";

export async function getProductSaleWithJoin({ MemberID, Fromdate, Todate }) {
  const pool = await poolPromise;

  let query = `
    SELECT
      c.BV,
      c.MemberMRP,
      c.Qty,
      c.MPDate,
      d.MemberID,
      d.MemberName
    FROM MemberProductActivationParticular c
    INNER JOIN MemberPersonalInfo d
      ON c.MID = d.MID
    WHERE 1 = 1
  `;

  const request = pool.request();

  if (MemberID) {
    query += ` AND d.MemberID = @MemberID`;
    request.input("MemberID", sql.VarChar, MemberID);
  }

  if (Fromdate && Todate) {
    query += ` AND CAST(c.MPDate AS DATE) BETWEEN @Fromdate AND @Todate`;
    request.input("Fromdate", sql.Date, Fromdate);
    request.input("Todate", sql.Date, Todate);
  }

  const result = await request.query(query);

  const grouped = {};

  result.recordset.forEach((row) => {
    if (!grouped[row.MemberID]) {
      grouped[row.MemberID] = {
        MemberID: row.MemberID,
        MemberName: row.MemberName,
        TotalBV: 0,
        MMRP: 0,
        MPDate: row.MPDate,
      };
    }

    grouped[row.MemberID].TotalBV += Number(row.BV || 0) * Number(row.Qty || 0);

    grouped[row.MemberID].MMRP +=
      Number(row.MemberMRP || 0) * Number(row.Qty || 0);

    grouped[row.MemberID].MPDate = row.MPDate;
  });

  return Object.values(grouped);
}
