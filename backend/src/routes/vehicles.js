// Vehicle management endpoints (CRUD + pickup points) scoped to the authenticated owner.
import { Router } from "express";
import path from "path";
import multer from "multer";
import { requireAuth } from "../middlewares/auth.js";
import Vehicle from "../models/Vehicle.js";
import User from "../models/User.js";
import Trip from "../models/Trip.js";
import { saveBufferFile, removeStoredFile } from "../utils/fileStorage.js";
import {
  validatePlate,
  validateCapacity,
  validateBasics,
  VEHICLE_LIMITS
} from "../utils/vehicleValidation.js";

const router = Router();

const allowedDocumentTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.UPLOAD_MAX_SIZE_MB || 5) * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (allowedDocumentTypes.has(file.mimetype)) {
      cb(null, true);
    } else {
      const error = new Error("Tipo de archivo no permitido. Usa PDF o imagen.");
      error.code = "UNSUPPORTED_FILE";
      cb(error);
    }
  }
});

const uploadVehicleFields = upload.fields([
  { name: "vehiclePhoto", maxCount: 1 },
  { name: "soatDocument", maxCount: 1 },
  { name: "licenseDocument", maxCount: 1 }
]);

function maybeHandleUpload(req, res, next) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return next();
  }
  uploadVehicleFields(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "El archivo supera el tamaño permitido (máx. 5 MB)."
        : err.message || "No se pudo procesar el archivo";
    return res.status(400).json({ error: message });
  });
}

const verificationStatuses = Vehicle.verificationStatuses || [
  "pending",
  "under_review",
  "verified",
  "rejected",
  "needs_update"
];

const statusCopy = {
  pending: {
    label: "Vehículo pendiente",
    description: "Enviaste los datos. Aún está pendiente solicitar o completar la verificación.",
    severity: "info"
  },
  under_review: {
    label: "En revisión",
    description: "Nuestro equipo está validando los documentos del vehículo.",
    severity: "info"
  },
  verified: {
    label: "Vehículo verificado",
    description: "Documentos al día. Puedes activar este vehículo para tus viajes.",
    severity: "success"
  },
  rejected: {
    label: "Verificación rechazada",
    description: "Hay observaciones pendientes. Revisa las notas y actualiza la información.",
    severity: "danger"
  },
  needs_update: {
    label: "Actualiza documentos",
    description: "Actualiza SOAT o licencia antes de solicitar una nueva verificación.",
    severity: "warning"
  }
};

function computeDocumentStatus(expirationDate, now = new Date()) {
  if (!expirationDate) {
    return { status: "missing", expiresOn: null, daysUntilExpiration: null };
  }
  const date = new Date(expirationDate);
  if (Number.isNaN(date.getTime())) {
    return { status: "invalid", expiresOn: null, daysUntilExpiration: null };
  }
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (diff < 0) {
    return { status: "expired", expiresOn: date, daysUntilExpiration: days };
  }
  if (days <= 30) {
    return { status: "expiring", expiresOn: date, daysUntilExpiration: days };
  }
  return { status: "valid", expiresOn: date, daysUntilExpiration: days };
}

function decorateVehicle(vehicleDoc) {
  const vehicle = typeof vehicleDoc?.toObject === "function" ? vehicleDoc.toObject() : vehicleDoc;
  const now = new Date();
  const documentStatus = {
    soat: computeDocumentStatus(vehicle?.soatExpiration, now),
    license: computeDocumentStatus(vehicle?.licenseExpiration, now)
  };

  const warnings = [];
  if (documentStatus.soat.status === "expired") warnings.push("SOAT vencido");
  if (documentStatus.soat.status === "expiring") {
    const days = documentStatus.soat.daysUntilExpiration;
    warnings.push(
      Number.isFinite(days) ? `SOAT por vencer (${days} días)` : "SOAT por vencer"
    );
  }
  if (documentStatus.license.status === "expired") warnings.push("Licencia vencida");
  if (documentStatus.license.status === "expiring") {
    const days = documentStatus.license.daysUntilExpiration;
    warnings.push(
      Number.isFinite(days) ? `Licencia por vencer (${days} días)` : "Licencia por vencer"
    );
  }

  const documentsOk =
    documentStatus.soat.status === "valid" && documentStatus.license.status === "valid";

  const statusKey = vehicle?.status || "pending";
  const statusInfo = statusCopy[statusKey] || {
    label: "Estado desconocido",
    description: "",
    severity: "info"
  };

  const canRequestReview =
    documentsOk && ["pending", "needs_update", "rejected"].includes(statusKey);

  return {
    ...vehicle,
    meta: {
      status: statusKey,
      statusLabel: statusInfo.label,
      statusDescription: statusInfo.description,
      statusSeverity: statusInfo.severity,
      documents: documentStatus,
      documentsOk,
      warnings,
      canRequestReview,
      canActivate: statusKey === "verified" && documentsOk,
      requiresDocumentUpdate:
        statusKey === "rejected" || statusKey === "needs_update" || !documentsOk
    }
  };
}

