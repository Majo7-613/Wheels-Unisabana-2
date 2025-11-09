// Authentication routes: register, login, and user profile retrieval.
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import PasswordReset from "../models/PasswordReset.js";
import { requireAuth } from "../middlewares/auth.js";
import { revokeToken } from "../utils/tokenBlacklist.js";
import { sendWelcomeEmail } from "../services/emailService.js";

const router = Router();

// Helper to check Mongo connection state: 1 means connected/ready.
// Prevents ambiguous behavior when DB is down (surface 503 early).
function isDbReady() {
  return mongoose.connection?.readyState === 1;
}

function toPublicUser(user) {
  if (!user) return null;
  const {
    _id,
    email,
    firstName,
    lastName,
    universityId,
    phone,
    photoUrl,
    emergencyContact,
    preferredPaymentMethod,
    roles,
    activeRole,
    activeVehicle,
    createdAt,
    updatedAt
  } = user;
  return {
    id: _id,
    email,
    firstName,
    lastName,
    universityId,
    phone,
    photoUrl,
    emergencyContact,
    preferredPaymentMethod,
    roles,
    activeRole,
    activeVehicle,
    createdAt,
    updatedAt
  };
}

function validateInstitutionalEmail(email) {
  const normEmail = String(email || "").trim().toLowerCase();
  if (!normEmail.includes("@")) {
    return { ok: false, error: "Email inválido" };
  }
  const domain = normEmail.split("@")[1] || "";
  const isInstitutional = domain === "unisabana.edu.co" || domain.endsWith(".unisabana.edu.co");
  if (!isInstitutional) {
    return { ok: false, error: "Email no institucional (@unisabana.edu.co)" };
  }
  return { ok: true, email: normEmail };
}

// POST /auth/register: create a new account using institutional email.
// Validates domain, hashes password, captures role-specific data, and returns profile + optional vehicle.
router.post("/register", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "DB no disponible. Configura MONGO_URI o levanta Mongo." });

  const {
    email,
    password,
    firstName,
    lastName,
    universityId,
    phone,
    photoUrl,
    emergencyContact,
    preferredPaymentMethod,
    role = "passenger",
    vehicle
  } = req.body || {};

  const emailValidation = validateInstitutionalEmail(email);
  if (!emailValidation.ok) return res.status(400).json({ error: emailValidation.error });

  if (!firstName || !lastName || !universityId || !phone) {
    return res.status(400).json({ error: "Datos personales incompletos" });
  }

  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Contraseña muy corta (min 8)" });
  }

  if (!["passenger", "driver"].includes(role)) {
    return res.status(400).json({ error: "Rol inválido" });
  }

  if (preferredPaymentMethod && !["cash", "nequi"].includes(preferredPaymentMethod)) {
    return res.status(400).json({ error: "Método de pago preferido inválido" });
  }

  const roles = ["passenger"];
  let activeRole = "passenger";

  if (role === "driver") {
    roles.push("driver");
    activeRole = "driver";
    const requiredVehicleFields = [
      "plate",
      "brand",
      "model",
      "capacity",
      "soatPhotoUrl",
      "vehiclePhotoUrl",
      "soatExpiration",
      "licenseNumber",
      "licenseExpiration"
    ];
    const missingVehicleFields = requiredVehicleFields.filter((field) => !vehicle?.[field]);
    if (missingVehicleFields.length > 0) {
      return res.status(400).json({ error: `Faltan datos de vehículo: ${missingVehicleFields.join(", ")}` });
    }
    const numericCapacity = Number(vehicle.capacity);
    if (!Number.isInteger(numericCapacity) || numericCapacity < 1 || numericCapacity > 8) {
      return res.status(400).json({ error: "Capacidad de vehículo inválida" });
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let createdUser;
  try {
    createdUser = await User.create({
      email: emailValidation.email,
      firstName,
      lastName,
      universityId,
      phone,
      photoUrl,
      emergencyContact: emergencyContact || null,
      preferredPaymentMethod: preferredPaymentMethod || undefined,
      passwordHash,
      roles,
      activeRole
    });

    let createdVehicle;
    if (role === "driver") {
      const soatDate = new Date(vehicle.soatExpiration);
      const licenseDate = new Date(vehicle.licenseExpiration);
      if (Number.isNaN(soatDate.getTime()) || Number.isNaN(licenseDate.getTime())) {
        await User.deleteOne({ _id: createdUser._id }).catch(() => {});
        return res.status(400).json({ error: "Fechas de documentos inválidas" });
      }
      if (soatDate < new Date() || licenseDate < new Date()) {
        await User.deleteOne({ _id: createdUser._id }).catch(() => {});
        return res.status(400).json({ error: "Documentos del vehículo vencidos" });
      }

      createdVehicle = await Vehicle.create({
        owner: createdUser._id,
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        capacity: Number(vehicle.capacity),
        vehiclePhotoUrl: vehicle.vehiclePhotoUrl,
        soatPhotoUrl: vehicle.soatPhotoUrl,
        soatExpiration: soatDate,
        licenseNumber: vehicle.licenseNumber,
        licenseExpiration: licenseDate
      });

      createdUser.activeVehicle = createdVehicle._id;
      await createdUser.save();

      await sendWelcomeEmail({
        email: createdUser.email,
        firstName: createdUser.firstName
      });

      return res.status(201).json({
        user: toPublicUser(createdUser),
        vehicle: createdVehicle.toObject({ versionKey: false })
      });
    }

    await sendWelcomeEmail({
      email: createdUser.email,
      firstName: createdUser.firstName
    });

    return res.status(201).json({ user: toPublicUser(createdUser), vehicle: null });
  } catch (e) {
    if (createdUser) {
      await User.deleteOne({ _id: createdUser._id }).catch(() => {});
    }

    if (e?.code === 11000) {
      const duplicatedField = Object.keys(e.keyValue || {})[0];
      if (duplicatedField === "email") {
        return res.status(409).json({ error: "Email ya registrado" });
      }
      if (duplicatedField === "plate") {
        return res.status(409).json({ error: "Placa ya registrada" });
      }
      if (duplicatedField === "owner") {
        return res.status(400).json({ error: "El conductor ya tiene un vehículo registrado" });
      }
    }

    console.error("register error", e);
    return res.status(500).json({ error: "Error registrando usuario" });
  }
});

