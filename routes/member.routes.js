import express from "express";
import {
  getMemberDetail,
  getNomineeInfo,
  saveUserInfo,
  getBankInfo,
  getKYCDocumentsList,
  getMemberIDCardInfo,
  getLeftRightTeam,
  updateMemberDetail,
  getMemberDashboard,
  getMemberReward,
  getInvoiceAtJoining,
} from "../controllers/member.controller.js";

const router = express.Router();

router.route("/dashboard").get(getMemberDashboard);
router.route("/reward/:MemberID").get(getMemberReward);

/**
 * @swagger
 * /api/v1/member/{mid}:
 *   get:
 *     summary: Get Member Details
 *     description: Returns the member details
 *     tags:
 *       - Member
 *     parameters:
 *       - in: path
 *         name: mid
 *         required: true
 *         schema:
 *           type: string
 *         description: Member ID
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 */
router.route("/:mid").get(getMemberDetail);
router.route("/:mid").patch(updateMemberDetail);
router.route("/invoice-joining/:id").get(getInvoiceAtJoining);
router.route("/nominee/:mid").get(getNomineeInfo);
router.route("/bank/:mid").get(getBankInfo);
router.route("/kyc/:mid").get(getKYCDocumentsList);
router.route("/identity/:mid").get(getMemberIDCardInfo);
router.route("/downline/:mid").get(getLeftRightTeam);
router.route("/").post(saveUserInfo);

export default router;
