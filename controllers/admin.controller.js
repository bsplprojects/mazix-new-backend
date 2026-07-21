import sql from "mssql";
import { poolPromise } from "../db.js";
import OOPs from "../OOPs.js";
import jwt from "jsonwebtoken";
import { generateOTP } from "../utils/generateOTP.js";
import { sendMail } from "../utils/sendMail.js";

export const adminLogin = async (req, res) => {
  try {
    const { MemberID, Password } = req.body;

    if (!MemberID || !Password) {
      return res.status(400).json({
        success: false,
        message: "MemberID and Password are required",
      });
    }

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MemberID", sql.NVarChar, MemberID).query(`
        SELECT TOP 1
          LoginID,
          MID,
          Password,
          MemberID,
          UserType,
          UserID,
          Status,
          Flag
        FROM MemberLoginDetail
        WHERE MemberID = @MemberID
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid Username or Password",
      });
    }

    const adminPassword = result.recordset[0].Password;
    const decryptedPassword = await OOPs.decrypt(adminPassword);

    if (decryptedPassword !== Password) {
      return res.status(401).json({
        success: false,
        message: "Invalid Username or Password",
      });
    }

    const user = result.recordset[0];

    if (user.Status === false || user.Flag === false) {
      return res.status(403).json({
        success: false,
        message: "Account blocked",
      });
    }

    const token = jwt.sign(
      {
        MID: user.MID,
        MemberID: user.MemberID,
        UserType: user.UserType,
        role: "admin",
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    // return the token in the cookies
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Internal Server Error",
      error: error.message,
    });
  }
};

