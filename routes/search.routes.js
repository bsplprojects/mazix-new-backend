import express from "express";
import { fetchSearchResults } from "../controllers/search.controller.js";

const router = express.Router();

router.route("/").get(fetchSearchResults);

export default router;