// POST /auth/login: authenticate credentials and return a signed JWT for stateless sessions.
router.post("/login", async (req, res) => {
  try {
    if (!isDbReady()) return res.status(503).json({ error: "DB no disponible. Configura MONGO_URI o levanta Mongo." });

    const { email, password } = req.body || {};
    const normEmail = String(email || "").trim().toLowerCase();

  const user = await User.findOne({ email: normEmail });
  if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    // Compare provided password with stored hash. Timing-safe by design in bcrypt.
    const ok = await bcrypt.compare(password || "", user.passwordHash || "");
  if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    // Issue a JWT including subject and email; 7d expiry balances UX and security for dev.
    const token = jwt.sign({ sub: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
  return res.json({ token, user: toPublicUser(user) });
  } catch {
    return res.status(500).json({ error: "Error de autenticación" });
  }
});

// GET /auth/me: return the authenticated user's profile.
// Uses requireAuth middleware to verify and attach req.user (JWT claims).
router.get("/me", requireAuth, async (req, res) => {
  try {
    if (!isDbReady()) return res.status(503).json({ error: "DB no disponible" });
    const user = await User.findById(req.user.sub).lean();
    return res.json({ user: toPublicUser(user) });
  } catch {
    return res.status(500).json({ error: "Error cargando perfil" });
  }
});

// PUT /auth/me: update partial profile fields for the authenticated user.
router.put("/me", requireAuth, async (req, res) => {
  try {
    if (!isDbReady()) return res.status(503).json({ error: "DB no disponible" });
    const {
      firstName,
      lastName,
      phone,
      photoUrl,
      emergencyContact,
      preferredPaymentMethod
    } = req.body || {};

    const updates = {};

    if (firstName !== undefined) updates.firstName = String(firstName).trim();
    if (lastName !== undefined) updates.lastName = String(lastName).trim();
    if (phone !== undefined) updates.phone = String(phone).trim();
    if (photoUrl !== undefined) updates.photoUrl = photoUrl || "";

    if (preferredPaymentMethod !== undefined) {
      if (preferredPaymentMethod && !["cash", "nequi"].includes(preferredPaymentMethod)) {
        return res.status(400).json({ error: "Método de pago preferido inválido" });
      }
      updates.preferredPaymentMethod = preferredPaymentMethod || "cash";
    }

    if (emergencyContact !== undefined) {
      if (emergencyContact === null || emergencyContact === "") {
        updates.emergencyContact = null;
      } else if (
        typeof emergencyContact === "object" &&
        (emergencyContact.name || emergencyContact.phone)
      ) {
        updates.emergencyContact = {
          name: emergencyContact.name ? String(emergencyContact.name).trim() : undefined,
          phone: emergencyContact.phone ? String(emergencyContact.phone).trim() : undefined
        };
      } else {
        return res.status(400).json({ error: "Contacto de emergencia inválido" });
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No hay cambios para actualizar" });
    }

    const user = await User.findByIdAndUpdate(req.user.sub, updates, {
      new: true,
      runValidators: true
    });

    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    return res.json({ user: toPublicUser(user) });
  } catch (err) {
    console.error("profile update", err);
    return res.status(500).json({ error: "No se pudo actualizar el perfil" });
  }
});

// PUT /auth/role: update active role if the user has the capability.
router.put("/role", requireAuth, async (req, res) => {
  try {
    if (!isDbReady()) return res.status(503).json({ error: "DB no disponible" });
    const { role } = req.body || {};
    if (!role || !["passenger", "driver"].includes(role)) {
      return res.status(400).json({ error: "Rol inválido" });
    }

    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    if (!user.roles.includes(role)) {
      return res.status(403).json({ error: "Rol no habilitado para el usuario" });
    }

    if (role === "driver") {
      const vehicles = await Vehicle.find({ owner: user._id });
      if (!vehicles.length) {
        return res.status(400).json({ error: "Registra un vehículo para activar el modo conductor" });
      }

      const now = new Date();
      const verifiedVehicle = vehicles.find(
        (v) =>
          v.status === "verified" &&
          v.soatExpiration >= now &&
          v.licenseExpiration >= now
      );

      if (!verifiedVehicle) {
        const hasExpiredDoc = vehicles.some(
          (v) => v.soatExpiration < now || v.licenseExpiration < now
        );
        const message = hasExpiredDoc
          ? "Actualiza los documentos del vehículo para habilitar el modo conductor"
          : "Espera a que uno de tus vehículos sea verificado para activar el modo conductor";
        return res.status(400).json({ error: message });
      }

      if (!user.activeVehicle) {
        user.activeVehicle = verifiedVehicle._id;
      }
    }

    user.activeRole = role;
    await user.save();
    return res.json({ user: toPublicUser(user) });
  } catch (err) {
    console.error("role switch error", err);
    return res.status(500).json({ error: "No se pudo actualizar el rol" });
  }
});

// POST /auth/logout: revoke current JWT so it cannot be reused.
router.post("/logout", requireAuth, (req, res) => {
  revokeToken(req.token, req.user?.exp);
  return res.json({ ok: true });
});

// POST /auth/forgot-password: create a one-time token and (mock) send a reset link.
router.post("/forgot-password", async (req, res) => {
  try {
    if (!isDbReady()) return res.status(503).json({ error: "DB no disponible" });
    const { email } = req.body || {};
    const normEmail = String(email || "").trim().toLowerCase();
    const user = await User.findOne({ email: normEmail });
    // Always return OK to avoid leaking which emails are registered.
    if (!user) return res.json({ ok: true });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    await PasswordReset.create({ userId: user._id, token, expiresAt });

    const frontend = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetLink = `${frontend}/reset-password?token=${token}`;

    // TODO: integrate real email provider. For now, log the link for dev.
    console.log(`Password reset link for ${user.email}: ${resetLink}`);
    return res.json({ ok: true });
  } catch (e) {
    console.error("forgot-password error", e);
    return res.status(500).json({ error: "No se pudo procesar la solicitud" });
  }
});

// POST /auth/reset-password: consume token and set new password.
router.post("/reset-password", async (req, res) => {
  try {
    if (!isDbReady()) return res.status(503).json({ error: "DB no disponible" });
    const { token, password } = req.body || {};
    if (!token || !password || password.length < 6) return res.status(400).json({ error: "Token o contraseña inválidos" });

    const pr = await PasswordReset.findOne({ token });
    if (!pr || pr.used || pr.expiresAt < new Date()) return res.status(400).json({ error: "Token inválido o expirado" });

    const user = await User.findById(pr.userId);
    if (!user) return res.status(400).json({ error: "Usuario no encontrado" });

    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();

    pr.used = true;
    await pr.save();

    return res.json({ ok: true });
  } catch (e) {
    console.error("reset-password error", e);
    return res.status(500).json({ error: "No se pudo resetear la contraseña" });
  }
});

export default router;