export const getHeaderValue = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().execute("Get_DashboardData");

    const data = result.recordset?.[0];

    if (!data) {
      return res.json([]);
    }

    return res.status(200).json({ success: true, msg: "Fetched", data });
  } catch (err) {
    console.error("GetHeaderValue Error:", err);
    return res.status(500).json({
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

export const getDashboardCharts = async (req, res) => {
  try {
    const pool = await poolPromise;

    const dt = new Date();
    const year = dt.getFullYear();
    const month = dt.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();

    const barChart = [];

    for (let i = 1; i <= daysInMonth; i++) {
      const dtF = new Date(year, month - 1, i);
      const dtT = new Date(year, month - 1, i + 1);

      const result = await pool
        .request()
        .input("dtF", sql.DateTime, dtF)
        .input("dtT", sql.DateTime, dtT).query(`
          SELECT COUNT(*) AS total
          FROM MemberEnrollment
          WHERE DOJ >= @dtF AND DOJ < @dtT
        `);

      barChart.push({
        day: i,
        members: result.recordset[0]?.total || 0,
      });
    }

    const packageResult = await pool.request().query(`
      SELECT PackageID, PackageName
      FROM AdmPackageMaster
      WHERE Status = 'Active'
    `);

    const packages = packageResult.recordset;

    const pieChart = [];

    for (let i = 0; i < packages.length; i++) {
      const pkg = packages[i];

      const valResult = await pool
        .request()
        .input("PackageID", sql.Int, pkg.PackageID)
        .execute("Get_AdminByPackage");

      const value = valResult.recordset?.[0] || 0;

      pieChart.push({
        name: pkg.PackageName,
        value: Number(value),
      });
    }

    return res.status(200).json({
      barChart,
      pieChart,
    });
  } catch (err) {
    console.error("Dashboard Error:", err);
    return res.status(500).json({
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

export const getAllMembers = async (req, res) => {
  try {
    const { MemberID, Fromdate, Todate, page = 1, limit = 10 } = req.query;

    const offset = (page - 1) * limit;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MemberID", sql.VarChar, MemberID)
      .input("Fromdate", sql.VarChar, Fromdate || null)
      .input("Todate", sql.VarChar, Todate || null)
      .execute("Get_MemberInfoReport");

    let data = result.recordset;

    // Apply date filter only if both dates are provided
    if (Fromdate && Todate) {
      const from = new Date(Fromdate);
      const to = new Date(Todate);
      to.setHours(23, 59, 59, 999);

      if (from > to) {
        return res.status(400).json({
          success: false,
          message: "Fromdate should be less than Todate",
        });
      }

      data = data.filter((row) => {
        const modifyDate = new Date(row.ModifyDate);
        return modifyDate >= from && modifyDate <= to;
      });
    }

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Members Error:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const getAdminTokenList = async (req, res) => {
  try {
    const {
      txtMemberID,
      TokenDropDownList,
      PackageDropDownList,
      Fromdate,
      Todate,
    } = req.query;

    let memberId = txtMemberID;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("memberNo", sql.VarChar, memberId || "")
      .input("tokenType", sql.VarChar, TokenDropDownList || "")
      .input("package", sql.VarChar, PackageDropDownList || "")
      .input("Fdate", sql.VarChar, Fromdate || "")
      .input("Tdate", sql.VarChar, Todate || "")
      .execute("Get_TokenGenerated");

    const data = result.recordset.map((row) => ({
      TokenID: Number(row.TokenID),
      TokenSecretID: row.TokenSecretID,

      TokenDateStr: row.TokenDate
        ? new Date(row.TokenDate).toLocaleDateString("en-GB")
        : "",

      TokenTimeStr: row.TokenTime ? String(row.TokenTime).substring(0, 5) : "",

      TokenType: row.TokenType,
      PackageName: row.PackageName,
      GeneratedBy: row.GeneratedBy,
      Status: row.Status,
      TokenNo: row.TokenNo,

      FromMemberID: `${row.FromMemberID} (${row.FromMemberName || "Admin"})`,

      ToMemberID: `${row.ToMemberID} (${row.MemberName || ""})`,
    }));

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Token Error:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const getPackagesList = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT PackageID, PackageName, Amount, Status
      FROM AdmPackageMaster
    `);

    const hos = result.recordset;

    return res.status(200).json({ success: true, data: hos });
  } catch (error) {
    console.error("GetPackageList Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getNewsFeed = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT *
      FROM NewsAnnounce
      WHERE Status = 'Active'
      ORDER BY NewsID DESC
    `);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error("Get News Feed Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const sendToken = async (req, res) => {
  const transaction = new sql.Transaction();

  try {
    const Members = req.body;

    if (!Members || !Members.length) {
      return res.status(400).json({
        success: false,
        message: "Members data is required",
      });
    }

    const member = Members[0];

    const pool = await poolPromise;

    await transaction.begin();

    // Insert into AdmTokenSecretMaster
    const masterRequest = new sql.Request(transaction);

    const masterResult = await masterRequest
      .input("TokenSecretID", sql.VarChar, "")
      .input("PackageID", sql.BigInt, member.PackageID)
      .input("TokenTypeID", sql.BigInt, member.TokenTypeID)
      .input("TokenNo", sql.Int, member.TokenNo)
      .input("PayMode", sql.VarChar, member.PayMode)
      .input("TokenDate", sql.Date, new Date())
      .input("TokenTime", sql.Time, new Date())
      .input("GeneratedBy", sql.VarChar, "Admin")
      .input("Status", sql.VarChar, "Active")
      .input("ModifyDate", sql.DateTime, new Date())
      .input("LoginID", sql.BigInt, req.session.LoginID).query(`
        INSERT INTO AdmTokenSecretMaster
        (
          TokenSecretID,
          PackageID,
          TokenTypeID,
          TokenNo,
          PayMode,
          TokenDate,
          TokenTime,
          GeneratedBy,
          Status,
          ModifyDate,
          LoginID
        )
        OUTPUT INSERTED.TokenID
        VALUES
        (
          @TokenSecretID,
          @PackageID,
          @TokenTypeID,
          @TokenNo,
          @PayMode,
          @TokenDate,
          @TokenTime,
          @GeneratedBy,
          @Status,
          @ModifyDate,
          @LoginID
        )
      `);

    const tokenID = masterResult.recordset[0].TokenID;

    if (tokenID) {
      // Get Secret Settings
      const settingResult = await new sql.Request(transaction).query(`
        SELECT TOP 1 *
        FROM AdmSecretSettingMaster
        WHERE ID = 1
      `);

      const setting = settingResult.recordset[0];

      const randomGenerator = new RandomGenerator();

      for (let i = 0; i < member.TokenNo; i++) {
        let secretKey = "";

        if (setting.KeyType === "Numeric") {
          secretKey = randomGenerator.randomNumber(
            Number(setting.KeyLengthMin),
            Number(setting.KeyLengthMax),
          );
        } else {
          secretKey = randomGenerator.randomPassword();
        }

        await new sql.Request(transaction)
          .input("TokenSecretID", sql.VarChar, secretKey.toString())
          .input("TokenID", sql.BigInt, tokenID)
          .input("FromMemberID", sql.VarChar, req.session.UserName)
          .input("ToMemberID", sql.VarChar, member.ToMemberID)
          .input("IsActivate", sql.VarChar, "No")
          .input("Status", sql.VarChar, "Active")
          .input("ModifyDate", sql.DateTime, new Date())
          .input("LoginID", sql.BigInt, req.session.LoginID).query(`
            INSERT INTO AdmTokenSecretTransferList
            (
              TokenSecretID,
              TokenID,
              FromMemberID,
              ToMemberID,
              IsActivate,
              Status,
              ModifyDate,
              LoginID
            )
            VALUES
            (
              @TokenSecretID,
              @TokenID,
              @FromMemberID,
              @ToMemberID,
              @IsActivate,
              @Status,
              @ModifyDate,
              @LoginID
            )
          `);
      }
    }

    await transaction.commit();

    return res.json({
      success: true,
      data: 1,
    });
  } catch (error) {
    await transaction.rollback();

    console.error("InsertTokenTransfer Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const addPackage = async (req, res) => {
  try {
    const { PackageID, PackageName, Amount, Status } = req.body;

    const pool = await poolPromise;

    if (PackageID && Number(PackageID) > 0) {
      // Update Package
      await pool
        .request()
        .input("PackageID", sql.BigInt, PackageID)
        .input("PackageName", sql.VarChar, PackageName)
        .input("Amount", sql.Decimal(18, 2), Amount)
        .input("Status", sql.VarChar, Status)
        .input("ModifyDate", sql.DateTime, new Date()).query(`
          UPDATE AdmPackageMaster
          SET
            PackageName = @PackageName,
            Amount = @Amount,
            Status = @Status,
            ModifyDate = @ModifyDate
          WHERE PackageID = @PackageID
        `);
    } else {
      // Insert Package
      await pool
        .request()
        .input("PackageName", sql.VarChar, PackageName)
        .input("Amount", sql.Decimal(18, 2), Amount)
        .input("Status", sql.VarChar, Status)
        .input("ModifyDate", sql.DateTime, new Date()).query(`
          INSERT INTO AdmPackageMaster
          (
            PackageName,
            Amount,
            Status,
            ModifyDate
          )
          VALUES
          (
            @PackageName,
            @Amount,
            @Status,
            @ModifyDate
          )
        `);
    }

    return res.json({
      success: true,
      data: 1,
    });
  } catch (error) {
    console.error("InsertPackage Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const addEvent = async (req, res) => {
  try {
    const { ID, Type, Status } = req.body;

    const pool = await poolPromise;

    if (ID && Number(ID) > 0) {
      // Update Event
      await pool
        .request()
        .input("ID", sql.BigInt, ID)
        .input("Type", sql.VarChar, Type)
        .input("Status", sql.VarChar, Status)
        .input("ModifyDate", sql.DateTime, new Date()).query(`
          UPDATE Eventmaster
          SET
            Type = @Type,
            Status = @Status,
            ModifyDate = @ModifyDate
          WHERE ID = @ID
        `);
    } else {
      // Insert Event
      await pool
        .request()
        .input("Type", sql.VarChar, Type)
        .input("Status", sql.VarChar, Status)
        .input("ModifyDate", sql.DateTime, new Date()).query(`
          INSERT INTO Eventmaster
          (
            Type,
            Status,
            ModifyDate
          )
          VALUES
          (
            @Type,
            @Status,
            @ModifyDate
          )
        `);
    }

    return res.json({
      success: true,
      data: 1,
    });
  } catch (error) {
    console.error("InsertEvent Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getEventsHistory = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT *
      FROM Eventmaster WHERE LOWER(Status) = 'active'
      ORDER BY ID DESC
    `);

    return res.status(200).json({ success: false, data: result.recordset });
  } catch (error) {
    console.error("GetEventHistory Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getProducts = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search } = req.query;
    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);

    const offset = (pageNumber - 1) * pageSizeNumber;

    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("offset", sql.Int, offset)
      .input("pageSize", sql.Int, pageSizeNumber)
      .input("search", sql.VarChar, `%${search}%`).query(`
      SELECT
        p.pID,
        p.pCatID,
        p.Product,
        p.Details,
        p.Description,
        p.MRP,
        p.MemberMRP,
        p.StockistMRP,
        p.GST,
        p.Status,
        p.Image,
        p.Repurchase,
        p.BV,
        p.Discount,
        p.stock,
        c.Category
      FROM ProductMaster p
      INNER JOIN ProductCategory c
        ON p.pCatID = c.pCatID
      WHERE LOWER(p.Product) LIKE @search
      ORDER BY c.Category
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY
    `);

    // count request
    const total = await pool.request().query(`
      SELECT COUNT(*) as total FROM ProductMaster
    `);

    const count = total.recordset[0].total;

    const list = result.recordset.map((row) => ({
      pID: row.pID,
      pCatID: row.pCatID,
      Product: row.Product,
      Details: row.Details,
      Description: row.Description,
      MRP: row.MRP,
      MemberMRP: row.MemberMRP,
      StockistMRP: row.StockistMRP,
      GST: row.GST,
      Status: row.Status,
      Image: row.Image,
      Repurchase: row.Repurchase,
      BV: row.BV,
      Discount: row.Discount,
      stock: row.stock,
      Joining: row.Category,
    }));

    return res.status(200).json({
      success: true,
      list,
      pagination: {
        page: pageNumber,
        pageSize: pageSizeNumber,
        total: count,
        totalPages: Math.ceil(count / pageSizeNumber),
        hasNext: pageNumber < Math.ceil(count / pageSizeNumber),
        hasPrev: pageNumber > 1,
      },
    });
  } catch (error) {
    console.error("GetProductList Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getCategories = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT *
      FROM ProductCategory
      ORDER BY pCatID DESC
    `);

    return res.json(result.recordset);
  } catch (error) {
    console.error("GetCategoryHistory Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const addCategory = async (req, res) => {
  try {
    const { pCatID, Category, seqOnline, Status, Image } = req.body;

    let imageURL = Image || null;

    if (req.file?.filename) {
      imageURL = `../../Uploads/${req.file.filename}`;
    }

    const pool = await poolPromise;

    if (pCatID && Number(pCatID) > 0) {
      // Update Category

      if (!req.file?.filename && !Image) {
        const existingProduct = await pool
          .request()
          .input("pCatID", sql.BigInt, pCatID).query(`
            SELECT Image
            FROM ProductCategory
            WHERE pCatID = @pID
          `);

        imageURL = existingProduct.recordset[0]?.Image || null;
      }

      await pool
        .request()
        .input("pCatID", sql.BigInt, pCatID)
        .input("Category", sql.NVarChar, Category)
        .input("seqOnline", sql.Int, seqOnline)
        .input("Status", sql.VarChar, Status)
        .input("Image", sql.VarChar, imageURL)
        .input("ModifyDate", sql.DateTime, new Date()).query(`
          UPDATE ProductCategory
          SET
            Category = @Category,
            seqOnline = @seqOnline,
            Status = @Status,
            ModifyDate = @ModifyDate,
            Image = @Image
          WHERE pCatID = @pCatID
        `);
    } else {
      // Insert Category
      await pool
        .request()
        .input("Category", sql.NVarChar, Category)
        .input("seqOnline", sql.Int, seqOnline)
        .input("Status", sql.VarChar, Status)
        .input("Image", sql.VarChar, imageURL)
        .input("ModifyDate", sql.DateTime, new Date()).query(`
          INSERT INTO ProductCategory
          (
            Category,
            seqOnline,
            Status,
            ModifyDate,
            Image
          )
          VALUES
          (
            @Category,
            @seqOnline,
            @Status,
            @ModifyDate,
            @Image
          )
        `);
    }

    return res.json({
      success: true,
      data: 1,
    });
  } catch (error) {
    console.error("InsertCategory Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const addProduct = async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const {
      pID,
      pCatID,
      Product,
      Description,
      MRP,
      MemberMRP,
      StockistMRP,
      GST,
      Status,
      Discount,
      BV,
      Repurchase,
      seqOnline,
      Image,
      stock,
    } = req.body;

    let imageURL = Image || null;

    if (req.file?.filename) {
      imageURL = `../../Uploads/${req.file.filename}`;
    }

    if (pID && Number(pID) > 0) {
      if (!req.file?.filename && !Image) {
        const existingProduct = await new sql.Request(transaction).input(
          "pID",
          sql.BigInt,
          pID,
        ).query(`
            SELECT Image
            FROM ProductMaster
            WHERE pID = @pID
          `);

        imageURL = existingProduct.recordset[0]?.Image || null;
      }

      await new sql.Request(transaction)
        .input("pID", sql.BigInt, pID)
        .input("pCatID", sql.BigInt, pCatID)
        .input("Product", sql.NVarChar, Product)
        .input("Description", sql.NVarChar(sql.MAX), Description)
        .input("MRP", sql.Decimal(18, 2), MRP)
        .input("MemberMRP", sql.Decimal(18, 2), MemberMRP)
        .input("StockistMRP", sql.Decimal(18, 2), StockistMRP)
        .input("GST", sql.Decimal(18, 2), GST)
        .input("Status", sql.VarChar, Status || "Active")
        .input("Discount", sql.Decimal(18, 2), Discount)
        .input("BV", sql.Decimal(18, 2), BV)
        .input("Repurchase", sql.NVarChar, Repurchase || "0")
        .input("seqOnline", sql.Int, Number(seqOnline) || 0)
        .input("Image", sql.NVarChar, imageURL)
        .input("stock", sql.Decimal(18, 2), Number(stock) || 0)
        .input("ModifyDate", sql.DateTime, new Date()).query(`
          UPDATE ProductMaster
          SET
            pCatID = @pCatID,
            Product = @Product,
            Description = @Description,
            MRP = @MRP,
            MemberMRP = @MemberMRP,
            StockistMRP = @StockistMRP,
            GST = @GST,
            Status = @Status,
            Discount = @Discount,
            BV = @BV,
            Repurchase = @Repurchase,
            seqOnline = @seqOnline,
            Image = @Image,
            stock = @stock,
            ModifyDate = @ModifyDate
          WHERE pID = @pID
        `);

      await new sql.Request(transaction)
        .input("pID", sql.BigInt, pID)
        .input("stock", sql.Decimal(18, 2), Number(stock) || 0)
        .input("Product", sql.NVarChar, Product).query(`
          UPDATE stockDetail
          SET
            Status = 'Restocked-by-Admin',
            stock = @stock,
            Product = @Product,
            UpdatedAt = GETDATE()
          WHERE pID = @pID
        `);
    } else {
      const insertResult = await new sql.Request(transaction)
        .input("pCatID", sql.BigInt, pCatID)
        .input("Product", sql.NVarChar, Product)
        .input("Description", sql.NVarChar(sql.MAX), Description)
        .input("MRP", sql.Decimal(18, 2), MRP)
        .input("MemberMRP", sql.Decimal(18, 2), MemberMRP)
        .input("StockistMRP", sql.Decimal(18, 2), StockistMRP)
        .input("GST", sql.Decimal(18, 2), GST)
        .input("Status", sql.VarChar, Status || "Active")
        .input("Discount", sql.Decimal(18, 2), Discount)
        .input("BV", sql.Decimal(18, 2), BV)
        .input("Repurchase", sql.NVarChar, Repurchase || "0")
        .input("seqOnline", sql.Int, Number(seqOnline) || 0)
        .input("Image", sql.NVarChar, imageURL)
        .input("stock", sql.Decimal(18, 2), Number(stock) || 0)
        .input("ModifyDate", sql.DateTime, new Date()).query(`
          INSERT INTO ProductMaster
          (
            pCatID,
            Product,
            Description,
            MRP,
            MemberMRP,
            StockistMRP,
            GST,
            Status,
            Discount,
            BV,
            Repurchase,
            seqOnline,
            Image,
            stock,
            ModifyDate
          )
          OUTPUT INSERTED.pID
          VALUES
          (
            @pCatID,
            @Product,
            @Description,
            @MRP,
            @MemberMRP,
            @StockistMRP,
            @GST,
            @Status,
            @Discount,
            @BV,
            @Repurchase,
            @seqOnline,
            @Image,
            @stock,
            @ModifyDate
          )
        `);

      const newPID = insertResult.recordset[0].pID;

      await new sql.Request(transaction)
        .input("pID", sql.BigInt, newPID)
        .input("Product", sql.NVarChar, Product)
        .input("stock", sql.Decimal(18, 2), stock).query(`
          INSERT INTO stockDetail
          (
            pID,
            Status,
            Product,
            stock,
            updatedStock,
            CreatedAt,
            UpdatedAt
          )
          VALUES
          (
            @pID,
            'Created',
            @Product,
            @stock,
            0,
            GETDATE(),
            GETDATE()
          )
        `);
    }

    await transaction.commit();

    const result = await pool.request().query(`
      SELECT
        pm.*,
        pc.Category
      FROM ProductMaster pm
      INNER JOIN ProductCategory pc
        ON pm.pCatID = pc.pCatID
      ORDER BY pc.Category
    `);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    if (transaction._aborted !== true) {
      try {
        await transaction.rollback();
      } catch (e) {
        console.error("Rollback Error:", e);
      }
    }

    console.error("InsertProduct Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const addNews = async (req, res) => {
  try {
    const { NewsAnnounce1, DisplayFor } = req.body;

    if (!NewsAnnounce1 || !DisplayFor) {
      return res.status(400).json({
        success: false,
        message: "NewsAnnounce1 and DisplayFor are required",
      });
    }

    const pool = await poolPromise;

    await pool
      .request()
      .input("NewsAnnounce", sql.NVarChar(sql.MAX), NewsAnnounce1)
      .input("DisplayFor", sql.NVarChar(100), DisplayFor)
      .input("Status", sql.NVarChar(20), "Active")
      .input("ModifyDate", sql.DateTime, new Date()).query(`
        INSERT INTO NewsAnnounce
        (
          NewsAnnounce,
          DisplayFor,
          Status,
          ModifyDate
        )
        VALUES
        (
          @NewsAnnounce,
          @DisplayFor,
          @Status,
          @ModifyDate
        )
      `);

    return res.json({
      success: true,
      message: "News inserted successfully",
    });
  } catch (error) {
    console.error("InsertNews Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const changeMemberPassword = async (req, res) => {
  try {
    const memberId = req.query.id;
    const { oldPassword, password } = req.body;

    if (!oldPassword || !password) {
      return res.status(400).json({
        success: false,
        message: "Old password and new password are required",
      });
    }

    const pool = await poolPromise;

    // first check if user exists.
    const existingUser = await pool
      .request()
      .input("MemberID", sql.VarChar, memberId).query(`
      SELECT TOP 1 * FROM MemberLoginDetail WHERE MemberID = @MemberID  
    `);

    if (existingUser.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const existingHashedPassword = existingUser.recordset[0].Password;

    const decryptedPassword = await OOPs.decrypt(existingHashedPassword);

    if (decryptedPassword !== oldPassword) {
      return res.status(400).json({
        success: false,
        message: "Old password is incorrect",
      });
    }

    // hash the new password
    const hashedNewPassword = await OOPs.encrypt(password);

    const result = await pool
      .request()
      .input("Password", sql.VarChar, hashedNewPassword)
      .input("MemberID", sql.VarChar, memberId).query(`
        UPDATE MemberLoginDetail SET Password = @Password WHERE MemberID = @MemberID
      `);

    return res
      .status(200)
      .json({ success: true, message: "Password Updated Successfully" });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

export const addFranchise = async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  try {
    const MemberNo = "MAZ" + Math.floor(10000 + Math.random() * 90000);
    const userType = "Franchise";
    const password = req.body.password;
    const encryptedPassword = await OOPs.encrypt(password);

    if (!req.body.memberName || !req.body.gender || !req.body.password) {
      return res.status(400).json({
        success: false,
        message: "Name, gender and password are required",
      });
    }

    // INSERTING INTO MEMBER LOGIN DETAIL
    await transaction.begin();
    const authRequest = new sql.Request(transaction);
    const authResult = await authRequest
      .input("MemberID", sql.NVarChar, MemberNo)
      .input("UserID", sql.NVarChar, MemberNo)
      .input("UserType", sql.NVarChar, userType)
      .input("Password", sql.NVarChar, encryptedPassword)
      .input("LastLogin", sql.DateTime, new Date()).query(`
      INSERT INTO MemberLoginDetail
      (
          MemberID,
          UserType,
          UserID,
          Password,
          LastLogin,
          Status
      )
      VALUES
      (
          @MemberID,
          @UserType,
          @UserID,
          @Password,
          @LastLogin,
          'Active'
      );

      DECLARE @LoginID INT = SCOPE_IDENTITY();

      UPDATE MemberLoginDetail
      SET MID = @LoginID
      WHERE LoginID = @LoginID;

      SELECT @LoginID AS MID;
  `);

    const MID = authResult.recordset[0].MID;

    // INSERTING INTO MEMBER INFO TABLE
    const memberInfoRequest = new sql.Request(transaction);
    await memberInfoRequest
      .input("MID", sql.Int, MID)
      .input("MemberID", sql.NVarChar, MemberNo)
      .input("MemberName", sql.NVarChar, req.body.memberName)
      .input("GuardianName", sql.NVarChar, req.body.guardianName)
      .input("Gender", sql.NVarChar, req.body.gender)
      .input("Age", sql.NVarChar, String(req.body.age))
      .input("Address", sql.NVarChar, req.body.address)
      .input("District", sql.NVarChar, String(req.body.districtId))
      .input("StateID", sql.NVarChar, String(req.body.stateId))
      .input("Pincode", sql.NVarChar, String(req.body.pincode))
      .input("ContactNo", sql.NVarChar, req.body.contactNo)
      .input("AltContactNo", sql.NVarChar, req.body.altContactNo)
      .input("EmailID", sql.NVarChar, req.body.email)
      .input("AadharNo", sql.NVarChar, req.body.aadharNumber)
      .input("PAN", sql.NVarChar, req.body.panNumber)
      .input("Status", sql.NVarChar, "Active")
      .input("ModifyDate", sql.DateTime, new Date())
      .input("type", sql.NVarChar, "Franchise").query(`
      INSERT INTO MemberPersonalInfo
      (
          MID,
          MemberID,
          MemberName,
          GuardianName,
          Gender,
          Age,
          Address,
          District,
          StateID,
          Pincode,
          ContactNo,
          AltContactNo,
          EmailID,
          AadharNo,
          PAN,
          Status,
          ModifyDate,
          ExtraFD
      )
      VALUES
      (
          @MID,
          @MemberID,
          @MemberName,
          @GuardianName,
          @Gender,
          @Age,
          @Address,
          @District,
          @StateID,
          @Pincode,
          @ContactNo,
          @AltContactNo,
          @EmailID,
          @AadharNo,
          @PAN,
          @Status,
          @ModifyDate,
          @type
      );

      
  `);

    await transaction.commit();

    return res.status(200).json({ success: true, msg: "Ok" });
  } catch (error) {
    await transaction.rollback();
    console.error("Insert Franchise Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await poolPromise;

    // Delete Product
    await pool.request().input("pID", sql.BigInt, id).query(`
        DELETE FROM ProductMaster
        WHERE pID = @pID
      `);

    // Retrieve Updated Product List
    const result = await pool.request().query(`
      SELECT
        pm.*,
        pc.Category
      FROM ProductMaster pm
      INNER JOIN ProductCategory pc
        ON pm.pCatID = pc.pCatID
      ORDER BY pc.Category
    `);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error("DeleteProduct Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await poolPromise;

    // Delete Product
    const result = await pool.request().input("pCatID", sql.BigInt, id).query(`
        DELETE FROM ProductCategory
        WHERE pCatID = @pCatID
      `);

    if (result.rowsAffected === 0)
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error("DeleteCategory Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const deletePackage = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await poolPromise;

    // Delete Product
    const result = await pool.request().input("pCatID", sql.BigInt, id).query(`
        DELETE FROM AdmPackageMaster
        WHERE PackageID = @pCatID
      `);

    if (result.rowsAffected === 0)
      return res
        .status(404)
        .json({ success: false, message: "Package not found" });

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error("DeletePackage Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteNews = async (req, res) => {
  try {
    const newsID = parseInt(req.params.id);

    if (isNaN(newsID)) {
      return res.status(400).json({
        success: false,
        message: "Invalid News ID",
      });
    }

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("NewsID", sql.BigInt, newsID)
      .input("ModifyDate", sql.DateTime, new Date()).query(`
        UPDATE NewsAnnounce
        SET
          Status = 'Deactive',
          ModifyDate = @ModifyDate
        WHERE NewsID = @NewsID
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        message: "News not found",
      });
    }

    return res.json({
      success: true,
      message: "News deleted successfully",
    });
  } catch (error) {
    console.error("DeletePackage Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteEvents = async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);

    if (isNaN(eventId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Event ID",
      });
    }

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("ID", sql.BigInt, eventId)
      .input("ModifyDate", sql.DateTime, new Date()).query(`
        UPDATE Eventmaster
        SET
          Status = 'Deactive',
          ModifyDate = @ModifyDate
        WHERE ID = @ID
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    return res.json({
      success: true,
      message: "News deleted successfully",
    });
  } catch (error) {
    console.error("DeletePackage Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getMemberPassword = async (req, res) => {
  try {
    const { id } = req.query;

    const pool = await poolPromise;

    const result = await pool.request().input("MemberID", sql.VarChar, id)
      .query(`
        SELECT MemberID, Password
        FROM MemberLoginDetail
        WHERE MemberID = @MemberID
      `);

    if (result.recordset.length > 0) {
      const member = result.recordset[0];

      const password = OOPs.decrypt(member.Password);

      return res.json([member.MemberID, password]);
    }

    return res.json(["", ""]);
  } catch (error) {
    console.error("GetMemberPassword Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getPANRecord = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
            SELECT
                MPersonID,
                MemberID,
                MemberName,
                PAN,
                ModifyDate
            FROM MemberPersonalInfo
            WHERE Flag = '1'
              AND PAN IS NOT NULL
              AND ModifyDate >= '2022-04-01'
            ORDER BY ModifyDate DESC
        `);

    res.json(result.recordset);
  } catch (error) {
    console.error("GetPanRecord Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const verifyPAN = async (req, res) => {
  try {
    const chklists = req.body;

    const pool = await poolPromise;
    let updated = 0;

    for (const item of chklists) {
      const result = await pool
        .request()
        .input("MemberID", sql.VarChar, item.MemberID).query(`
                    SELECT TOP 1 MPersonID, PAN
                    FROM MemberPersonalInfo
                    WHERE Flag = '1'
                    AND MemberID = @MemberID
                `);

      if (result.recordset.length > 0) {
        const mPersonId = result.recordset[0].MPersonID;

        await pool.request().input("MPersonID", sql.BigInt, mPersonId).query(`
                        UPDATE MemberPersonalInfo
                        SET Flag = '0'
                        WHERE MPersonID = @MPersonID
                    `);

        updated = 1;
      }
    }

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error("VerifyPAN Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getPurchaseReceipt = async (req, res) => {
  try {
    const { orderNo } = req.query;

    if (!orderNo || orderNo.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Invalid Order Number",
      });
    }

    const pool = await poolPromise;

    // Fetch Order Header
    const orderResult = await pool
      .request()
      .input("OrderNo", sql.NVarChar, orderNo).query(`
        SELECT
            OrderNo,
            OrderDate,
            Name,
            Phone,
            Email,
            Address,
            City,
            State,
            PinCode,
            PayMode,
            ISNULL(PaymentStatus,'Paid') AS PaymentStatus,
            ISNULL(DeliveryStatus,'Pending') AS DeliveryStatus,
            ISNULL(DiscountAmount,0) AS DiscountAmount,
            ISNULL(ShippingCharge,0) AS ShippingCharge
        FROM OrderMaster
        WHERE OrderNo = @OrderNo
      `);

    if (orderResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const order = orderResult.recordset[0];

    // Fetch Order Items
    const itemsResult = await pool
      .request()
      .input("OrderNo", sql.NVarChar, orderNo).query(`
        SELECT
            pm.Product,

            oi.Qty,
            oi.SaleRate AS Rate,
            oi.TotalAmount AS GrossAmount,

            oi.HSNCode,
            ISNULL(oi.TaxPercent,0) AS GSTRate,

            ISNULL(oi.CGST,0) AS CGSTAmount,
            ISNULL(oi.SGST,0) AS SGSTAmount,
            ISNULL(oi.IGST,0) AS IGSTAmount,

            (
                ISNULL(oi.CGST,0) +
                ISNULL(oi.SGST,0) +
                ISNULL(oi.IGST,0)
            ) AS GSTAmount,

            (
                oi.TotalAmount -
                (
                    ISNULL(oi.CGST,0) +
                    ISNULL(oi.SGST,0) +
                    ISNULL(oi.IGST,0)
                )
            ) AS TaxableAmount

        FROM OrderItems oi
        INNER JOIN ProductMaster pm
            ON oi.ProductID = pm.pID

        WHERE oi.OrderID = @OrderNo
      `);

    const items = itemsResult.recordset;

    // Totals
    const subTotal = items.reduce(
      (sum, item) => sum + Number(item.TaxableAmount),
      0,
    );

    const totalCGST = items.reduce(
      (sum, item) => sum + Number(item.CGSTAmount),
      0,
    );

    const totalSGST = items.reduce(
      (sum, item) => sum + Number(item.SGSTAmount),
      0,
    );

    const totalIGST = items.reduce(
      (sum, item) => sum + Number(item.IGSTAmount),
      0,
    );

    const totalGST = totalCGST + totalSGST + totalIGST;

    const grossTotal = items.reduce(
      (sum, item) => sum + Number(item.GrossAmount),
      0,
    );

    const grandTotal =
      grossTotal + Number(order.ShippingCharge) - Number(order.DiscountAmount);

    return res.status(200).json({
      success: true,
      data: {
        orderNo: order.OrderNo,
        orderDate: order.OrderDate,

        customerName: order.Name,
        customerPhone: order.Phone,
        customerEmail: order.Email,
        customerAddress: `${order.Address}, ${order.City}, ${order.State} - ${order.PinCode}`,

        payMode: order.PayMode,
        paymentStatus: order.PaymentStatus,
        deliveryStatus: order.DeliveryStatus,

        subTotal,
        taxAmount: totalGST,
        cgstAmount: totalCGST,
        sgstAmount: totalSGST,
        igstAmount: totalIGST,

        shipping: Number(order.ShippingCharge),
        discount: Number(order.DiscountAmount),
        grandTotal,

        items,
      },
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const getMemberPayoutDate = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().execute("Get_PayoutGenerateDate");

    const data = result.recordset || [];
    const rm = data.map((row) => {
      const dt = new Date(row.PayoutDate);

      const day = dt.getDate();
      const month = dt.getMonth() + 1;
      const year = dt.getFullYear();

      return {
        Status: `${day}-${month}-${year}`,
        Flag: `${year}-${month}-${day}`,
      };
    });

    res.json(rm);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const getMemberPayoutDetails = async (req, res) => {
  try {
    const { dateList, PANList } = req.query;

    const pool = await poolPromise;

    const payoutResult = await pool
      .request()
      .input("fromDate", dateList)
      .input("pan", PANList)
      .execute("Get_MemberPaymentTransfer");

    const payouts = payoutResult.recordset;

    const response = [];

    for (const item of payouts) {
      const bankResult = await pool.request().input("MID", item.MID).query(`
            SELECT TOP 1
                AcName,
                AcNo,
                AcType,
                Bank,
                IFSC,
                Branch
            FROM MemberBankDetail
            WHERE MID = @MID
        `);

      const bank = bankResult.recordset[0] || {};

      const payoutDate = new Date(item.PayoutDate);

      response.push({
        BinaryPayoutID: item.BinaryPayoutID,
        MemberID: item.MemberID,
        MemberName: item.MemberName,
        PAN: item.PAN,

        CurrentLeft: item.CurrentLeft,
        CurrentRight: item.CurrentRight,

        PurCurrentLeft: item.PurCurrentLeft,
        PurCurrentRight: item.PurCurrentRight,

        OldLeftCarry: item.OldLeftCarry,
        OldRightCarry: item.OldRightCarry,

        TotalLeft: item.TotalLeft,
        TotalRight: item.TotalRight,

        Pair: item.Pair,
        Capping: item.Capping,

        CarryLeft: item.CarryLeft,
        CarryRight: item.CarryRight,

        Amount: item.Amount,
        TDS: item.TDS,
        AdminCharge: item.AdminCharge,
        Vouchur: item.Vouchur,
        Payable: item.Payable,

        Pdate: payoutDate.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),

        PayoutFromDate: item.PayoutFromDate,
        PayoutToDate: item.PayoutToDate,

        Status: item.Status,
        Flag: item.Flag,
        Bonus: item.Bonus?.toString(),

        AcName: bank.AcName || "",
        AcNo: bank.AcNo || "",
        AcType: bank.AcType || "",
        Bank: bank.Bank || "",
        IFSC: bank.IFSC || "",
        Branch: bank.Branch || "",
      });
    }

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const verifyMemberKYCDoc = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await poolPromise;

    const result = await pool.request().input("MemberID", sql.NVarChar, id)
      .query(`
        UPDATE MemberKYC
        SET Status = 'Verify'
        WHERE MemberID = @MemberID
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        message: "KYC Document not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "KYC verified successfully.",
    });
  } catch (error) {
    console.error("Verify Doc Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong.",
      error: error.message,
    });
  }
};

export const createInvoice = async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const headerRequest = new sql.Request(transaction);

    const {
      memberId,
      rowItems,
      customerName,
      customerEmail,
      customerPhone,
      paymentMode,
      paymentDetails,
      totalAmount,
      totalTaxable,
      totalGst,
      totalDiscount,
      paidAmount,
    } = req.body;

    if (!memberId) {
      return res.status(400).json({
        success: false,
        msg: "Member ID is required",
      });
    }

    if (!rowItems || rowItems.length === 0) {
      return res.status(400).json({
        success: false,
        msg: "Items are required",
      });
    }

    const headerResponse = await headerRequest
      .input("memberId", sql.NVarChar, memberId)
      .input("customerName", sql.NVarChar, customerName)
      .input("customerEmail", sql.NVarChar, customerEmail)
      .input("customerPhone", sql.NVarChar, customerPhone)
      .input("paymentMode", sql.NVarChar, paymentMode)
      .input("paymentDetails", sql.NVarChar, paymentDetails)
      .input("totalAmount", sql.Decimal(18, 2), totalAmount)
      .input("totalGST", sql.Decimal(18, 2), totalGst)
      .input("totalDiscount", sql.Decimal(18, 2), totalDiscount)
      .input("totalTaxable", sql.Decimal(18, 2), totalTaxable)
      .input("paidAmount", sql.Decimal(18, 2), paidAmount)
      .input("due", sql.Decimal(18, 2), totalAmount - paidAmount).query(`
        INSERT INTO SaleInvoice (memberId, customerName, customerEmail, customerPhone, paymentMode, paymentDetails, totalAmount, totalGST, totalDiscount, totalTaxable, paidAmount, due) OUTPUT INSERTED.id
        VALUES (@memberId, @customerName, @customerEmail, @customerPhone, @paymentMode, @paymentDetails, @totalAmount, @totalGST, @totalDiscount, @totalTaxable, @paidAmount, @due)
      `);

    const invoiceId = headerResponse.recordset[0].id;

    for (const item of rowItems) {
      const itemRequest = new sql.Request(transaction);
      const stockRequest = new sql.Request(transaction);
      await itemRequest
        .input("invId", sql.NVarChar, invoiceId)
        .input("pID", sql.BigInt, Number(item.pID))
        .input("name", sql.NVarChar, item.name)
        .input("pCatID", sql.NVarChar, item.pCatID)
        .input("MRP", sql.Decimal(18, 2), item.MRP)
        .input("MemberMRP", sql.Decimal(18, 2), item.MemberMRP)
        .input("GST", sql.Decimal(18, 2), item.GST)
        .input("GSTAmount", sql.Decimal(18, 2), item.GSTAmount)
        .input("Discount", sql.Decimal(18, 2), item.Discount)
        .input("discountAmount", sql.Decimal(18, 2), item.discountAmount)
        .input("taxableAmount", sql.Decimal(18, 2), item.TaxableAmount)
        .input("amount", sql.Decimal(18, 2), item.Amount)
        .input("qty", sql.Decimal(18, 2), item.Qty).query(`
          INSERT INTO SaleItems (invId, pID, name, pCatID, MRP, MemberMRP, GST, GSTAmount, Discount, discountAmount, taxableAmount, amount, qty)
          
          VALUES (@invId, @pID, @name, @pCatID, @MRP, @MemberMRP, @GST, @GSTAmount, @Discount, @discountAmount, @taxableAmount, @amount, @qty)`);

      // update the stock of each item in the invoiceItems table
      await stockRequest
        .input("pID", sql.BigInt, Number(item.pID))
        .input("qty", sql.Decimal(18, 2), item.Qty).query(`
            UPDATE stockDetail
            SET stock = stock - @qty,
                UpdatedAt = GETDATE()             
            WHERE pID = @pID
          `);
    }

    await transaction.commit();

    return res
      .status(200)
      .json({ success: true, msg: "Invoice created successfully.", invoiceId });
  } catch (error) {
    await transaction.rollback();
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong.",
      error: error.message,
    });
  }
};

export const getInvoiceList = async (req, res) => {
  try {
    const { FromDate, ToDate, MemberId, page = 1, pageSize = 10 } = req.query;

    const pageNumber = Number(page);
    const size = Number(pageSize);
    const offset = (pageNumber - 1) * size;

    const pool = await poolPromise;

    let whereClause = `WHERE 1 = 1 AND status = 'active'`;

    if (MemberId) {
      whereClause += ` AND MemberId = @MemberId`;
    }

    if (FromDate) {
      whereClause += ` AND date >= @FromDate`;
    }

    if (ToDate) {
      whereClause += ` AND date < DATEADD(DAY, 1, @ToDate)`;
    }

    // Total Count
    const countRequest = pool.request();

    if (MemberId) countRequest.input("MemberId", sql.NVarChar, MemberId);

    if (FromDate) countRequest.input("FromDate", sql.DateTime, FromDate);

    if (ToDate) countRequest.input("ToDate", sql.DateTime, ToDate);

    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS total
      FROM SaleInvoice
      ${whereClause}
    `);

    const total = countResult.recordset[0].total;

    const dataRequest = pool.request();

    if (MemberId) dataRequest.input("MemberId", sql.NVarChar, MemberId);

    if (FromDate) dataRequest.input("FromDate", sql.DateTime, FromDate);

    if (ToDate) dataRequest.input("ToDate", sql.DateTime, ToDate);

    dataRequest
      .input("Offset", sql.Int, offset)
      .input("PageSize", sql.Int, size);

    const invoiceList = await dataRequest.query(`
      SELECT *
      FROM SaleInvoice
      ${whereClause}
      ORDER BY date DESC
      OFFSET @Offset ROWS
      FETCH NEXT @PageSize ROWS ONLY
    `);

    return res.status(200).json({
      success: true,
      invoiceList: invoiceList.recordset,
      pagination: {
        page: pageNumber,
        pageSize: size,
        total,
        totalPages: Math.ceil(total / size),
        hasNext: pageNumber < Math.ceil(total / size),
        hasPrev: pageNumber > 1,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Internal Server Error",
      err: error.message,
    });
  }
};

export const getInvoice = async (req, res) => {
  try {
    const { id } = req.query;

    // fetch sale invoice
    const pool = await poolPromise;

    const invoice = await pool
      .request()
      .input("id", sql.BigInt, id)
      .query(`SELECT * FROM SaleInvoice WHERE id = @id AND status = 'active'`);

    // fetch sale invoice items
    const invoiceItems = await pool
      .request()
      .input("id", sql.BigInt, id)
      .query(`SELECT * FROM SaleItems WHERE invId = @id`);

    return res.status(200).json({
      success: true,
      invoice: invoice.recordset[0],
      invoiceItems: invoiceItems.recordset,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Internal Server Error",
      err: error.message,
    });
  }
};

export const deleteInvoice = async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const { id } = req.params;

    if (!id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Invoice ID is required",
      });
    }

    const checkRequest = new sql.Request(transaction);
    const saleItemsRequest = new sql.Request(transaction);
    const updateStockRequest = new sql.Request(transaction);
    const cancelInvoiceRequest = new sql.Request(transaction);

    const existingInvoice = await checkRequest.input("id", sql.BigInt, id)
      .query(`
        SELECT id
        FROM SaleInvoice
        WHERE id = @id
      `);

    if (existingInvoice.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    const saleItems = await saleItemsRequest.input(
      "invId",
      sql.NVarChar,
      String(id),
    ).query(`
        SELECT *
        FROM SaleItems
        WHERE invId = @invId
      `);

    for (const item of saleItems.recordset) {
      await new sql.Request(transaction)
        .input("pID", sql.BigInt, Number(item.pID))
        .input("qty", sql.Decimal(18, 2), item.qty).query(`
          UPDATE stockDetail
          SET stock = stock + @qty,
           Status = 'restocked-by-cancelling-invoice',
           UpdatedAt = GETDATE()
          WHERE pID = @pID
        `);
    }

    await cancelInvoiceRequest.input("id", sql.BigInt, id).query(`
        UPDATE SaleInvoice
        SET
          status = 'cancelled',
          cancelledAt = GETDATE()
        WHERE id = @id
      `);

    await transaction.commit();

    return res.status(200).json({
      success: true,
      msg: "Invoice cancelled successfully",
    });
  } catch (error) {
    if (transaction._aborted !== true) {
      await transaction.rollback();
    }

    return res.status(500).json({
      success: false,
      msg: "Internal Server Error",
      err: error.message,
    });
  }
};

export const createReward = async (req, res) => {
  try {
    const rewards = req.body.ids;

    if (!Array.isArray(rewards) || rewards.length === 0) {
      return res.status(200).json({
        success: true,
        updatedCount: 0,
      });
    }

    const pool = await poolPromise;

    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      let updatedCount = 0;

      for (const reward of rewards) {
        const result = await transaction
          .request()
          .input("MemberID", sql.NVarChar, reward).query(`
            UPDATE MemberRewardSection
            SET Status = 'Achieved-Paid', ModifyDate = GETDATE()
            WHERE MemberID = @MemberID
          `);

        updatedCount += result.rowsAffected[0];
      }

      await transaction.commit();

      return res.status(200).json({
        success: true,
        updatedCount,
      });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (error) {
    console.error("paidRewardAmount Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getOTP = async (req, res) => {
  try {
    const otp = generateOTP();
    const companyName = "Mazix";
    const subject = `OTP of ${companyName}`;

    const mailOTP = `
        <p>Hello, Admin!</p>
        <p>We have sent an OTP for Edit Member Profile. Your OTP is:</p>
        <h1 style="text-align:center;">${otp}</h1>
        <p>Please use this OTP to authorize your request.</p>
        <p>If you did not make this request, please ignore this email.</p>
        <p>Best,<br>Your ${companyName}</p>
    `;

    const receiverName = "Mazix Admin";
    const receiverEmail = "rkrajpragati6@gmail.com";

    // Send Email
    const mailResponse = await sendMail({
      to: receiverEmail,
      subject,
      html: mailOTP,
      name: receiverName,
    });

    if (!mailResponse.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP.",
        error: mailResponse.error,
      });
    }

    const pool = await poolPromise;

    await pool
      .request()
      .input("MobileNo", sql.NVarChar, receiverEmail)
      .input("OTP", sql.NVarChar, otp)
      .input("ExpireMinute", sql.Int, 5).query(`
            INSERT INTO OTPMaster
            (
                MobileNo,
                OTP,
                ExpireMinute,
                ExpireTime,
                ModifyDate
            )
            VALUES
            (
                @MobileNo,
                @OTP,
                @ExpireMinute,
                DATEADD(MINUTE, @ExpireMinute, GETDATE()),
                GETDATE()
            )
        `);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully.",
    });
  } catch (err) {
    console.error("Send OTP Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP.",
      error: err.message,
    });
  }
};

export const createPaymentTransfer = async (req, res) => {
  let transaction;

  try {
    const payouts = req.body.ids;
    const loginID = req.user?.MID || req.session?.MID || 0;

    if (!Array.isArray(payouts) || payouts.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide member id's",
      });
    }

    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);

    await transaction.begin();

    let id = 0;

    for (const item of payouts) {
      const payout = await new sql.Request(transaction).input(
        "BinaryPayoutID",
        sql.Int,
        Number(item.BinaryPayoutID),
      ).query(`
            SELECT *
            FROM PayoutBinary
            WHERE BinaryPayoutID = @BinaryPayoutID
        `);

      if (payout.recordset.length === 0) continue;

      const obj = payout.recordset[0];

      const insertResult = await new sql.Request(transaction)
        .input("BinaryPayoutID", sql.Int, obj.BinaryPayoutID)
        .input("MemberID", sql.VarChar, obj.MemberID)
        .input("CurrentLeft", sql.Decimal(18, 2), obj.CurrentLeft)
        .input("CurrentRight", sql.Decimal(18, 2), obj.CurrentRight)
        .input("PurCurrentLeft", sql.Decimal(18, 2), obj.PurCurrentLeft)
        .input("PurCurrentRight", sql.Decimal(18, 2), obj.PurCurrentRight)
        .input("OldLeftCarry", sql.Decimal(18, 2), obj.OldLeftCarry)
        .input("OldRightCarry", sql.Decimal(18, 2), obj.OldRightCarry)
        .input("TotalLeft", sql.Decimal(18, 2), obj.TotalLeft)
        .input("TotalRight", sql.Decimal(18, 2), obj.TotalRight)
        .input("Pair", sql.Decimal(18, 2), obj.Pair)
        .input("Capping", sql.Decimal(18, 2), obj.Capping)
        .input("CarryLeft", sql.Decimal(18, 2), obj.CarryLeft)
        .input("CarryRight", sql.Decimal(18, 2), obj.CarryRight)
        .input("Amount", sql.Decimal(18, 2), obj.Amount)
        .input("TDS", sql.Decimal(18, 2), obj.TDS)
        .input("AdminCharge", sql.Decimal(18, 2), obj.AdminCharge)
        .input("Vouchur", sql.VarChar, obj.Vouchur)
        .input("Payable", sql.Decimal(18, 2), obj.Payable)
        .input("PayoutDate", sql.DateTime, obj.PayoutDate)
        .input("PayoutFromDate", sql.DateTime, obj.PayoutFromDate)
        .input("PayoutToDate", sql.DateTime, obj.PayoutToDate)
        .input("Status", sql.VarChar, obj.Status)
        .input("Flag", sql.VarChar, obj.Flag)
        .input("ModifyDate", sql.DateTime, new Date())
        .input("PaymentStatus", sql.VarChar, "Done")
        .input("PaymentDate", sql.DateTime, new Date())
        .input("LoginID", sql.BigInt, loginID)
        .input("Bonus", sql.Decimal(18, 2), obj.Bonus).query(`
            INSERT INTO MemberPaymentTransfer
            (
                BinaryPayoutID,
                MemberID,
                CurrentLeft,
                CurrentRight,
                PurCurrentLeft,
                PurCurrentRight,
                OldLeftCarry,
                OldRightCarry,
                TotalLeft,
                TotalRight,
                Pair,
                Capping,
                CarryLeft,
                CarryRight,
                Amount,
                TDS,
                AdminCharge,
                Vouchur,
                Payable,
                PayoutDate,
                PayoutFromDate,
                PayoutToDate,
                Status,
                Flag,
                ModifyDate,
                PaymentStatus,
                PaymentDate,
                LoginID,
                Bonus
            )
            VALUES
            (
                @BinaryPayoutID,
                @MemberID,
                @CurrentLeft,
                @CurrentRight,
                @PurCurrentLeft,
                @PurCurrentRight,
                @OldLeftCarry,
                @OldRightCarry,
                @TotalLeft,
                @TotalRight,
                @Pair,
                @Capping,
                @CarryLeft,
                @CarryRight,
                @Amount,
                @TDS,
                @AdminCharge,
                @Vouchur,
                @Payable,
                @PayoutDate,
                @PayoutFromDate,
                @PayoutToDate,
                @Status,
                @Flag,
                @ModifyDate,
                @PaymentStatus,
                @PaymentDate,
                @LoginID,
                @Bonus
            );

            SELECT SCOPE_IDENTITY() AS MemPayTransID;
        `);

      const memPayTransID = insertResult.recordset[0]?.MemPayTransID;

      if (memPayTransID) {
        await new sql.Request(transaction).input(
          "BinaryPayoutID",
          sql.Int,
          obj.BinaryPayoutID,
        ).query(`
              UPDATE PayoutBinary
              SET Status='Deactive'
              WHERE BinaryPayoutID=@BinaryPayoutID
          `);

        id = 1;
      }
    }

    await transaction.commit();

    return res.status(200).json(id);
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const deletePayTransfer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, msg: "Id is required" });
    }

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("BinaryPayoutID", sql.BigInt, Number(id)).query(`
        UPDATE Get_MemberPaymentTransferedDetail SET Status='Inactive' WHERE BinaryPayoutID=@BinaryPayoutID
      `);

    if (result.rowsAffected[0] > 0) {
      return res
        .status(200)
        .json({ success: true, msg: "Deleted Successfully" });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getFranchise = async (req, res) => {
  try {
    const pool = await poolPromise;

    const { page = 1, pageSize = 10 } = req.params;

    const size = Number(pageSize);
    const pageNumber = Number(page);
    const offset = (pageNumber - 1) * size;

    const result = await pool
      .request()
      .input("offset", sql.Int, offset)
      .input("size", sql.Int, size).query(`
      SELECT * FROM MemberPersonalInfo WHERE LOWER(ExtraFD) = 'franchise'
      ORDER BY MID DESC OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY
    `);

    const count = await pool
      .request()
      .query(
        `SELECT COUNT(*) AS count FROM MemberPersonalInfo WHERE LOWER(ExtraFD) = 'franchise'`,
      );

    return res.status(200).json({
      success: true,
      data: result.recordset,
      pagination: {
        currentPage: pageNumber,
        totalPage: Math.ceil(result.recordset.length / size),
        hasNext: pageNumber < Math.ceil(result.recordset.length / size),
        hasPrev: pageNumber > 1,
        total: count.recordset?.[0]?.count || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      msg: error.message,
    });
  }
};

export const deleteWalletJoining = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await poolPromise;

    const checkResult = await pool.request().input("id", sql.BigInt, Number(id))
      .query(`
        SELECT *
        FROM WalletTransfer
        WHERE WalletTranferID = @id
      `);

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Wallet transfer not found",
      });
    }

    await pool.request().input("id", sql.BigInt, Number(id)).query(`
        UPDATE WalletTransfer
        SET Status = 'Deactive', ModifyDate = GETDATE()
        WHERE WalletTranferID = @id
      `);

    return res.status(200).json({
      success: true,
      message: "Wallet transfer deleted successfully",
    });
  } catch (err) {
    console.error("Wallet Transfer Delete Error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteWalletRepurchase = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await poolPromise;

    const result = await pool.request().input("id", sql.BigInt, Number(id))
      .query(`
        UPDATE RepurchaseWalletTransfer
        SET Status = 'Deactive'
        WHERE RepWalletTranferID = @id
      `);

    return res.status(200).json({
      success: result.rowsAffected[0] > 0,
      message:
        result.rowsAffected[0] > 0
          ? "Repurchase wallet transfer deleted successfully."
          : "Repurchase wallet transfer not found.",
    });
  } catch (error) {
    console.error("Repurchase Wallet Transfer Delete Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};
