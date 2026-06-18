import express from "express";
import {
  getMemberWallet,
  getRepurchaseMemberWallet,
  getRepurchaseMemberWalletHistory,
  getWalletSendHistory,
  repTransferMainWallet,
  transferMainWallet,
  getWalletJoiningSendHistory,
  getRepWalletSendHistory,
} from "../controllers/wallet.controller.js";
import { isAdmin } from "../middleware/isAuth.js";

const router = express.Router();

router.route("/joining-history").get(isAdmin, getWalletJoiningSendHistory);
router.route("/rep-history").get(isAdmin, getRepWalletSendHistory);

router.get("/:memberID", getMemberWallet);
router.get("/repurchase/:memberID", getRepurchaseMemberWallet);

router.get("/repurchase/history/:memberID", getRepurchaseMemberWalletHistory);
router.get("/history/:memberID", getWalletSendHistory);

router.post("/transfer", transferMainWallet);
router.post("/repurchase-transfer", repTransferMainWallet);

export default router;