function normalizePickupPoint(input) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const rawDescription = typeof input?.description === "string" ? input.description.trim() : "";
  const description = rawDescription ? rawDescription : undefined;
  const latNumber = Number(input?.lat);
  const lngNumber = Number(input?.lng);

  if (!name) {
    return { error: "Nombre de punto requerido" };
  }
  if (Number.isNaN(latNumber) || Number.isNaN(lngNumber)) {
    return { error: "Coordenadas inválidas" };
  }
  if (latNumber < -90 || latNumber > 90 || lngNumber < -180 || lngNumber > 180) {
    return { error: "Coordenadas fuera de rango" };
  }

  return {
    name,
    description,
    lat: latNumber,
    lng: lngNumber
  };
}

// POST /vehicles: create a vehicle under the authenticated user.
// Ownership is enforced by setting owner from the JWT subject.
router.post("/", requireAuth, maybeHandleUpload, async (req, res) => {
  const {
    plate,
    brand,
    model,
    capacity,
    vehiclePhotoUrl: existingVehiclePhotoUrl,
    soatPhotoUrl: existingSoatUrl,
    licensePhotoUrl: existingLicenseUrl,
    soatExpiration,
    licenseNumber,
    licenseExpiration,
    year,
    color
  } = req.body || {};

  if (!plate || !brand || !model || !capacity || !soatExpiration || !licenseNumber || !licenseExpiration) {
    return res.status(400).json({ error: "Datos de vehículo incompletos" });
  }

  const plateValidation = validatePlate(plate);
  if (!plateValidation.ok) {
    return res.status(400).json({ error: plateValidation.message });
  }

  const capacityValidation = validateCapacity(capacity);
  if (!capacityValidation.ok) {
    return res.status(400).json({ error: capacityValidation.message });
  }

  const numericCapacity = capacityValidation.value;

  const soatDate = new Date(soatExpiration);
  const licenseExpDate = new Date(licenseExpiration);
  if (Number.isNaN(soatDate.getTime()) || Number.isNaN(licenseExpDate.getTime())) {
    return res.status(400).json({ error: "Fechas de documentos inválidas" });
  }
  const now = new Date();
  if (soatDate < now) {
    return res.status(400).json({ error: "SOAT vencido" });
  }
  if (licenseExpDate < now) {
    return res.status(400).json({ error: "Licencia vencida" });
  }

  const files = req.files || {};
  const soatFile = Array.isArray(files.soatDocument) ? files.soatDocument[0] : null;
  const licenseFile = Array.isArray(files.licenseDocument) ? files.licenseDocument[0] : null;
  const vehiclePhotoFile = Array.isArray(files.vehiclePhoto) ? files.vehiclePhoto[0] : null;

  if (!soatFile && !existingSoatUrl) {
    return res.status(400).json({ error: "Adjunta el documento del SOAT" });
  }
  if (!licenseFile && !existingLicenseUrl) {
    return res.status(400).json({ error: "Adjunta el documento de la licencia" });
  }

  const storedPaths = [];

  try {
  const normalizedPlate = plateValidation.value;
    const sanitizedBrand = String(brand || "").trim();
    const sanitizedModel = String(model || "").trim();
    const sanitizedLicense = String(licenseNumber || "").trim();
    const trimmedColor = color ? String(color).trim() : undefined;
    const yearNumber = year ? Number(year) : undefined;
    if (year !== undefined && !Number.isFinite(yearNumber)) {
      return res.status(400).json({ error: "Año de vehículo inválido" });
    }
    if (
      Number.isFinite(yearNumber) &&
      (yearNumber < 1980 || yearNumber > new Date().getFullYear() + 1)
    ) {
      return res.status(400).json({ error: "Año de vehículo inválido" });
    }

    let vehiclePhotoUrl = existingVehiclePhotoUrl || undefined;
    let soatUrl = existingSoatUrl || undefined;
    let licenseUrl = existingLicenseUrl || undefined;

    const subfolder = path.join("vehicles", String(req.user.sub));

    if (vehiclePhotoFile) {
      const saved = await saveBufferFile(vehiclePhotoFile, { subfolder });
      storedPaths.push(saved.relativePath);
      vehiclePhotoUrl = saved.relativePath;
    }

    if (soatFile) {
      const saved = await saveBufferFile(soatFile, { subfolder });
      storedPaths.push(saved.relativePath);
      soatUrl = saved.relativePath;
    }

    if (licenseFile) {
      const saved = await saveBufferFile(licenseFile, { subfolder });
      storedPaths.push(saved.relativePath);
      licenseUrl = saved.relativePath;
    }

    const vehicle = await Vehicle.create({
      owner: req.user.sub,
      plate: normalizedPlate,
      brand: sanitizedBrand,
      model: sanitizedModel,
      capacity: numericCapacity,
      vehiclePhotoUrl,
      soatPhotoUrl: soatUrl,
      licensePhotoUrl: licenseUrl,
      soatExpiration: soatDate,
      licenseNumber: sanitizedLicense,
      licenseExpiration: licenseExpDate,
      year: Number.isFinite(yearNumber) ? yearNumber : undefined,
      color: trimmedColor || undefined,
      status: "pending",
      statusUpdatedAt: now,
      requestedReviewAt: null
    });

    const user = await User.findById(req.user.sub);
    if (user) {
      if (!user.roles.includes("driver")) {
        user.roles.push("driver");
      }
      if (!user.activeVehicle) {
        user.activeVehicle = vehicle._id;
      }
      await user.save();
    }

    res.status(201).json(decorateVehicle(vehicle.toObject()));
  } catch (err) {
    if (storedPaths.length) {
      await Promise.all(storedPaths.map((relativePath) => removeStoredFile(relativePath)));
    }

    if (err?.code === 11000 && err.keyValue?.plate) {
      return res.status(409).json({ error: "Placa ya registrada" });
    }

    console.error("vehicle create", err);
    res.status(500).json({ error: "No se pudo registrar el vehículo" });
  }
});

