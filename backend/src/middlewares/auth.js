// Middleware to enforce authentication using JWT in the Authorization header.
// Expected format: "Authorization: Bearer <token>".
import jwt from "jsonwebtoken";
import { isTokenRevoked } from "../utils/tokenBlacklist.js";

export function requireAuth(req, res, next) {
  // Safely read the header and extract the token if present in Bearer format.
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;

  // Reject requests without token early to avoid unnecessary work.
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    // Verify JWT signature and parse claims using the shared secret.
    // On success, attach user claims to req.user for downstream handlers.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (isTokenRevoked(token)) return res.status(401).json({ error: "Invalid token" });
    req.user = decoded;
    req.token = token;
    next();
  } catch {
    // Avoid leaking details (e.g., token expired vs invalid); respond with generic 401.
    res.status(401).json({ error: "Invalid token" });
  }
}
