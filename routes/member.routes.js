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
  uploadUserKYCDocs,
  updatePersonalInfo,
  updateNomineeInfo,
  updateBankInfo,
} from "../controllers/member.controller.js";
import { upload } from "../lib/multer.js";

const router = express.Router();

router.route("/dashboard").get(getMemberDashboard);
router.route("/reward/:MemberID").get(getMemberReward);
router.route("/:mid").get(getMemberDetail);
router.route("/invoice-joining/:id").get(getInvoiceAtJoining);
router.route("/nominee/:mid").get(getNomineeInfo);
router.route("/bank/:mid").get(getBankInfo);
router.route("/kyc/:mid").get(getKYCDocumentsList);
router.route("/identity/:mid").get(getMemberIDCardInfo);
router.route("/downline/:mid").get(getLeftRightTeam);

router.route("/").post(saveUserInfo);
router.route("/kyc/docs").post(
  upload.fields([
    { name: "Aadhar", maxCount: 1 },
    { name: "Pan", maxCount: 1 },
    { name: "Passbook", maxCount: 1 },
    { name: "Photo", maxCount: 1 },
  ]),
  uploadUserKYCDocs,
);

router.route("/:mid").patch(updateMemberDetail);
router.route("/personalinfo/:id").patch(updatePersonalInfo);
router.route("/nomineeinfo/:id").patch(updateNomineeInfo);
router.route("/bankinfo/:id").patch(updateBankInfo);

export default router;
