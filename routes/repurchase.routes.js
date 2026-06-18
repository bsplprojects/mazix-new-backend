import express from "express";
import { getRepurchaseHistory } from "../controllers/repurchase.controller.js";

const router = express.Router();

router.route("/history/:memberID").get(getRepurchaseHistory);

export default router;
