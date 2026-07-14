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
  changeMemberPassword,
  verifyMemberKYCDoc,
  createInvoice,
  getInvoiceList,
  getInvoice,
  deleteInvoice,
  createReward,
} from "../controllers/admin.controller.js";
import { isAdmin } from "../middleware/isAuth.js";
import { upload } from "../lib/multer.js";

const router = express.Router();

router.route("/login").post(adminLogin);
router.route("/purchase-receipt").get(isAdmin, getPurchaseReceipt);
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
router.route("/sale/invoice").get(isAdmin, getInvoiceList);
router.route("/invoice/stock").get(isAdmin, getInvoice);

router.route("/events/new").post(isAdmin, addEvent);
router.route("/send-token").post(isAdmin, sendToken);
router.route("/package/new").post(isAdmin, addPackage);
router
  .route("/category/new")
  .post(isAdmin, upload.single("Image"), addCategory);
router.route("/product/new").post(isAdmin, upload.single("Image"), addProduct);
router.route("/password").post(isAdmin, getMemberPassword);
router.route("/pan/verify").post(isAdmin, verifyPAN);
router.route("/news/new").post(isAdmin, addNews);
router.route("/franchise/new").post(isAdmin, addFranchise);
router.route("/new-password").post(isAdmin, changeMemberPassword);
router.route("/verify/:id").post(isAdmin, verifyMemberKYCDoc);
router.route("/invoice/new").post(isAdmin, createInvoice);
router.route("/reward/paid").post(isAdmin, createReward);

router.route("/product/:id").delete(isAdmin, deleteProduct);
router.route("/category/:id").delete(isAdmin, deleteCategory);
router.route("/package/:id").delete(isAdmin, deletePackage);
router.route("/news/:id").delete(isAdmin, deleteNews);
router.route("/events/:id").delete(isAdmin, deleteEvents);
router.route("/sale/invoice/:id").delete(isAdmin, deleteInvoice);

export default router;