// GET /vehicles: list vehicles belonging to the authenticated user.
// Uses lean() for performance (returns plain JS objects, not Mongoose documents).
router.get("/", requireAuth, async (req, res) => {
  const list = await Vehicle.find({ owner: req.user.sub }).lean();
  res.json(list.map((vehicle) => decorateVehicle(vehicle)));
});

router.post("/validate", requireAuth, (req, res) => {
  const { plate, capacity } = req.body || {};
  const validation = validateBasics({ plate, capacity });

  return res.json({
    ok: validation.ok,
    errors: validation.errors,
    normalized: validation.normalized,
    limits: VEHICLE_LIMITS
  });
});

// PUT /vehicles/:id: update a vehicle if it belongs to the user.
router.put("/:id", requireAuth, maybeHandleUpload, async (req, res) => {
  const {
    plate,
    brand,
    model,
    capacity,
    vehiclePhotoUrl: incomingVehiclePhotoUrl,
    soatPhotoUrl: incomingSoatUrl,
    licensePhotoUrl: incomingLicenseUrl,
    pickupPoints,
    soatExpiration,
    licenseNumber,
    licenseExpiration,
    year,
    color
  } = req.body || {};

  try {
    const vehicle = await Vehicle.findOne({ _id: req.params.id, owner: req.user.sub });
    if (!vehicle) return res.status(404).json({ error: "Vehículo no encontrado" });

    let reviewTriggered = false;
    const subfolder = path.join("vehicles", String(req.user.sub));
    const files = req.files || {};
    const soatFile = Array.isArray(files.soatDocument) ? files.soatDocument[0] : null;
    const licenseFile = Array.isArray(files.licenseDocument) ? files.licenseDocument[0] : null;
    const vehiclePhotoFile = Array.isArray(files.vehiclePhoto) ? files.vehiclePhoto[0] : null;

    const newStoredPaths = [];
    const toRemoveAfterSuccess = [];

    if (plate !== undefined) {
      const plateValidation = validatePlate(plate);
      const normalizedPlate = plateValidation.value;
      if (!plateValidation.ok) {
        return res.status(400).json({ error: plateValidation.message });
      }
      if (normalizedPlate !== vehicle.plate) {
        reviewTriggered = true;
      }
      vehicle.plate = normalizedPlate;
    }

    if (brand !== undefined) {
      const trimmedBrand = String(brand).trim();
      if (!trimmedBrand) {
        return res.status(400).json({ error: "Marca requerida" });
      }
      if (trimmedBrand !== vehicle.brand) reviewTriggered = true;
      vehicle.brand = trimmedBrand;
    }

    if (model !== undefined) {
      const trimmedModel = String(model).trim();
      if (!trimmedModel) {
        return res.status(400).json({ error: "Modelo requerido" });
      }
      if (trimmedModel !== vehicle.model) reviewTriggered = true;
      vehicle.model = trimmedModel;
    }

    if (vehiclePhotoFile) {
      const saved = await saveBufferFile(vehiclePhotoFile, { subfolder });
      newStoredPaths.push(saved.relativePath);
      if (vehicle.vehiclePhotoUrl) toRemoveAfterSuccess.push(vehicle.vehiclePhotoUrl);
      vehicle.vehiclePhotoUrl = saved.relativePath;
      reviewTriggered = true;
    } else if (incomingVehiclePhotoUrl !== undefined) {
      if (vehicle.vehiclePhotoUrl !== incomingVehiclePhotoUrl) reviewTriggered = true;
      if (!incomingVehiclePhotoUrl && vehicle.vehiclePhotoUrl) {
        toRemoveAfterSuccess.push(vehicle.vehiclePhotoUrl);
      }
      vehicle.vehiclePhotoUrl = incomingVehiclePhotoUrl || undefined;
    }

    if (soatFile) {
      const saved = await saveBufferFile(soatFile, { subfolder });
      newStoredPaths.push(saved.relativePath);
      if (vehicle.soatPhotoUrl) toRemoveAfterSuccess.push(vehicle.soatPhotoUrl);
      vehicle.soatPhotoUrl = saved.relativePath;
      reviewTriggered = true;
    } else if (incomingSoatUrl !== undefined) {
      if (vehicle.soatPhotoUrl !== incomingSoatUrl) reviewTriggered = true;
      vehicle.soatPhotoUrl = incomingSoatUrl || undefined;
    }

    if (licenseFile) {
      const saved = await saveBufferFile(licenseFile, { subfolder });
      newStoredPaths.push(saved.relativePath);
      if (vehicle.licensePhotoUrl) toRemoveAfterSuccess.push(vehicle.licensePhotoUrl);
      vehicle.licensePhotoUrl = saved.relativePath;
      reviewTriggered = true;
    } else if (incomingLicenseUrl !== undefined) {
      if (vehicle.licensePhotoUrl !== incomingLicenseUrl) reviewTriggered = true;
      vehicle.licensePhotoUrl = incomingLicenseUrl || undefined;
    }

    if (capacity !== undefined) {
      const capacityValidation = validateCapacity(capacity);
      if (!capacityValidation.ok) {
        return res.status(400).json({ error: capacityValidation.message });
      }
      const numericCapacity = capacityValidation.value;
      if (vehicle.capacity !== numericCapacity) reviewTriggered = true;
      vehicle.capacity = numericCapacity;
    }

    if (licenseNumber !== undefined) {
      const trimmedLicense = String(licenseNumber).trim();
      if (!trimmedLicense) {
        return res.status(400).json({ error: "Número de licencia requerido" });
      }
      if (vehicle.licenseNumber !== trimmedLicense) reviewTriggered = true;
      vehicle.licenseNumber = trimmedLicense;
    }

    if (soatExpiration !== undefined) {
      const soatDate = new Date(soatExpiration);
      if (Number.isNaN(soatDate.getTime())) {
        return res.status(400).json({ error: "Fecha de SOAT inválida" });
      }
      const now = new Date();
      if (soatDate < now) {
        return res.status(400).json({ error: "SOAT vencido" });
      }
      if (!vehicle.soatExpiration || vehicle.soatExpiration.getTime() !== soatDate.getTime()) {
        reviewTriggered = true;
      }
      vehicle.soatExpiration = soatDate;
    }

    if (licenseExpiration !== undefined) {
      const licenseDate = new Date(licenseExpiration);
      if (Number.isNaN(licenseDate.getTime())) {
        return res.status(400).json({ error: "Fecha de licencia inválida" });
      }
      const now = new Date();
      if (licenseDate < now) {
        return res.status(400).json({ error: "Licencia vencida" });
      }
      if (!vehicle.licenseExpiration || vehicle.licenseExpiration.getTime() !== licenseDate.getTime()) {
        reviewTriggered = true;
      }
      vehicle.licenseExpiration = licenseDate;
    }

    if (year !== undefined) {
      const parsedYear = Number(year);
      if (!Number.isFinite(parsedYear) || parsedYear < 1980 || parsedYear > new Date().getFullYear() + 1) {
        return res.status(400).json({ error: "Año de vehículo inválido" });
      }
      if (vehicle.year !== parsedYear) reviewTriggered = true;
      vehicle.year = parsedYear;
    }

    if (color !== undefined) {
      const trimmedColor = String(color).trim();
      if (!trimmedColor) {
        if (vehicle.color) reviewTriggered = true;
        vehicle.color = undefined;
      } else {
        if (vehicle.color !== trimmedColor) reviewTriggered = true;
        vehicle.color = trimmedColor;
      }
    }

    if (pickupPoints !== undefined) {
      if (!Array.isArray(pickupPoints)) {
        return res.status(400).json({ error: "pickupPoints debe ser una lista" });
      }
      const sanitized = [];
      for (const point of pickupPoints) {
        const normalized = normalizePickupPoint(point);
        if (normalized.error) {
          return res.status(400).json({ error: normalized.error });
        }
        sanitized.push({ ...normalized, _id: point?._id });
      }
      vehicle.pickupPoints = sanitized;
    }

    if (reviewTriggered) {
      vehicle.status = "pending";
      vehicle.statusUpdatedAt = new Date();
      vehicle.requestedReviewAt = null;
      vehicle.reviewedAt = null;
      vehicle.reviewedBy = null;
      vehicle.verificationNotes = undefined;
    }

    await vehicle.save();

    if (toRemoveAfterSuccess.length) {
      await Promise.all(toRemoveAfterSuccess.map((relativePath) => removeStoredFile(relativePath)));
    }

    res.json(decorateVehicle(vehicle.toObject()));
  } catch (err) {
    if (Array.isArray(newStoredPaths) && newStoredPaths.length) {
      await Promise.all(newStoredPaths.map((relativePath) => removeStoredFile(relativePath)));
    }
    if (err?.code === 11000 && err.keyValue?.plate) {
      return res.status(409).json({ error: "Placa ya registrada" });
    }
    console.error("vehicle update", err);
    res.status(500).json({ error: "No se pudo actualizar el vehículo" });
  }
});

