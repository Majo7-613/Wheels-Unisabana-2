// User profile routes: viewing and updating personal information.
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import { evaluateDriverReadiness } from "../utils/vehiclePresenter.js";

const router = Router();

function toPublicUser(user) {
  if (!user) return null;
  const { _id, email, firstName, lastName, universityId, phone, photoUrl, roles, activeRole, createdAt, updatedAt } = user;
  return { id: _id, email, firstName, lastName, universityId, phone, photoUrl, roles, activeRole, createdAt, updatedAt };
}

// GET /users/me: return profile information plus associated vehicle (if any).
router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.sub).lean();
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  const vehicle = await Vehicle.findOne({ owner: user._id }).lean();
  res.json({ user: toPublicUser(user), vehicle });
});

router.get("/me/driver-readiness", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.sub).lean();
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  const vehicles = await Vehicle.find({ owner: user._id }).lean();
  const readiness = evaluateDriverReadiness(vehicles, {
    activeVehicle: user.activeVehicle
  });

  return res.json({
    user: {
      id: user._id,
      roles: user.roles,
      activeRole: user.activeRole,
      activeVehicle: user.activeVehicle
    },
    readiness
  });
});

// PUT /users/me: update editable profile fields.
router.put("/me", requireAuth, async (req, res) => {
  const { firstName, lastName, phone, photoUrl } = req.body || {};
  const updates = { firstName, lastName, phone, photoUrl };
  Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);

  try {
    const user = await User.findByIdAndUpdate(req.user.sub, updates, { new: true, runValidators: true }).lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    console.error("update profile", err);
    res.status(500).json({ error: "No se pudo actualizar el perfil" });
  }
});

export default router;
