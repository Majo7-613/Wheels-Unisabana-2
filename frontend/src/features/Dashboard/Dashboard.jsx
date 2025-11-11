import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext.jsx";

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

const severityThemes = {
  danger: "border-red-300 bg-red-50/80",
  warning: "border-amber-300 bg-amber-50/80",
  info: "border-sky-300 bg-sky-50/80",
  success: "border-emerald-300 bg-emerald-50/70"
};

const severityLabels = {
  danger: "Error",
  warning: "Advertencia",
  info: "Seguimiento",
  success: "Estado"
};

const docBadgeThemes = {
  expired: "border border-red-200 bg-red-100 text-red-700",
  expiring: "border border-amber-200 bg-amber-100 text-amber-700",
  missing: "border border-red-200 bg-red-100 text-red-700",
  invalid: "border border-red-200 bg-red-100 text-red-700"
};

const docBadgeLabels = {
  expired: "Vencido",
  expiring: "Pronto a vencer",
  missing: "Falta registrar",
  invalid: "Fecha inválida"
};

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatDaysUntil(days) {
  if (!Number.isFinite(days)) return "";
  if (days === 0) return "Vence hoy";
  if (days > 0) return `Quedan ${days} día${days === 1 ? "" : "s"}`;
  const abs = Math.abs(days);
  return `Vencido hace ${abs} día${abs === 1 ? "" : "s"}`;
}

