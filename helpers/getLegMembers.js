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
            m.MemberID,
            m.MemberName,
            m.PlacementID,
            m.SponserID,
            m.DOJ,
            m.Leaf,
            m.BV,
            ISNULL(r.Designation, '') AS Designation
        FROM Member_View m
        OUTER APPLY (
            SELECT TOP (1) Designation
            FROM MemberRewardSection mr
            WHERE mr.MemberID = m.MemberID
            ORDER BY mr.RewardID DESC
        ) r
        WHERE m.PlacementID IN (${ids})
        ${
          search
            ? `
        AND (
            m.MemberID LIKE @search
            OR m.MemberName LIKE @search
        )
        `
            : ""
        }
  `);

    members.push(...downline.recordset);
    // console.log(members);

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
      rank: m.Designation,
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

export async function getLegMembersForBV(userId, leg) {
  const pool = await poolPromise;

  const result = await pool
    .request()
    .input("userId", sql.NVarChar, userId)
    .input("leg", sql.NVarChar, leg).query(`
      ;WITH Downline AS
      (
          -- First member of the requested leg
          SELECT
              MemberID
          FROM MemberEnrollment
          WHERE PlacementID = @userId
            AND Leaf = @leg

          UNION ALL

          -- Recursively fetch descendants
          SELECT
              md.MemberID
          FROM MemberEnrollment md
          INNER JOIN Downline d
              ON md.PlacementID = d.MemberID
      )

      SELECT
          md.MemberID,
          md.PlacementID,
          md.SponserID,
          md.DOJ,
          md.Leaf
      FROM Downline d
      INNER JOIN MemberEnrollment md
          ON md.MemberID = d.MemberID

      OPTION (MAXRECURSION 0);
    `);

  return result.recordset.map((m) => ({
    id: m.MemberID,
    placementId: m.PlacementID,
    joinDate: m.DOJ,
    leg: m.Leaf,
    active: Number(m.BV || 0) > 0,
  }));
}
