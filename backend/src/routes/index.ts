import { Router } from "express";
import { login, signup } from "../controllers/authcontroller";
import { marketingEmail } from "../controllers/marketingcontroller";
import { walletOnramp } from "../controllers/walletcontroller";
import { adminMiddleware, authMiddleware } from "../middleware/auth";

export const router = Router();

router.post("/auth/signup", signup);
router.post("/auth/login", login);
router.post("/wallet/onramp", authMiddleware, walletOnramp);
router.post("/email/marketing", authMiddleware, adminMiddleware, marketingEmail);
router.get("/health", (_req, res) => {
  res.json({
    message: "OK",
    service: "backend",
  });
});
