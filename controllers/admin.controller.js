import sql from "mssql";
import { poolPromise } from "../db.js";
import OOPs from "../OOPs.js";
import jwt from "jsonwebtoken";

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

    const encPassword = await OOPs.encrypt(Password);
    const result = await pool
      .request()
      .input("MemberID", sql.NVarChar, MemberID)
      .input("Password", sql.NVarChar, encPassword).query(`
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
        message: "Invalid MemberID or Password",
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
      .input("MemberID", sql.VarChar, memberId || "")
      .input("TokenType", sql.VarChar, TokenDropDownList || "")
      .input("PackageName", sql.VarChar, PackageDropDownList || "")
      .input("FromDate", sql.VarChar, Fromdate || "")
      .input("ToDate", sql.VarChar, Todate || "")
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
    const pool = await poolPromise;

    const result = await pool.request().query(`
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
        c.Category
      FROM ProductMaster p
      INNER JOIN ProductCategory c
        ON p.pCatID = c.pCatID
      ORDER BY c.Category
    `);

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
      Joining: row.Category,
    }));

    return res.json(list);
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
    const { pCatID, Category, seqOnline, Status } = req.body;

    const pool = await poolPromise;

    if (pCatID && Number(pCatID) > 0) {
      // Update Category
      await pool
        .request()
        .input("pCatID", sql.BigInt, pCatID)
        .input("Category", sql.NVarChar, Category)
        .input("seqOnline", sql.Int, seqOnline)
        .input("Status", sql.VarChar, Status)
        .input("ModifyDate", sql.DateTime, new Date()).query(`
          UPDATE ProductCategory
          SET
            Category = @Category,
            seqOnline = @seqOnline,
            Status = @Status,
            ModifyDate = @ModifyDate
          WHERE pCatID = @pCatID
        `);
    } else {
      // Insert Category
      await pool
        .request()
        .input("Category", sql.NVarChar, Category)
        .input("seqOnline", sql.Int, seqOnline)
        .input("Status", sql.VarChar, Status)
        .input("ModifyDate", sql.DateTime, new Date()).query(`
          INSERT INTO ProductCategory
          (
            Category,
            seqOnline,
            Status,
            ModifyDate
          )
          VALUES
          (
            @Category,
            @seqOnline,
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
    console.error("InsertCategory Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const addProduct = async (req, res) => {
  try {
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
    } = req.body;

    const pool = await poolPromise;

    if (pID && Number(pID) > 0) {
      // Update Product
      await pool
        .request()
        .input("pID", sql.BigInt, pID)
        .input("pCatID", sql.BigInt, pCatID)
        .input("Product", sql.NVarChar, Product)
        .input("Description", sql.NVarChar(sql.MAX), Description)
        .input("MRP", sql.Decimal(18, 2), MRP)
        .input("MemberMRP", sql.Decimal(18, 2), MemberMRP)
        .input("StockistMRP", sql.Decimal(18, 2), StockistMRP)
        .input("GST", sql.Decimal(18, 2), GST)
        .input("Status", sql.VarChar, Status)
        .input("Discount", sql.Decimal(18, 2), Discount)
        .input("BV", sql.Decimal(18, 2), BV)
        .input("Repurchase", sql.Int, Repurchase)
        .input("seqOnline", sql.Int, seqOnline)
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
            ModifyDate = @ModifyDate
          WHERE pID = @pID
        `);
    } else {
      // Insert Product
      await pool
        .request()
        .input("pCatID", sql.BigInt, pCatID)
        .input("Product", sql.NVarChar, Product)
        .input("Description", sql.NVarChar(sql.MAX), Description)
        .input("MRP", sql.Decimal(18, 2), MRP)
        .input("MemberMRP", sql.Decimal(18, 2), MemberMRP)
        .input("StockistMRP", sql.Decimal(18, 2), StockistMRP)
        .input("GST", sql.Decimal(18, 2), GST)
        .input("Status", sql.VarChar, Status)
        .input("Discount", sql.Decimal(18, 2), Discount)
        .input("BV", sql.Decimal(18, 2), BV)
        .input("Repurchase", sql.Int, Repurchase)
        .input("seqOnline", sql.Int, seqOnline)
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
            ModifyDate
          )
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
            @ModifyDate
          )
        `);
    }

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
  } catch (error) {
    return res.status(500).json({
      msg: "Internal Server Error",
      success: false,
      error: error.message,
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

    // Call Stored Procedure
    const payoutResult = await pool
      .request()
      .input("fromDate", dateList)
      .input("pan", PANList)
      .execute("Get_MemberPaymentTransfer");

    const payouts = payoutResult.recordset;

    const response = [];

    for (const item of payouts) {
      // Fetch Bank Details
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
