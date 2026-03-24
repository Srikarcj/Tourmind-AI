import { Router } from "express";
import { ApiError } from "../lib/apiError.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { requireInternalKey } from "../middleware/requireInternalKey.js";
import { sendEmail } from "../services/emailService.js";

const router = Router();

router.post("/email/send", requireAuth, requireAdmin, requireInternalKey, async (req, res, next) => {
  try {
    const to = Array.isArray(req.body.to) ? req.body.to : [req.body.to];
    const subject = String(req.body.subject || "").trim();
    const html = String(req.body.html || "").trim();
    const text = req.body.text ? String(req.body.text) : undefined;

    if (!to[0] || !subject || !html) {
      throw new ApiError(400, "to, subject, and html are required.");
    }

    const result = await sendEmail({ to, subject, html, text });
    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
});

export default router;
