const VERIFICATION_STATUSES_FALLBACK = [
  "pending",
  "under_review",
  "verified",
  "rejected",
  "needs_update"
];

export const VERIFICATION_STATUSES = VERIFICATION_STATUSES_FALLBACK;

export const STATUS_COPY = {
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

export function computeDocumentStatus(expirationDate, now = new Date()) {
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

export function decorateVehicle(vehicleDoc, now = new Date()) {
  const vehicle = typeof vehicleDoc?.toObject === "function" ? vehicleDoc.toObject() : vehicleDoc;
  if (!vehicle) return null;

  const documentStatus = {
    soat: computeDocumentStatus(vehicle?.soatExpiration, now),
    license: computeDocumentStatus(vehicle?.licenseExpiration, now)
  };

  const warnings = [];
  if (documentStatus.soat.status === "expired") warnings.push("SOAT vencido");
  if (documentStatus.soat.status === "expiring") {
    const days = documentStatus.soat.daysUntilExpiration;
    warnings.push(Number.isFinite(days) ? `SOAT por vencer (${days} días)` : "SOAT por vencer");
  }
  if (documentStatus.license.status === "expired") warnings.push("Licencia vencida");
  if (documentStatus.license.status === "expiring") {
    const days = documentStatus.license.daysUntilExpiration;
    warnings.push(Number.isFinite(days) ? `Licencia por vencer (${days} días)` : "Licencia por vencer");
  }

  const documentsOk =
    documentStatus.soat.status === "valid" && documentStatus.license.status === "valid";

  const statusKey = vehicle?.status || "pending";
  const statusInfo = STATUS_COPY[statusKey] || {
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

export function evaluateDriverReadiness(vehiclesDocs, { activeVehicle } = {}, now = new Date()) {
  const decoratedVehicles = (Array.isArray(vehiclesDocs) ? vehiclesDocs : []).map((vehicle) =>
    decorateVehicle(vehicle, now)
  );

  const stats = {
    total: decoratedVehicles.length,
    verified: 0,
    expiredDocuments: 0,
    expiringDocuments: 0,
    needsUpdate: 0,
    rejected: 0,
    underReview: 0
  };

  decoratedVehicles.forEach((vehicle) => {
    if (!vehicle?.meta) return;
    if (vehicle.meta.status === "verified" && vehicle.meta.documentsOk) stats.verified += 1;
    if (vehicle.meta.status === "needs_update") stats.needsUpdate += 1;
    if (vehicle.meta.status === "rejected") stats.rejected += 1;
    if (["pending", "under_review"].includes(vehicle.meta.status)) stats.underReview += 1;

    const soatStatus = vehicle.meta.documents?.soat?.status;
    const licenseStatus = vehicle.meta.documents?.license?.status;
    if (soatStatus === "expired" || licenseStatus === "expired") stats.expiredDocuments += 1;
    if (soatStatus === "expiring" || licenseStatus === "expiring") stats.expiringDocuments += 1;
  });

  const verifiedVehicles = decoratedVehicles.filter((vehicle) => vehicle?.meta?.canActivate);
  const eligible = verifiedVehicles.length > 0;
  let status = eligible ? "ready" : "pending";
  const reasons = [];
  const nextSteps = [];

  const activeVehicleId = activeVehicle ? activeVehicle.toString() : null;
  const preferredVehicle = eligible
    ? verifiedVehicles.find((vehicle) => vehicle?._id?.toString?.() === activeVehicleId) || verifiedVehicles[0]
    : null;

  const primaryVehicleId = preferredVehicle?._id?.toString?.();

  if (!decoratedVehicles.length) {
    status = "no_vehicle";
    reasons.push("Registra tu primer vehículo para activar el modo conductor.");
    nextSteps.push({ action: "vehicles", label: "Registrar vehículo" });
  } else if (eligible) {
    status = "ready";
    const parts = [];
    if (preferredVehicle?.plate) parts.push(`Placa ${preferredVehicle.plate}`);
    const name = [preferredVehicle?.brand, preferredVehicle?.model].filter(Boolean).join(" ");
    if (name) parts.push(name);
    reasons.push(
      parts.length
        ? `Vehículo verificado y listo: ${parts.join(" · ")}.`
        : "Tienes un vehículo verificado y listo para ofrecer viajes."
    );
    nextSteps.push({ action: "create_trip", label: "Crear mi primer viaje" });
  } else if (stats.expiredDocuments > 0) {
    status = "expired_documents";
    reasons.push("Actualiza los documentos (SOAT/licencia) para activar el modo conductor.");
    nextSteps.push({ action: "vehicles", label: "Actualizar documentos" });
  } else if (stats.needsUpdate > 0) {
    status = "needs_update";
    reasons.push("Actualiza la información de tu vehículo y solicita una nueva verificación.");
    nextSteps.push({ action: "vehicles", label: "Actualizar datos del vehículo" });
  } else if (stats.rejected > 0) {
    status = "rejected";
    reasons.push("Corrige las observaciones del vehículo antes de activar el modo conductor.");
    nextSteps.push({ action: "vehicles", label: "Revisar observaciones" });
  } else if (stats.underReview > 0) {
    status = "under_review";
    reasons.push("Tu vehículo está en revisión. Te avisaremos cuando sea aprobado.");
  } else {
    status = "pending";
    reasons.push("Completa la verificación de tu vehículo para habilitar el modo conductor.");
    nextSteps.push({ action: "vehicles", label: "Ir a mis vehículos" });
  }

  return {
    eligible,
    status,
    reasons,
    nextSteps,
    summary: stats,
    primaryVehicleId,
    vehicles: decoratedVehicles
  };
}

export default {
  VERIFICATION_STATUSES,
  STATUS_COPY,
  computeDocumentStatus,
  decorateVehicle,
  evaluateDriverReadiness
};