// DELETE /vehicles/:id: remove the vehicle if owned by the user.
router.delete("/:id", requireAuth, async (req, res) => {
  const blockingTrip = await Trip.findOne({
    vehicle: req.params.id,
    driver: req.user.sub,
    status: { $in: ["scheduled", "full"] },
    departureAt: { $gte: new Date() }
  }).lean();

  if (blockingTrip) {
    return res.status(400).json({
      error: "No puedes eliminar este vehículo mientras tenga viajes activos programados"
    });
  }

  const vehicle = await Vehicle.findOneAndDelete({ _id: req.params.id, owner: req.user.sub });
  if (!vehicle) return res.status(404).json({ error: "Vehículo no encontrado" });

  const user = await User.findById(req.user.sub);
  if (user) {
    const remainingVehicles = await Vehicle.find({ owner: req.user.sub }).sort({ createdAt: 1 });
    if (!remainingVehicles.length) {
      user.roles = user.roles.filter((role) => role !== "driver");
      if (user.activeRole === "driver") {
        user.activeRole = "passenger";
      }
      user.activeVehicle = null;
    } else {
      const now = new Date();
      const nextActive =
        remainingVehicles.find(
          (v) => v.soatExpiration >= now && v.licenseExpiration >= now
        ) || remainingVehicles[0];

      if (!user.activeVehicle || user.activeVehicle.toString() === vehicle._id.toString()) {
        user.activeVehicle = nextActive?._id || null;
      }
      if (!user.roles.includes("driver")) {
        user.roles.push("driver");
      }
    }
    await user.save();
  }

  res.json({ ok: true });
});

