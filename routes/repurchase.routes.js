import express from "express";
import {
  getRepurchaseHistory,
  getRepVoucherWalletAmount,
  insertRepProduct
} from "../controllers/repurchase.controller.js";

const router = express.Router();

router.route("/history/:memberID").get(getRepurchaseHistory);
router.route("/rep-voucher").get(getRepVoucherWalletAmount);
router.route("/insert-rep").post(insertRepProduct);

export default router;
