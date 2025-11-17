import { useEffect, useMemo, useState } from "react";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext.jsx";
import useVehiclesOverview from "../Vehicles/hooks/useVehiclesOverview.js";

const hero = "/Designs/Add Pickup Points (Driver).png";
const emptyForm = { name: "", description: "", lat: "", lng: "" };

export default function AddPickupPointsDriver() {
  const { user } = useAuth();
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isDriver = useMemo(() => (user?.roles || []).includes("driver"), [user?.roles]);
  const {
    vehicles,
    activeVehicleId: overviewActiveVehicleId,
    loading: loadingVehicles,
    error: vehiclesError,
    refresh: refreshVehicles
  } = useVehiclesOverview({ enabled: isDriver });

  const userActiveVehicle = user?.activeVehicle;
  const activeVehicleId = useMemo(() => {
    if (overviewActiveVehicleId) return overviewActiveVehicleId;
    if (!userActiveVehicle) return "";
    return typeof userActiveVehicle === "string"
      ? userActiveVehicle
      : userActiveVehicle?.toString?.() || "";
  }, [overviewActiveVehicleId, userActiveVehicle]);

  useEffect(() => {
    if (!vehicles.length) {
      setSelectedVehicleId("");
      return;
    }
    if (vehicles.some((vehicle) => vehicle._id === selectedVehicleId)) {
      return;
    }
    const preferred = vehicles.find((vehicle) => vehicle._id === activeVehicleId);
    setSelectedVehicleId(preferred?._id || vehicles[0]._id);
  }, [vehicles, activeVehicleId, selectedVehicleId]);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle._id === selectedVehicleId) || null,
    [vehicles, selectedVehicleId]
  );

  if (!isDriver) {
    return (
      <section className="py-6">
        <h1 className="text-2xl font-semibold text-slate-900">Puntos de recogida</h1>
        <p className="mt-3 text-sm text-slate-600">Activa el rol de conductor y registra un vehículo para gestionar puntos.</p>
      </section>
    );
  }

  const hasVehicle = vehicles.length > 0;
  const bannerError = error || vehiclesError;

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedVehicle) {
      setError("Selecciona un vehículo");
      return;
    }

    const name = form.name.trim();
    const description = form.description.trim();
    const lat = Number(form.lat);
    const lng = Number(form.lng);

    if (!name) {
      setError("Ingresa un nombre para el punto");
      return;
    }
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError("Latitud y longitud deben ser numéricas");
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError("Coordenadas fuera de rango");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name,
        description: description ? description : undefined,
        lat,
        lng
      };

      if (editingId) {
        const { data } = await api.put(
          `/vehicles/${selectedVehicle._id}/pickup-points/${editingId}`,
          payload
        );
        const updatedPoint = data?.pickupPoint;
        if (!updatedPoint) {
          throw new Error("Respuesta inválida del servidor");
        }
        setSuccess("Punto actualizado correctamente");
      } else {
        const { data } = await api.post(`/vehicles/${selectedVehicle._id}/pickup-points`, payload);
        const created = data?.pickupPoint;
        if (!created) {
          throw new Error("Respuesta inválida del servidor");
        }
        setSuccess("Punto agregado correctamente");
      }
      await refreshVehicles();
      resetForm();
    } catch (err) {
      const message = err?.response?.data?.error || "No se pudo guardar el punto";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit(point) {
    setForm({
      name: point.name,
      description: point.description || "",
      lat: String(point.lat),
      lng: String(point.lng)
    });
    setEditingId(point._id);
    setSuccess("");
    setError("");
  }

  async function handleDelete(pointId) {
    if (!selectedVehicle) return;
    setError("");
    setSuccess("");
    setDeletingId(pointId);
    try {
      await api.delete(`/vehicles/${selectedVehicle._id}/pickup-points/${pointId}`);
      await refreshVehicles();
      if (editingId === pointId) {
        resetForm();
      }
      setSuccess("Punto eliminado correctamente");
    } catch (err) {
      const message = err?.response?.data?.error || "No se pudo eliminar el punto";
      setError(message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Gestionar puntos de recogida</h1>
        <p className="text-sm text-slate-600">Organiza puntos frecuentes para reutilizarlos al crear viajes.</p>
      </header>

      <img
        src={hero}
        alt="Diseño base"
        className="mb-6 max-w-xl rounded-lg shadow"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />

      {bannerError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{bannerError}</span>
          {vehiclesError ? (
            <button
              type="button"
              className="rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
              onClick={() => {
                setError("");
                refreshVehicles();
              }}
            >
              Reintentar
            </button>
          ) : null}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      )}

      {loadingVehicles ? (
        <p className="text-sm text-slate-500">Cargando vehículos...</p>
      ) : !hasVehicle ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Registra un vehículo para comenzar a agregar puntos de recogida.
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-[2fr_3fr]">
          <aside className="space-y-4">
            <label className="block text-sm text-slate-600">
              Vehículo
              <select
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={selectedVehicleId}
                onChange={(event) => {
                  setSelectedVehicleId(event.target.value);
                  resetForm();
                  setSuccess("");
                  setError("");
                }}
              >
                {vehicles.map((vehicle) => (
                  <option key={vehicle._id} value={vehicle._id}>
                    {vehicle.brand} {vehicle.model} · Placa {vehicle.plate}
                  </option>
                ))}
              </select>
            </label>

            <section className="rounded-lg border border-slate-200 bg-white/70 p-4">
              <header className="mb-3">
                <h2 className="text-sm font-semibold text-slate-800">Puntos guardados</h2>
                <p className="text-xs text-slate-500">Tus pasajeros los verán al reservar.</p>
              </header>

              {selectedVehicle?.pickupPoints?.length ? (
                <ul className="space-y-3 text-sm text-slate-700">
                  {selectedVehicle.pickupPoints.map((point) => (
                    <li
                      key={point._id}
                      className="rounded-md border border-slate-200 bg-white px-3 py-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900">{point.name}</p>
                          {point.description && (
                            <p className="text-xs text-slate-500">{point.description}</p>
                          )}
                          <p className="text-xs text-slate-500">
                            ({point.lat}, {point.lng})
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="text-xs font-medium text-blue-600 hover:underline"
                            onClick={() => handleEdit(point)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="text-xs font-medium text-red-600 hover:underline"
                            onClick={() => handleDelete(point._id)}
                            disabled={deletingId === point._id}
                          >
                            {deletingId === point._id ? "Eliminando..." : "Eliminar"}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Aún no tienes puntos guardados para este vehículo.</p>
              )}
            </section>
          </aside>

          <form onSubmit={handleSubmit} className="space-y-4">
            <header>
              <h2 className="text-sm font-semibold text-slate-800">
                {editingId ? "Editar punto" : "Agregar nuevo punto"}
              </h2>
              <p className="text-xs text-slate-500">Incluye coordenadas decimales (WGS84).</p>
            </header>

            <label className="block text-sm text-slate-600">
              Nombre del punto *
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Puente Madera"
              />
            </label>

            <label className="block text-sm text-slate-600">
              Descripción
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Frente a la entrada"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-600">
                Latitud *
                <input
                  type="number"
                  step="any"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={form.lat}
                  onChange={(event) => setForm((prev) => ({ ...prev, lat: event.target.value }))}
                  placeholder="4.8623"
                />
              </label>
              <label className="text-sm text-slate-600">
                Longitud *
                <input
                  type="number"
                  step="any"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={form.lng}
                  onChange={(event) => setForm((prev) => ({ ...prev, lng: event.target.value }))}
                  placeholder="-74.0509"
                />
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
                disabled={submitting}
              >
                {submitting ? "Guardando..." : editingId ? "Actualizar punto" : "Agregar punto"}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={resetForm}
                  disabled={submitting}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