// PUT /vehicles/:id/activate: mark selected vehicle as the driver's active vehicle for future trips.
router.put("/:id/activate", requireAuth, async (req, res) => {
  const vehicle = await Vehicle.findOne({ _id: req.params.id, owner: req.user.sub });
  if (!vehicle) return res.status(404).json({ error: "Vehículo no encontrado" });

  const now = new Date();
  if (vehicle.soatExpiration < now || vehicle.licenseExpiration < now) {
    return res.status(400).json({ error: "Actualiza los documentos antes de activar este vehículo" });
  }
  if (vehicle.status !== "verified") {
    return res.status(400).json({ error: "Espera la verificación del vehículo antes de activarlo" });
  }

  const user = await User.findById(req.user.sub);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  user.activeVehicle = vehicle._id;
  if (!user.roles.includes("driver")) {
    user.roles.push("driver");
  }
  await user.save();

  return res.json({
    user: { id: user._id, activeVehicle: user.activeVehicle },
    vehicle: decorateVehicle(vehicle.toObject())
  });
});

router.get("/:id/pickup-points", requireAuth, async (req, res) => {
  const vehicle = await Vehicle.findOne({ _id: req.params.id, owner: req.user.sub }).lean();
  if (!vehicle) return res.status(404).json({ error: "Vehículo no encontrado" });
  return res.json({ pickupPoints: vehicle.pickupPoints || [] });
});

