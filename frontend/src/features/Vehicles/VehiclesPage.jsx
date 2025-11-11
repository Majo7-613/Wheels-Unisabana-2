import { useEffect, useMemo, useState } from "react";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext.jsx";

const ACCEPTED_DOCUMENT_TYPES = ".pdf,.jpeg,.jpg,.png,.webp,.heic,.heif";
const PLATE_REGEX = /^(?:[A-Z]{3}[0-9]{3}|[A-Z]{3}[0-9]{2}[A-Z])$/;
const initialForm = {
  plate: "",
  brand: "",
  model: "",
  year: "",
  color: "",
  capacity: "",
  soatExpiration: "",
  licenseNumber: "",
  licenseExpiration: "",
  vehiclePhotoFile: null,
  soatDocumentFile: null,
  licenseDocumentFile: null,
  vehiclePhotoUrl: "",
  soatPhotoUrl: "",
  licensePhotoUrl: ""
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
  const now = new Date();
  return date >= now;
}

function resolveAssetUrl(pathValue) {
  if (!pathValue) return "";
  if (/^https?:\/\//i.test(pathValue)) return pathValue;
  const base = api.defaults?.baseURL || "";
  const baseTrimmed = base.replace(/\/$/, "");
  const path = pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
  return `${baseTrimmed}${path}`;
}

export default function VehiclesPage() {
  const { user, refreshProfile } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("list");
  const [formMode, setFormMode] = useState("create");
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(initialForm);
  const [formErrors, setFormErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successBanner, setSuccessBanner] = useState("");
  const [successVehicle, setSuccessVehicle] = useState(null);
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
    setMode("form");
    setFormMode("create");
    setSelectedId("");
    setForm(initialForm);
    setFormErrors({});
    setTouched({});
    setError("");
    setSuccessBanner("");
    setSuccessVehicle(null);
  }

  function openEdit(vehicle) {
    setMode("form");
    setFormMode("edit");
    setSelectedId(vehicle._id);
    setForm({
      plate: vehicle.plate || "",
      brand: vehicle.brand || "",
      model: vehicle.model || "",
      year: vehicle.year ? String(vehicle.year) : "",
      color: vehicle.color || "",
      capacity: String(vehicle.capacity ?? ""),
      soatExpiration: formatDateInput(vehicle.soatExpiration),
      licenseNumber: vehicle.licenseNumber || "",
      licenseExpiration: formatDateInput(vehicle.licenseExpiration),
      vehiclePhotoFile: null,
      soatDocumentFile: null,
      licenseDocumentFile: null,
      vehiclePhotoUrl: vehicle.vehiclePhotoUrl || "",
      soatPhotoUrl: vehicle.soatPhotoUrl || "",
      licensePhotoUrl: vehicle.licensePhotoUrl || ""
    });
    setFormErrors({});
    setTouched({});
    setError("");
    setSuccessBanner("");
    setSuccessVehicle(null);
  }

  function resetToList(message = "") {
    setMode("list");
    setFormMode("create");
    setSelectedId("");
    setForm(initialForm);
    setFormErrors({});
    setTouched({});
    setSubmitting(false);
    setError("");
    setSuccessVehicle(null);
    if (message) setSuccessBanner(message);
  }

  function markTouched(field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function updateField(field, value) {
    const nextValue =
      field === "plate" && typeof value === "string"
        ? value.toUpperCase().replace(/\s+/g, "")
        : value;
    setForm((prev) => ({ ...prev, [field]: nextValue }));
    setFormErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSelectFile(field, file) {
    setForm((prev) => ({ ...prev, [field]: file }));
    setFormErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validateForm() {
    const errors = {};
    if (!form.plate.trim()) errors.plate = "Ingresa la placa";
    if (form.plate.trim() && !PLATE_REGEX.test(form.plate.trim().toUpperCase())) {
      errors.plate = "Formato inválido. Usa valores como ABC123 o ABC12D";
    }
    if (!form.brand.trim()) errors.brand = "Ingresa la marca";
    if (!form.model.trim()) errors.model = "Ingresa el modelo";
    if (!form.capacity) errors.capacity = "Ingresa la capacidad";
    const capacityNumber = Number(form.capacity);
    if (form.capacity && (!Number.isInteger(capacityNumber) || capacityNumber < 1 || capacityNumber > 8)) {
      errors.capacity = "Capacidad entre 1 y 8";
    }
    if (!form.soatExpiration) errors.soatExpiration = "Selecciona la fecha";
    if (form.soatExpiration) {
      const soatDate = new Date(form.soatExpiration);
      const now = new Date();
      if (Number.isNaN(soatDate.getTime())) errors.soatExpiration = "Fecha inválida";
      else if (soatDate < now) errors.soatExpiration = "SOAT vencido";
    }
    if (!form.licenseNumber.trim()) errors.licenseNumber = "Ingresa la licencia";
    if (!form.licenseExpiration) errors.licenseExpiration = "Selecciona la fecha";
    if (form.licenseExpiration) {
      const licenseDate = new Date(form.licenseExpiration);
      const now = new Date();
      if (Number.isNaN(licenseDate.getTime())) errors.licenseExpiration = "Fecha inválida";
      else if (licenseDate < now) errors.licenseExpiration = "Licencia vencida";
    }
    if (form.year) {
      const yearNumber = Number(form.year);
      const upper = new Date().getFullYear() + 1;
      if (!Number.isFinite(yearNumber) || yearNumber < 1980 || yearNumber > upper) {
        errors.year = "Año inválido";
      }
    }
    if (formMode === "create") {
      if (!form.soatDocumentFile) errors.soatDocumentFile = "Adjunta el documento del SOAT";
      if (!form.licenseDocumentFile) errors.licenseDocumentFile = "Adjunta el documento de la licencia";
    } else {
      if (!form.soatDocumentFile && !form.soatPhotoUrl) errors.soatDocumentFile = "Adjunta o conserva el SOAT";
      if (!form.licenseDocumentFile && !form.licensePhotoUrl) errors.licenseDocumentFile = "Adjunta o conserva la licencia";
    }
    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccessBanner("");
    const errors = validateForm();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setTouched((prev) => ({ ...prev, submitted: true }));
      setError("Por favor completa los campos obligatorios");
      return;
    }

    const payload = new FormData();
    payload.append("plate", form.plate.trim().toUpperCase());
    payload.append("brand", form.brand.trim());
    payload.append("model", form.model.trim());
    payload.append("capacity", String(Number(form.capacity)));
    payload.append("soatExpiration", form.soatExpiration);
    payload.append("licenseNumber", form.licenseNumber.trim());
    payload.append("licenseExpiration", form.licenseExpiration);
    if (form.year) payload.append("year", form.year.trim());
    if (form.color) payload.append("color", form.color.trim());
    if (form.vehiclePhotoFile) payload.append("vehiclePhoto", form.vehiclePhotoFile);
    else if (form.vehiclePhotoUrl) payload.append("vehiclePhotoUrl", form.vehiclePhotoUrl);
    if (form.soatDocumentFile) payload.append("soatDocument", form.soatDocumentFile);
    else if (form.soatPhotoUrl) payload.append("soatPhotoUrl", form.soatPhotoUrl);
    if (form.licenseDocumentFile) payload.append("licenseDocument", form.licenseDocumentFile);
    else if (form.licensePhotoUrl) payload.append("licensePhotoUrl", form.licensePhotoUrl);

    setSubmitting(true);
    try {
      if (formMode === "edit" && selectedId) {
        await api.put(`/vehicles/${selectedId}`, payload, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        await fetchVehicles();
        await refreshProfile();
        resetToList("Vehículo actualizado correctamente");
      } else {
        const { data } = await api.post("/vehicles", payload, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        await fetchVehicles();
        await refreshProfile();
        setSuccessVehicle(data || null);
        setMode("success");
        setSubmitting(false);
      }
    } catch (err) {
      console.error("vehicle submit", err);
      const message = err?.response?.data?.error || "No se pudo guardar el vehículo";
      setError(message);
      setSubmitting(false);
    }
  }

  async function handleDelete(vehicleId) {
    if (!window.confirm("¿Eliminar este vehículo? Esta acción no se puede deshacer.")) return;
    setSubmitting(true);
    setError("");
    setSuccessBanner("");
    try {
      await api.delete(`/vehicles/${vehicleId}`);
      await fetchVehicles();
      await refreshProfile();
      resetToList("Vehículo eliminado");
    } catch (err) {
      const message = err?.response?.data?.error || "No se pudo eliminar el vehículo";
      setError(message);
      setSubmitting(false);
    }
  }

  async function handleActivate(vehicleId) {
    if (!vehicleId || vehicleId === activeVehicleId) return;
    setActivatingId(vehicleId);
    setError("");
    setSuccessBanner("");
    try {
      await api.put(`/vehicles/${vehicleId}/activate`, {});
      await refreshProfile();
      setSuccessBanner("Vehículo activado para futuros viajes");
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

  function DocumentUploadField({ name, label, required, helper, file, existingUrl, error: fieldError, onSelect }) {
    const inputId = `${name}-file-input`;
    return (
      <div className={`rounded-2xl border p-4 ${fieldError ? "border-red-300 bg-red-50/60" : "border-slate-200 bg-slate-50"}`}>
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {label}
              {required ? <span className="text-red-500"> *</span> : null}
            </p>
            {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
          </div>
          <label
            htmlFor={inputId}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500 hover:border-slate-400"
          >
            <span className="font-semibold text-slate-700">Seleccionar archivo</span>
            <span className="mt-2 text-xs text-slate-400">PDF o imagen (máx. 5 MB)</span>
            {(file || existingUrl) && (
              <span className="mt-3 inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
                {file ? file.name : "Archivo cargado"}
              </span>
            )}
          </label>
          <input
            id={inputId}
            type="file"
            accept={ACCEPTED_DOCUMENT_TYPES}
            className="hidden"
            onChange={(event) => {
              const newFile = event.target.files?.[0] || null;
              onSelect(newFile);
              event.target.value = "";
            }}
          />
          {existingUrl && !file ? (
            <a href={existingUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
              Ver archivo actual
            </a>
          ) : null}
          {file ? (
            <button
              type="button"
              className="self-start text-xs text-slate-500 underline hover:text-slate-700"
              onClick={() => onSelect(null)}
            >
              Quitar archivo
            </button>
          ) : null}
          {fieldError ? <p className="text-xs text-red-600">{fieldError}</p> : null}
        </div>
      </div>
    );
  }

  if (mode === "success") {
    const plate = successVehicle?.plate || "";
    return (
      <section className="flex min-h-[60vh] items-center justify-center py-10">
        <div className="w-full max-w-md rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">✓</div>
          <h1 className="text-2xl font-semibold text-slate-900">¡Vehículo registrado!</h1>
          <p className="mt-2 text-sm text-slate-600">Tu vehículo quedó registrado exitosamente y pronto podremos revisarlo.</p>
          {plate && <p className="mt-4 text-sm font-semibold text-slate-800">Placa {plate}</p>}
          <button
            type="button"
            className="mt-6 w-full rounded-full bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600"
            onClick={() => resetToList()}
          >
            Ver mis vehículos
          </button>
        </div>
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

      {!isDriver && vehicles.length === 0 && mode === "list" ? (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Para activar el rol de conductor primero registra un vehículo. Una vez aprobado podrás cambiar de pasajero a conductor desde tu perfil.
        </div>
      ) : null}

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {successBanner && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successBanner}</div>
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
          ) : null}

          {vehicles.length > 0 && mode === "list" ? (
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
                  <article
                    key={vehicle._id}
                    className={`relative flex h-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm ${isActive ? "ring-2 ring-emerald-300" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">{displayTitle}</h2>
                        <p className="text-sm text-slate-600">Placa {vehicle.plate}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 text-xs font-medium">
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                          {isActive ? "Activo" : "Inactivo"}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium ${statusClass}`}>
                          {statusLabel}
                        </span>
                        {!isActive && canActivate ? (
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                            onClick={() => handleActivate(vehicleId)}
                            disabled={activationDisabled}
                          >
                            {activateLabel}
                          </button>
                        ) : null}
                        {!isActive && !canActivate ? (
                          <span className="text-[11px] font-normal text-slate-500">{activateLabel}</span>
                        ) : null}
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
                      {vehicle.color ? (
                        <div>
                          <dt className="font-semibold uppercase tracking-wide text-slate-400">Color</dt>
                          <dd className="mt-1 text-sm text-slate-800">{vehicle.color}</dd>
                        </div>
                      ) : null}
                      {vehicle.year ? (
                        <div>
                          <dt className="font-semibold uppercase tracking-wide text-slate-400">Año</dt>
                          <dd className="mt-1 text-sm text-slate-800">{vehicle.year}</dd>
                        </div>
                      ) : null}
                    </dl>

                    {warnings.length > 0 ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                        <p className="font-semibold">Alertas</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4">
                          {warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

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

                    {(vehicle.vehiclePhotoUrl || vehicle.soatPhotoUrl || vehicle.licensePhotoUrl) && (
                      <div className="mt-3 grid gap-2 text-xs text-blue-600">
                        {vehicle.vehiclePhotoUrl && (
                          <a href={resolveAssetUrl(vehicle.vehiclePhotoUrl)} target="_blank" rel="noreferrer" className="hover:underline">
                            Ver foto del vehículo
                          </a>
                        )}
                        {vehicle.soatPhotoUrl && (
                          <a href={resolveAssetUrl(vehicle.soatPhotoUrl)} target="_blank" rel="noreferrer" className="hover:underline">
                            Ver SOAT
                          </a>
                        )}
                        {vehicle.licensePhotoUrl && (
                          <a href={resolveAssetUrl(vehicle.licensePhotoUrl)} target="_blank" rel="noreferrer" className="hover:underline">
                            Ver licencia
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
          ) : null}
        </>
      )}

      {mode === "form" && (
        <div className="mt-8 rounded-[32px] border border-slate-200 bg-white p-6 shadow-xl">
          <header className="mb-6 flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
              onClick={() => resetToList()}
              disabled={submitting}
            >
              Volver
            </button>
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                {formMode === "create" ? "Registrar vehículo" : "Editar vehículo"}
              </p>
              <h2 className="text-xl font-semibold text-slate-900">
                {formMode === "create" ? "Completa la información del vehículo" : "Actualiza la información"}
              </h2>
            </div>
            <span className="text-sm font-medium text-slate-500">{submitting ? "Guardando..." : ""}</span>
          </header>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-600">
                Placa *
                <input
                  type="text"
                  value={form.plate}
                  onChange={(event) => updateField("plate", event.target.value)}
                  onBlur={() => markTouched("plate")}
                  className={`mt-1 w-full rounded-2xl border px-4 py-3 text-sm uppercase ${
                    formErrors.plate && (touched.plate || touched.submitted) ? "border-red-300 bg-red-50" : "border-slate-200"
                  }`}
                  disabled={submitting}
                />
                {formErrors.plate && (touched.plate || touched.submitted) ? (
                  <span className="mt-1 block text-xs text-red-600">{formErrors.plate}</span>
                ) : null}
              </label>
              <label className="text-sm text-slate-600">
                Capacidad (puestos) *
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={form.capacity}
                  onChange={(event) => updateField("capacity", event.target.value)}
                  onBlur={() => markTouched("capacity")}
                  className={`mt-1 w-full rounded-2xl border px-4 py-3 text-sm ${
                    formErrors.capacity && (touched.capacity || touched.submitted) ? "border-red-300 bg-red-50" : "border-slate-200"
                  }`}
                  disabled={submitting}
                />
                {formErrors.capacity && (touched.capacity || touched.submitted) ? (
                  <span className="mt-1 block text-xs text-red-600">{formErrors.capacity}</span>
                ) : null}
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-600">
                Marca *
                <input
                  type="text"
                  value={form.brand}
                  onChange={(event) => updateField("brand", event.target.value)}
                  onBlur={() => markTouched("brand")}
                  className={`mt-1 w-full rounded-2xl border px-4 py-3 text-sm ${
                    formErrors.brand && (touched.brand || touched.submitted) ? "border-red-300 bg-red-50" : "border-slate-200"
                  }`}
                  disabled={submitting}
                />
                {formErrors.brand && (touched.brand || touched.submitted) ? (
                  <span className="mt-1 block text-xs text-red-600">{formErrors.brand}</span>
                ) : null}
              </label>
              <label className="text-sm text-slate-600">
                Modelo *
                <input
                  type="text"
                  value={form.model}
                  onChange={(event) => updateField("model", event.target.value)}
                  onBlur={() => markTouched("model")}
                  className={`mt-1 w-full rounded-2xl border px-4 py-3 text-sm ${
                    formErrors.model && (touched.model || touched.submitted) ? "border-red-300 bg-red-50" : "border-slate-200"
                  }`}
                  disabled={submitting}
                />
                {formErrors.model && (touched.model || touched.submitted) ? (
                  <span className="mt-1 block text-xs text-red-600">{formErrors.model}</span>
                ) : null}
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-600">
                Año
                <input
                  type="number"
                  value={form.year}
                  onChange={(event) => updateField("year", event.target.value)}
                  onBlur={() => markTouched("year")}
                  className={`mt-1 w-full rounded-2xl border px-4 py-3 text-sm ${
                    formErrors.year && (touched.year || touched.submitted) ? "border-red-300 bg-red-50" : "border-slate-200"
                  }`}
                  disabled={submitting}
                />
                {formErrors.year && (touched.year || touched.submitted) ? (
                  <span className="mt-1 block text-xs text-red-600">{formErrors.year}</span>
                ) : null}
              </label>
              <label className="text-sm text-slate-600">
                Color
                <input
                  type="text"
                  value={form.color}
                  onChange={(event) => updateField("color", event.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
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
                  onChange={(event) => updateField("soatExpiration", event.target.value)}
                  onBlur={() => markTouched("soatExpiration")}
                  className={`mt-1 w-full rounded-2xl border px-4 py-3 text-sm ${
                    formErrors.soatExpiration && (touched.soatExpiration || touched.submitted) ? "border-red-300 bg-red-50" : "border-slate-200"
                  }`}
                  disabled={submitting}
                />
                {formErrors.soatExpiration && (touched.soatExpiration || touched.submitted) ? (
                  <span className="mt-1 block text-xs text-red-600">{formErrors.soatExpiration}</span>
                ) : null}
              </label>
              <label className="text-sm text-slate-600">
                Licencia vence *
                <input
                  type="date"
                  value={form.licenseExpiration}
                  onChange={(event) => updateField("licenseExpiration", event.target.value)}
                  onBlur={() => markTouched("licenseExpiration")}
                  className={`mt-1 w-full rounded-2xl border px-4 py-3 text-sm ${
                    formErrors.licenseExpiration && (touched.licenseExpiration || touched.submitted) ? "border-red-300 bg-red-50" : "border-slate-200"
                  }`}
                  disabled={submitting}
                />
                {formErrors.licenseExpiration && (touched.licenseExpiration || touched.submitted) ? (
                  <span className="mt-1 block text-xs text-red-600">{formErrors.licenseExpiration}</span>
                ) : null}
              </label>
            </div>

            <label className="text-sm text-slate-600">
              Número de licencia *
              <input
                type="text"
                value={form.licenseNumber}
                onChange={(event) => updateField("licenseNumber", event.target.value)}
                onBlur={() => markTouched("licenseNumber")}
                className={`mt-1 w-full rounded-2xl border px-4 py-3 text-sm ${
                  formErrors.licenseNumber && (touched.licenseNumber || touched.submitted) ? "border-red-300 bg-red-50" : "border-slate-200"
                }`}
                disabled={submitting}
              />
              {formErrors.licenseNumber && (touched.licenseNumber || touched.submitted) ? (
                <span className="mt-1 block text-xs text-red-600">{formErrors.licenseNumber}</span>
              ) : null}
            </label>

            <DocumentUploadField
              name="vehiclePhoto"
              label="Foto del vehículo"
              helper="Sube una imagen clara del vehículo"
              file={form.vehiclePhotoFile}
              existingUrl={resolveAssetUrl(form.vehiclePhotoUrl)}
              error={formErrors.vehiclePhotoFile}
              onSelect={(file) => handleSelectFile("vehiclePhotoFile", file)}
            />

            <DocumentUploadField
              name="soatDocument"
              label="SOAT (Documento)"
              required
              helper="Acepta PDF, JPG, PNG, WebP, HEIC"
              file={form.soatDocumentFile}
              existingUrl={resolveAssetUrl(form.soatPhotoUrl)}
              error={formErrors.soatDocumentFile}
              onSelect={(file) => handleSelectFile("soatDocumentFile", file)}
            />

            <DocumentUploadField
              name="licenseDocument"
              label="Licencia (Documento)"
              required
              helper="Sube el respaldo de tu licencia vigente"
              file={form.licenseDocumentFile}
              existingUrl={resolveAssetUrl(form.licensePhotoUrl)}
              error={formErrors.licenseDocumentFile}
              onSelect={(file) => handleSelectFile("licenseDocumentFile", file)}
            />

            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="rounded-2xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                onClick={() => resetToList()}
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-2xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
                disabled={submitting}
              >
                {submitting ? "Guardando..." : formMode === "create" ? "Registrar vehículo" : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
