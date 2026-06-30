import express from "express";

import sql from "mssql";
import { poolPromise } from "../db.js";

export async function getLegMembers(
  userId,
  leg,
  queue,
  limit = 10,
  search = "",
) {
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

export async function getLegStats(userId, leg) {
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
