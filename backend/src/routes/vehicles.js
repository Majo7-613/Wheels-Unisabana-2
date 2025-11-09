// Vehicle management endpoints (CRUD + pickup points) scoped to the authenticated owner.
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import Vehicle from "../models/Vehicle.js";
import User from "../models/User.js";
import Trip from "../models/Trip.js";

const router = Router();

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
router.post("/", requireAuth, async (req, res) => {
  const {
    plate,
    brand,
    model,
    capacity,
    vehiclePhotoUrl,
    soatPhotoUrl,
    soatExpiration,
    licenseNumber,
    licenseExpiration
  } = req.body || {};
  const numericCapacity = Number(capacity);
  if (!plate || !brand || !model || !capacity || !soatExpiration || !licenseNumber || !licenseExpiration) {
    return res.status(400).json({ error: "Datos de vehículo incompletos" });
  }
  if (!Number.isInteger(numericCapacity) || numericCapacity < 1 || numericCapacity > 8) {
    return res.status(400).json({ error: "Capacidad de vehículo inválida" });
  }

  const soatDate = new Date(soatExpiration);
  const licenseExpDate = new Date(licenseExpiration);
  if (Number.isNaN(soatDate.getTime()) || Number.isNaN(licenseExpDate.getTime())) {
    return res.status(400).json({ error: "Fechas de documentos inválidas" });
  }
  if (soatDate < new Date()) {
    return res.status(400).json({ error: "SOAT vencido" });
  }
  if (licenseExpDate < new Date()) {
    return res.status(400).json({ error: "Licencia vencida" });
  }

  try {
    const normalizedPlate = String(plate).trim().toUpperCase();
    const v = await Vehicle.create({
      owner: req.user.sub,
      plate: normalizedPlate,
      brand,
      model,
      capacity: numericCapacity,
      vehiclePhotoUrl,
      soatPhotoUrl,
      soatExpiration: soatDate,
      licenseNumber,
  licenseExpiration: licenseExpDate,
  status: "pending",
  statusUpdatedAt: new Date(),
  requestedReviewAt: null
    });

    const user = await User.findById(req.user.sub);
    if (user && !user.roles.includes("driver")) {
      user.roles.push("driver");
    }
    if (user && !user.activeVehicle) {
      user.activeVehicle = v._id;
    }
    if (user) await user.save();

    res.status(201).json(decorateVehicle(v.toObject()));
  } catch (err) {
    if (err?.code === 11000) {
      if (err.keyValue?.plate) return res.status(409).json({ error: "Placa ya registrada" });
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

// PUT /vehicles/:id: update a vehicle if it belongs to the user.
router.put("/:id", requireAuth, async (req, res) => {
  const {
    plate,
    brand,
    model,
    capacity,
    vehiclePhotoUrl,
    soatPhotoUrl,
    pickupPoints,
    soatExpiration,
    licenseNumber,
    licenseExpiration
  } = req.body || {};
  try {
    const vehicle = await Vehicle.findOne({ _id: req.params.id, owner: req.user.sub });
    if (!vehicle) return res.status(404).json({ error: "Vehículo no encontrado" });

    let reviewTriggered = false;

    if (plate !== undefined) {
      const normalizedPlate = String(plate).trim().toUpperCase();
      if (!normalizedPlate) {
        return res.status(400).json({ error: "Placa requerida" });
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

    if (vehiclePhotoUrl !== undefined) {
      if (vehicle.vehiclePhotoUrl !== vehiclePhotoUrl) reviewTriggered = true;
      vehicle.vehiclePhotoUrl = vehiclePhotoUrl || undefined;
    }

    if (soatPhotoUrl !== undefined) {
      if (vehicle.soatPhotoUrl !== soatPhotoUrl) reviewTriggered = true;
      vehicle.soatPhotoUrl = soatPhotoUrl || undefined;
    }

    if (capacity !== undefined) {
      const numericCapacity = Number(capacity);
      if (!Number.isInteger(numericCapacity) || numericCapacity < 1 || numericCapacity > 8) {
        return res.status(400).json({ error: "Capacidad de vehículo inválida" });
      }
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
      if (soatDate < new Date()) {
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
      if (licenseDate < new Date()) {
        return res.status(400).json({ error: "Licencia vencida" });
      }
      if (!vehicle.licenseExpiration || vehicle.licenseExpiration.getTime() !== licenseDate.getTime()) {
        reviewTriggered = true;
      }
      vehicle.licenseExpiration = licenseDate;
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
    res.json(decorateVehicle(vehicle.toObject()));
  } catch (err) {
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
