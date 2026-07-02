import express from "express";
import {
  adminLogin,
  getDashboardCharts,
  getHeaderValue,
  getAllMembers,
  getAdminTokenList,
  getPackagesList,
  sendToken,
  addPackage,
  getEventsHistory,
  addEvent,
  getProducts,
  getCategories,
  addCategory,
  addProduct,
  deleteProduct,
  deleteCategory,
  getMemberPassword,
  getPANRecord,
  getNewsFeed,
  verifyPAN,
  deletePackage,
  addNews,
  deleteNews,
  deleteEvents,
  addFranchise,
  getPurchaseReceipt,
  getMemberPayoutDate,
  getMemberPayoutDetails,
} from "../controllers/admin.controller.js";
import { isAdmin } from "../middleware/isAuth.js";

const router = express.Router();

router.route("/login").post(adminLogin);
router.route("/purchase-receipt/:id").get(isAdmin, getPurchaseReceipt);
router.route("/header").get(isAdmin, getHeaderValue);
router.route("/charts").get(isAdmin, getDashboardCharts);
router.route("/members").get(isAdmin, getAllMembers);
router.route("/token").get(isAdmin, getAdminTokenList);
router.route("/packages").get(isAdmin, getPackagesList);
router.route("/events").get(isAdmin, getEventsHistory);
router.route("/products").get(isAdmin, getProducts);
router.route("/categories").get(isAdmin, getCategories);
router.route("/pan").get(isAdmin, getPANRecord);
router.route("/news-feed").get(isAdmin, getNewsFeed);
router.route("/member-payout-date").get(isAdmin, getMemberPayoutDate);
router.route("/member-payout-details").get(isAdmin, getMemberPayoutDetails);

router.route("/events/new").post(isAdmin, addEvent);
router.route("/send-token").post(isAdmin, sendToken);
router.route("/package/new").post(isAdmin, addPackage);
router.route("/category/new").post(isAdmin, addCategory);
router.route("/product/new").post(isAdmin, addProduct);
router.route("/password").post(isAdmin, getMemberPassword);
router.route("/pan/verify").post(isAdmin, verifyPAN);
router.route("/news/new").post(isAdmin, addNews);
router.route("/franchise/new").post(isAdmin, addFranchise);

router.route("/product/:id").delete(isAdmin, deleteProduct);
router.route("/category/:id").delete(isAdmin, deleteCategory);
router.route("/package/:id").delete(isAdmin, deletePackage);
router.route("/news/:id").delete(isAdmin, deleteNews);
router.route("/events/:id").delete(isAdmin, deleteEvents);

export default router;
