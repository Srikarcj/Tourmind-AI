import { env } from "../config/env.js";

export const requireAdmin = (req, res, next) => {
  if (!req.authUser) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const isRoleAdmin = req.authUser.role === "admin";
  const isEmailAdmin = (req.authUser.email || "").toLowerCase() === env.ADMIN_EMAIL.toLowerCase();

  if (!isRoleAdmin && !isEmailAdmin) {
    return res.status(403).json({ message: "Admin access required." });
  }

  return next();
};
