import { useEffect, useMemo, useState } from "react";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext.jsx";

const emptyVehicle = {
  plate: "",
  brand: "",
  model: "",
  capacity: "",
  vehiclePhotoUrl: "",
  soatPhotoUrl: "",
  soatExpiration: "",
  licenseNumber: "",
  licenseExpiration: ""
};

function formatDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function isDocumentValid(dateValue) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  return date >= new Date();
}

export default function VehiclesPage() {
  const { user, refreshProfile } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("list");
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(emptyVehicle);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activatingId, setActivatingId] = useState("");

  const isDriver = useMemo(() => (user?.roles || []).includes("driver"), [user?.roles]);
  const activeVehicleId = user?.activeVehicle?.toString?.() || user?.activeVehicle || "";

  async function fetchVehicles() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/vehicles");
      const list = Array.isArray(data) ? data : [];
      setVehicles(list);
    } catch (err) {
      console.error("vehicles fetch", err);
      setError("No se pudieron cargar los vehículos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setMode("create");
    setSelectedId("");
    setForm(emptyVehicle);
    setError("");
    setSuccess("");
  }

  function openEdit(vehicle) {
    setMode("edit");
    setSelectedId(vehicle._id);
    setForm({
      plate: vehicle.plate || "",
      brand: vehicle.brand || "",
      model: vehicle.model || "",
      capacity: String(vehicle.capacity ?? ""),
      vehiclePhotoUrl: vehicle.vehiclePhotoUrl || "",
      soatPhotoUrl: vehicle.soatPhotoUrl || "",
      soatExpiration: formatDateInput(vehicle.soatExpiration),
      licenseNumber: vehicle.licenseNumber || "",
      licenseExpiration: formatDateInput(vehicle.licenseExpiration)
    });
    setError("");
    setSuccess("");
  }

  function resetToList(message = "") {
    setMode("list");
    setSelectedId("");
    setForm(emptyVehicle);
    if (message) setSuccess(message);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.plate || !form.brand || !form.model || !form.capacity) {
      setError("Completa los campos obligatorios marcados con *");
      return;
    }
    if (!form.soatExpiration || !form.licenseNumber || !form.licenseExpiration) {
      setError("Debes registrar la información del SOAT y la licencia");
      return;
    }

    const payload = {
      plate: form.plate.trim().toUpperCase(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      capacity: Number(form.capacity),
      vehiclePhotoUrl: form.vehiclePhotoUrl || undefined,
      soatPhotoUrl: form.soatPhotoUrl || undefined,
      soatExpiration: form.soatExpiration,
      licenseNumber: form.licenseNumber.trim(),
      licenseExpiration: form.licenseExpiration
    };

    if (!Number.isInteger(payload.capacity) || payload.capacity < 1 || payload.capacity > 8) {
      setError("La capacidad debe ser un número entre 1 y 8");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "edit" && selectedId) {
        await api.put(`/vehicles/${selectedId}`, payload);
        resetToList("Vehículo actualizado correctamente");
      } else {
        await api.post("/vehicles", payload);
        resetToList("Vehículo registrado correctamente");
      }
      await fetchVehicles();
      await refreshProfile();
    } catch (err) {
      const message = err?.response?.data?.error || "No se pudo guardar el vehículo";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(vehicleId) {
    if (!window.confirm("¿Eliminar este vehículo? Esta acción no se puede deshacer.")) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await api.delete(`/vehicles/${vehicleId}`);
      await fetchVehicles();
      await refreshProfile();
      resetToList("Vehículo eliminado");
    } catch (err) {
      const message = err?.response?.data?.error || "No se pudo eliminar el vehículo";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleActivate(vehicleId) {
    if (!vehicleId || vehicleId === activeVehicleId) return;
    setActivatingId(vehicleId);
    setError("");
    setSuccess("");
    try {
      await api.put(`/vehicles/${vehicleId}/activate`, {});
      await refreshProfile();
      setSuccess("Vehículo activado para futuros viajes");
    } catch (err) {
      const message = err?.response?.data?.error || "No se pudo activar el vehículo";
      setError(message);
    } finally {
      setActivatingId("");
    }
  }

  const validVehicles = vehicles.filter((vehicle) => {
    if (vehicle?.meta?.documentsOk !== undefined) return vehicle.meta.documentsOk;
    return isDocumentValid(vehicle.soatExpiration) && isDocumentValid(vehicle.licenseExpiration);
  });

  const severityStyles = {
    success: "border-emerald-300 bg-emerald-50 text-emerald-700",
    info: "border-sky-300 bg-sky-50 text-sky-700",
    warning: "border-amber-300 bg-amber-50 text-amber-700",
    danger: "border-red-300 bg-red-50 text-red-700",
    default: "border-slate-200 bg-slate-100 text-slate-600"
  };

  if (!isDriver && vehicles.length === 0) {
    return (
      <section className="py-6">
        <h1 className="text-2xl font-semibold text-slate-900">Mis vehículos</h1>
        <p className="mt-3 text-sm text-slate-600">
          Cambia al rol de conductor para registrar tu vehículo y compartir viajes.
        </p>
      </section>
    );
  }

  return (
    <section className="py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Mis vehículos</h1>
        <p className="mt-2 text-sm text-slate-600">
          Administra la flota con la que ofreces viajes y elige cuál quedará activo para nuevas publicaciones.
        </p>
        {vehicles.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Documentos vigentes: {validVehicles.length}/{vehicles.length}. Solo los vehículos verificados y con documentos al día podrán activarse.
          </p>
        )}
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : (
        <>
          {vehicles.length === 0 && mode === "list" ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-600">
              <p>Registra tu primer vehículo para cambiar al modo conductor y publicar viajes.</p>
              <button
                type="button"
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={openCreate}
                disabled={submitting}
              >
                Agregar vehículo
              </button>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {vehicles.map((vehicle) => {
                const vehicleId = String(vehicle._id);
                const isActive = vehicleId === activeVehicleId;
                const meta = vehicle.meta || {};
                const statusClass = `border ${severityStyles[meta.statusSeverity] || severityStyles.default}`;
                const statusLabel = meta.statusLabel || "Verificación en curso";
                const canActivate = Boolean(meta.canActivate);
                const warnings = Array.isArray(meta.warnings) ? meta.warnings : [];
                const soatExpires = meta.documents?.soat?.expiresOn || vehicle.soatExpiration;
                const licenseExpires = meta.documents?.license?.expiresOn || vehicle.licenseExpiration;
                const modelValue = vehicle.model || "";
                const modelAsYear = /^\d{4}$/.test(modelValue.trim());
                const vehicleTitle = (modelAsYear ? `${vehicle.brand}` : `${vehicle.brand} ${modelValue}`).trim();
                const displayTitle = vehicleTitle || vehicle.brand || "Vehículo sin nombre";
                const capacityLabel = `${vehicle.capacity} pasajero${vehicle.capacity === 1 ? "" : "s"}`;
                const activationDisabled = isActive || activatingId === vehicleId || submitting || !canActivate;
                const activateLabel = isActive
                  ? "Vehículo activo"
                  : !canActivate
                  ? "Pendiente de verificación"
                  : activatingId === vehicleId
                  ? "Activando..."
                  : "Activar";

                return (
                  <article key={vehicle._id} className={`relative flex h-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm ${isActive ? "ring-2 ring-emerald-300" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">{displayTitle}</h2>
                        <p className="text-sm text-slate-600">Placa {vehicle.plate}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 text-xs font-medium">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${
                            isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {isActive ? "Activo" : "Inactivo"}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium ${statusClass}`}>
                          {statusLabel}
                        </span>
                        {!isActive && canActivate && (
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                            onClick={() => handleActivate(vehicleId)}
                            disabled={activationDisabled}
                          >
                            {activateLabel}
                          </button>
                        )}
                        {!isActive && !canActivate && (
                          <span className="text-[11px] font-normal text-slate-500">{activateLabel}</span>
                        )}
                      </div>
                    </div>

                    <dl className="grid grid-cols-2 gap-3 text-xs text-slate-600">
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-slate-400">{modelAsYear ? "Año" : "Modelo"}</dt>
                        <dd className="mt-1 text-sm text-slate-800">{modelValue || "Sin dato"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-slate-400">Capacidad</dt>
                        <dd className="mt-1 text-sm text-slate-800">{capacityLabel}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-slate-400">SOAT</dt>
                        <dd className="mt-1 text-sm text-slate-800">{soatExpires ? formatDateInput(soatExpires) : "Sin fecha"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-slate-400">Licencia</dt>
                        <dd className="mt-1 text-sm text-slate-800">{licenseExpires ? formatDateInput(licenseExpires) : "Sin fecha"}</dd>
                      </div>
                    </dl>

                    {warnings.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                        <p className="font-semibold">Alertas</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4">
                          {warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-auto flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                        onClick={() => openEdit({ ...vehicle, _id: vehicleId })}
                        disabled={submitting}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                        onClick={() => handleDelete(vehicleId)}
                        disabled={submitting}
                      >
                        Eliminar
                      </button>
                    </div>

                    {(vehicle.vehiclePhotoUrl || vehicle.soatPhotoUrl) && (
                      <div className="mt-3 grid gap-2 text-xs text-blue-600">
                        {vehicle.vehiclePhotoUrl && (
                          <a href={vehicle.vehiclePhotoUrl} target="_blank" rel="noreferrer" className="hover:underline">
                            Ver foto del vehículo
                          </a>
                        )}
                        {vehicle.soatPhotoUrl && (
                          <a href={vehicle.soatPhotoUrl} target="_blank" rel="noreferrer" className="hover:underline">
                            Ver SOAT
                          </a>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}

              <button
                type="button"
                onClick={openCreate}
                className="flex h-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/40 px-6 py-8 text-center text-sm font-medium text-blue-600 hover:border-blue-300 hover:text-blue-500"
                disabled={submitting}
              >
                <span className="text-3xl leading-none">+</span>
                <span className="mt-2">Agregar nuevo vehículo</span>
                <span className="mt-1 text-xs text-blue-500/70">Registra otra opción para tus viajes</span>
              </button>
            </div>
          )}
        </>
      )}

      {(mode === "create" || mode === "edit") && (
        <div className="mt-8 rounded-xl border border-white/60 bg-white/80 p-6 shadow-lg">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            {mode === "create" ? "Registrar nuevo vehículo" : "Editar vehículo"}
          </h2>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-600">
                Placa *
                <input
                  type="text"
                  value={form.plate}
                  onChange={(event) => setForm((prev) => ({ ...prev, plate: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm uppercase"
                  disabled={submitting}
                />
              </label>
              <label className="text-sm text-slate-600">
                Capacidad (puestos) *
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={form.capacity}
                  onChange={(event) => setForm((prev) => ({ ...prev, capacity: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  disabled={submitting}
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-600">
                Marca *
                <input
                  type="text"
                  value={form.brand}
                  onChange={(event) => setForm((prev) => ({ ...prev, brand: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  disabled={submitting}
                />
              </label>
              <label className="text-sm text-slate-600">
                Modelo *
                <input
                  type="text"
                  value={form.model}
                  onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  disabled={submitting}
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-600">
                SOAT vence *
                <input
                  type="date"
                  value={form.soatExpiration}
                  onChange={(event) => setForm((prev) => ({ ...prev, soatExpiration: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  disabled={submitting}
                />
              </label>
              <label className="text-sm text-slate-600">
                Licencia vence *
                <input
                  type="date"
                  value={form.licenseExpiration}
                  onChange={(event) => setForm((prev) => ({ ...prev, licenseExpiration: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  disabled={submitting}
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-600">
                Número de licencia *
                <input
                  type="text"
                  value={form.licenseNumber}
                  onChange={(event) => setForm((prev) => ({ ...prev, licenseNumber: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  disabled={submitting}
                />
              </label>
              <label className="text-sm text-slate-600">
                URL foto del vehículo
                <input
                  type="url"
                  value={form.vehiclePhotoUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, vehiclePhotoUrl: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  placeholder="https://"
                  disabled={submitting}
                />
              </label>
            </div>

            <label className="text-sm text-slate-600">
              URL SOAT
              <input
                type="url"
                value={form.soatPhotoUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, soatPhotoUrl: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder="https://"
                disabled={submitting}
              />
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                onClick={() => resetToList()}
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
                disabled={submitting}
              >
                {submitting ? "Guardando..." : mode === "create" ? "Registrar" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