router.post("/:id/pickup-points", requireAuth, async (req, res) => {
  const vehicle = await Vehicle.findOne({ _id: req.params.id, owner: req.user.sub });
  if (!vehicle) return res.status(404).json({ error: "Vehículo no encontrado" });

  const normalized = normalizePickupPoint(req.body || {});
  if (normalized.error) {
    return res.status(400).json({ error: normalized.error });
  }

  vehicle.pickupPoints.push(normalized);
  await vehicle.save();

  const created = vehicle.pickupPoints[vehicle.pickupPoints.length - 1];
  return res.status(201).json({ pickupPoint: created });
});

router.put("/:id/pickup-points/:pointId", requireAuth, async (req, res) => {
  const vehicle = await Vehicle.findOne({ _id: req.params.id, owner: req.user.sub });
  if (!vehicle) return res.status(404).json({ error: "Vehículo no encontrado" });

  const point = vehicle.pickupPoints.id(req.params.pointId);
  if (!point) {
    return res.status(404).json({ error: "Punto no encontrado" });
  }

  const normalized = normalizePickupPoint(req.body || {});
  if (normalized.error) {
    return res.status(400).json({ error: normalized.error });
  }

  point.name = normalized.name;
  point.description = normalized.description;
  point.lat = normalized.lat;
  point.lng = normalized.lng;

  await vehicle.save();
  return res.json({ pickupPoint: point });
});

router.delete("/:id/pickup-points/:pointId", requireAuth, async (req, res) => {
  const vehicle = await Vehicle.findOne({ _id: req.params.id, owner: req.user.sub });
  if (!vehicle) return res.status(404).json({ error: "Vehículo no encontrado" });

  const point = vehicle.pickupPoints.id(req.params.pointId);
  if (!point) {
    return res.status(404).json({ error: "Punto no encontrado" });
  }

  point.deleteOne();
  await vehicle.save();

  return res.json({ ok: true });
});

router.post("/:id/request-review", requireAuth, async (req, res) => {
  const vehicle = await Vehicle.findOne({ _id: req.params.id, owner: req.user.sub });
  if (!vehicle) return res.status(404).json({ error: "Vehículo no encontrado" });

  const now = new Date();
  if (vehicle.soatExpiration < now || vehicle.licenseExpiration < now) {
    return res.status(400).json({ error: "Actualiza los documentos antes de solicitar la verificación" });
  }

  if (!verificationStatuses.includes(vehicle.status)) {
    vehicle.status = "pending";
  }

  if (vehicle.status === "under_review") {
    return res.status(200).json({
      message: "Tu vehículo ya está en revisión",
      vehicle: decorateVehicle(vehicle.toObject())
    });
  }

  vehicle.status = "under_review";
  vehicle.statusUpdatedAt = now;
  vehicle.requestedReviewAt = now;
  vehicle.reviewedAt = null;
  vehicle.reviewedBy = null;
  await vehicle.save();

  return res.json({
    message: "Tu solicitud fue enviada al equipo de verificación",
    vehicle: decorateVehicle(vehicle.toObject())
  });
});

export default router;
