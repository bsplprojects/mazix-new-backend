import express from "express";
import {
  getRepurchaseHistory,
  getRepVoucherWalletAmount,
  insertRepProduct,
  getRepurchaseInvoiceDetails,
} from "../controllers/repurchase.controller.js";

const router = express.Router();

router.route("/history/:memberID").get(getRepurchaseHistory);
router.route("/invoice").get(getRepurchaseInvoiceDetails);
router.route("/rep-voucher").get(getRepVoucherWalletAmount);
router.route("/insert-rep").post(insertRepProduct);

export default router;
