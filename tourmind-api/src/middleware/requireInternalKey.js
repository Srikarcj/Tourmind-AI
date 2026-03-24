import { env } from "../config/env.js";

export const requireInternalKey = (req, res, next) => {
  if (!env.INTERNAL_API_KEY) {
    return next();
  }

  const provided = req.headers["x-internal-key"];
  if (provided !== env.INTERNAL_API_KEY) {
    return res.status(403).json({ message: "Invalid internal API key." });
  }

  return next();
};
