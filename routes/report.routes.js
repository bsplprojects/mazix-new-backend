import express from "express";
import {
  getSaleReport,
  getPayTransferReport,
  getTDSReport,
  getAdminChargeDetail,
  getWalletTransferReport,
  getRepurchaseReport,
  getRewardReport,
  getProductSaleReport,
  getProductSaleWithJoining,
  getProductList,
  getPurchaseReport,
  getRepurchaseVoucherReport,
  getVerificationList,
  getPaidDatesPayout,
} from "../controllers/report.controller.js";
import { isAdmin } from "../middleware/isAuth.js";

const router = express.Router();

router.route("/sale").get(isAdmin, getSaleReport);
router.route("/purchase").get(isAdmin, getPurchaseReport);
router.route("/pay-transfer").get(isAdmin, getPayTransferReport);
router.route("/tds").get(isAdmin, getTDSReport);
router.route("/admin-charge").get(isAdmin, getAdminChargeDetail);
router.route("/wallet-transfer").get(isAdmin, getWalletTransferReport);
router.route("/repurchase").get(isAdmin, getRepurchaseReport);
router.route("/repurchase-voucher").get(isAdmin, getRepurchaseVoucherReport);
router.route("/reward").get(isAdmin, getRewardReport);
router.route("/product-sale").get(isAdmin, getProductSaleReport);
router.route("/product-sale-joining").get(isAdmin, getProductSaleWithJoining);
router.route("/products").get(isAdmin, getProductList);
router.route("/kyc-list").get(isAdmin, getVerificationList);
router.route("/paid-dates").get(isAdmin, getPaidDatesPayout);

export default router;