function DriverDocumentsNotice({ readiness }) {
  if (!readiness) return null;

  const { summary = {}, status, reasons = [], vehicles = [], nextSteps = [] } = readiness;
  const expiringCount = Number(summary.expiringDocuments || 0);
  const expiredCount = Number(summary.expiredDocuments || 0);
  const showCard = status !== "ready" || expiringCount > 0 || expiredCount > 0;
  if (!showCard) return null;

  let severity = "info";
  if (expiredCount > 0 || status === "expired_documents" || status === "rejected") {
    severity = "danger";
  } else if (expiringCount > 0 || status === "needs_update" || status === "no_vehicle") {
    severity = "warning";
  } else if (status === "ready") {
    severity = "success";
  }

  let title = "Estado de documentos";
  if (status === "no_vehicle") {
    title = "Registra tu primer vehículo";
  } else if (severity === "danger") {
    title = "Actualiza tus documentos";
  } else if (severity === "warning") {
    title = "Documentos por renovar";
  } else if (severity === "success") {
    title = "Documentos próximos a vencer";
  }

  const docIssues = [];
  vehicles.forEach((vehicle) => {
    const docs = vehicle?.meta?.documents || {};
    const plate = vehicle?.plate || "Sin placa";
    if (docs.soat && ["expiring", "expired", "missing", "invalid"].includes(docs.soat.status)) {
      docIssues.push({
        id: `${vehicle?._id || plate}-soat`,
        label: `SOAT · ${plate}`,
        status: docs.soat.status,
        expiresOn: docs.soat.expiresOn || vehicle?.soatExpiration,
        days: docs.soat.daysUntilExpiration
      });
    }
    if (docs.license && ["expiring", "expired", "missing", "invalid"].includes(docs.license.status)) {
      docIssues.push({
        id: `${vehicle?._id || plate}-license`,
        label: `Licencia · ${plate}`,
        status: docs.license.status,
        expiresOn: docs.license.expiresOn || vehicle?.licenseExpiration,
        days: docs.license.daysUntilExpiration
      });
    }
  });

  const uniqueReasons = Array.from(new Set(reasons.filter(Boolean)));
  if (expiringCount > 0 && !uniqueReasons.some((text) => /vencer/i.test(text))) {
    uniqueReasons.push(
      "Tienes documentos próximos a vencer. Renueva antes de que expiren para seguir ofreciendo viajes."
    );
  }

  const steps = nextSteps.filter((step) => step?.action === "vehicles");

  return (
    <div
      className={`mb-6 rounded-2xl border-2 p-5 shadow-sm transition-colors ${
        severityThemes[severity] || severityThemes.info
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <span className="inline-flex items-center rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">
            {severityLabels[severity] || "Seguimiento"}
          </span>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          {uniqueReasons.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {uniqueReasons.map((reason) => (
                <li key={reason} className="flex items-start gap-2">
                  <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-slate-400" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-700">
              Mantén tus documentos al día para publicar y gestionar viajes sin interrupciones.
            </p>
          )}
        </div>
        <Link
          to="/vehicles"
          className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"
        >
          Gestionar documentos
        </Link>
      </div>

      {docIssues.length > 0 ? (
        <div className="mt-4 space-y-3">
          {docIssues.map((item) => {
            const badgeClass = docBadgeThemes[item.status] || "border border-slate-200 bg-slate-100 text-slate-600";
            const badgeLabel = docBadgeLabels[item.status] || "Revisar";
            const expiresOn = formatShortDate(item.expiresOn);
            const daysMessage = formatDaysUntil(item.days);
            const details = [expiresOn ? `Vence el ${expiresOn}` : null, daysMessage || null]
              .filter(Boolean)
              .join(" · ");

            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/80 px-4 py-3 text-sm text-slate-800 shadow-sm"
              >
                <div>
                  <p className="font-semibold text-slate-900">{item.label}</p>
                  {details ? <p className="text-xs text-slate-600">{details}</p> : null}
                </div>
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
                  {badgeLabel}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {steps.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
          {steps.map((step) => (
            <span key={step.label} className="rounded-full bg-white/60 px-3 py-1 font-medium text-slate-700">
              {step.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Dashboard() {
  const { user, loadingProfile, refreshProfile } = useAuth();
  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [driverReadiness, setDriverReadiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    async function fetchData() {
      if (!user) return;
      const driverRole = (user?.roles || []).includes("driver");
      setLoading(true);
      setError("");
      try {
        await refreshProfile();
      } catch {
        /* best effort */
      }
      try {
        const requests = [api.get("/trips"), api.get("/vehicles")];
        if (driverRole) {
          requests.push(api.get("/vehicles/documents/validate"));
        }

        const results = await Promise.allSettled(requests);
        const tripsRes = results[0];
        const vehiclesRes = results[1];
        const readinessRes = driverRole ? results[2] : null;
        if (ignore) return;
        if (tripsRes.status === "fulfilled") {
          setTrips(tripsRes.value?.data?.trips || []);
        } else {
          setTrips([]);
          setError("No se pudieron cargar los viajes disponibles");
        }
        if (vehiclesRes.status === "fulfilled") {
          setVehicles(Array.isArray(vehiclesRes.value?.data) ? vehiclesRes.value.data : []);
        } else {
          setVehicles([]);
        }
        if (driverRole) {
          if (readinessRes?.status === "fulfilled") {
            setDriverReadiness(readinessRes.value?.data?.readiness || null);
          } else {
            setDriverReadiness(null);
          }
        } else {
          setDriverReadiness(null);
        }
      } catch (err) {
        if (ignore) return;
        console.error("dashboard fetch", err);
        setError("Error cargando información");
        setDriverReadiness(null);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    if (user && !loadingProfile) {
      fetchData();
    }
    return () => {
      ignore = true;
    };
  }, [user, loadingProfile, refreshProfile]);

  const userId = user?.id;
  const isDriver = useMemo(() => (user?.roles || []).includes("driver"), [user?.roles]);
  const myDriverTrips = useMemo(
    () =>
      trips.filter((trip) => (trip.driver || "").toString() === (userId || "") && trip.status !== "cancelled"),
    [trips, userId]
  );

  const upcomingDriverTrips = useMemo(
    () =>
      myDriverTrips
        .map((trip) => ({ ...trip, departureDate: new Date(trip.departureAt) }))
        .filter((t) => !Number.isNaN(t.departureDate.getTime()) && t.departureDate >= new Date())
        .sort((a, b) => a.departureDate - b.departureDate)
        .slice(0, 3),
    [myDriverTrips]
  );

  const myReservations = useMemo(() => {
    if (!userId) return [];
    const items = [];
    for (const trip of trips) {
      if (!Array.isArray(trip.reservations)) continue;
      for (const reservation of trip.reservations) {
        if ((reservation?.passenger || "").toString() === userId) {
          items.push({ trip, reservation });
        }
      }
    }
    return items
      .filter(({ reservation }) => !["cancelled", "rejected"].includes(reservation.status))
      .map(({ trip, reservation }) => ({
        trip,
        reservation,
        departureDate: new Date(trip.departureAt)
      }))
      .sort((a, b) => a.departureDate - b.departureDate);
  }, [trips, userId]);

  const metrics = useMemo(() => {
    const base = [
      { label: "Viajes disponibles", value: trips.length },
  { label: "Mis reservas", value: myReservations.length }
    ];
    if (isDriver) {
      base.push({ label: "Mis viajes publicados", value: myDriverTrips.length });
      base.push({ label: "Vehículos registrados", value: vehicles.length });
    }
    return base;
  }, [trips.length, myReservations.length, myDriverTrips.length, vehicles.length, isDriver]);

  return (
    <section className="py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Hola, {user?.firstName || user?.email}</h1>
        <p className="text-sm text-slate-600">
          Gestiona tus viajes, reservas y vehículos desde este panel. La información se actualiza en tiempo real con el backend.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {isDriver ? <DriverDocumentsNotice readiness={driverReadiness} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border border-white/60 bg-white/80 p-4 shadow-sm">
            <p className="text-sm text-slate-500">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {(user?.roles || []).includes("driver") && (
          <section className="rounded-xl border border-white/60 bg-white/80 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Próximos viajes como conductor</h2>
            {loading && upcomingDriverTrips.length === 0 ? (
              <p className="text-sm text-slate-500">Cargando...</p>
            ) : upcomingDriverTrips.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aún no tienes viajes programados. Crea uno desde la opción "Crear viaje".
              </p>
            ) : (
              <ul className="space-y-3">
                {upcomingDriverTrips.map((trip) => (
                  <li key={trip._id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-slate-500">{formatDateTime(trip.departureAt)}</p>
                        <h3 className="text-base font-medium text-slate-900">
                          {trip.origin} → {trip.destination}
                        </h3>
                        <p className="text-sm text-slate-500">{trip.routeDescription || "Ruta estándar"}</p>
                      </div>
                      <div className="text-right text-sm text-slate-500">
                        <p>Estado: {trip.status === "full" ? "Lleno" : "Programado"}</p>
                        <p>Cupos: {trip.seatsAvailable}/{trip.seatsTotal}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="rounded-xl border border-white/60 bg-white/80 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Mis reservas</h2>
          {loading && myReservations.length === 0 ? (
            <p className="text-sm text-slate-500">Cargando...</p>
          ) : myReservations.length === 0 ? (
            <p className="text-sm text-slate-500">
              Cuando reserves un cupo verás el resumen aquí.
            </p>
          ) : (
            <ul className="space-y-3">
              {myReservations.slice(0, 4).map(({ trip, reservation }) => (
                <li
                  key={`${trip._id}-${reservation._id ?? reservation.pickupPoints?.[0]?.name ?? "pickup"}`}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-500">{formatDateTime(trip.departureAt)}</p>
                      <h3 className="text-base font-medium text-slate-900">
                        {trip.origin} → {trip.destination}
                      </h3>
                      <p className="text-sm text-slate-600">
                        Cupos reservados: <span className="font-medium">{reservation.seats}</span>
                      </p>
                      {reservation.pickupPoints?.length > 0 && (
                        <p className="text-xs text-slate-500">
                          Punto de recogida: {reservation.pickupPoints[0].name}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-xs text-slate-500 uppercase tracking-wide">
                      {reservation.status === "pending"
                        ? "Pendiente"
                        : reservation.status === "confirmed"
                        ? "Confirmada"
                        : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
