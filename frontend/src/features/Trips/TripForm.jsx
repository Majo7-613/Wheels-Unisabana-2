import { useEffect, useMemo, useState } from "react";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext.jsx";
import useVehiclesOverview from "../Vehicles/hooks/useVehiclesOverview.js";

const emptyForm = {
  vehicleId: "",
  origin: "",
  destination: "",
  routeDescription: "",
  departureAt: "",
  seatsTotal: "",
  pricePerSeat: "",
  distanceKm: "",
  durationMinutes: ""
};

export default function TripForm() {
  const { user } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [pickupPoints, setPickupPoints] = useState([]);
  const [pickupDraft, setPickupDraft] = useState({ name: "", description: "", lat: "", lng: "" });
  const [submitting, setSubmitting] = useState(false);
  const [calculatingDistance, setCalculatingDistance] = useState(false);
  const [tariffSuggestion, setTariffSuggestion] = useState(null);
  const [suggestingTariff, setSuggestingTariff] = useState(false);
  const [distanceFeedback, setDistanceFeedback] = useState("");
  const [tariffFeedback, setTariffFeedback] = useState("");
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

  const isVehicleDocsValid = (vehicle) => {
    if (!vehicle) return false;
    if (vehicle.meta?.documentsOk !== undefined) {
      return Boolean(vehicle.meta.documentsOk);
    }
    const soatExpiration = vehicle.meta?.documents?.soat?.expiresOn || vehicle.soatExpiration;
    const licenseExpiration = vehicle.meta?.documents?.license?.expiresOn || vehicle.licenseExpiration;
    if (!soatExpiration || !licenseExpiration) return false;
    const now = Date.now();
    const soat = new Date(soatExpiration).getTime();
    const license = new Date(licenseExpiration).getTime();
    if (Number.isNaN(soat) || Number.isNaN(license)) return false;
    return soat >= now && license >= now;
  };

  useEffect(() => {
    if (!form.vehicleId) {
      setPickupPoints([]);
      return;
    }
    const selected = vehicles.find((vehicle) => vehicle._id === form.vehicleId);
    if (selected?.pickupPoints?.length) {
      setPickupPoints(selected.pickupPoints.map((point) => ({ ...point })));
    } else {
      setPickupPoints([]);
    }
  }, [form.vehicleId, vehicles]);

  useEffect(() => {
    if (loadingVehicles) return;
    if (!vehicles.length) return;

    const alreadySelected = vehicles.find((vehicle) => vehicle._id === form.vehicleId && isVehicleDocsValid(vehicle));
    if (alreadySelected) return;

    const active = vehicles.find((vehicle) => vehicle._id === activeVehicleId && isVehicleDocsValid(vehicle));
    if (active) {
      setForm((prev) => ({ ...prev, vehicleId: active._id }));
      return;
    }

    const firstValid = vehicles.find((vehicle) => isVehicleDocsValid(vehicle));
    if (firstValid) {
      setForm((prev) => ({ ...prev, vehicleId: firstValid._id }));
    } else {
      setForm((prev) => ({ ...prev, vehicleId: "" }));
    }
  }, [loadingVehicles, vehicles, activeVehicleId, form.vehicleId]);

  if (!isDriver) {
    return (
      <section className="py-6">
        <h1 className="text-2xl font-semibold text-slate-900">Crear viaje</h1>
        <p className="mt-3 text-sm text-slate-600">
          Cambia al rol de conductor desde tu perfil y registra un vehículo para publicar viajes.
        </p>
      </section>
    );
  }

  const validVehicles = useMemo(() => vehicles.filter((vehicle) => isVehicleDocsValid(vehicle)), [vehicles]);
  const hasVehicle = vehicles.length > 0;
  const hasValidVehicle = validVehicles.length > 0;

  const formatCurrency = useMemo(
    () =>
      new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0
      }),
    []
  );

  useEffect(() => {
    setTariffSuggestion(null);
    setTariffFeedback("");
  }, [form.distanceKm, form.durationMinutes]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setTariffFeedback("");

    if (!form.vehicleId) {
      setError("Selecciona un vehículo");
      return;
    }

    const selectedVehicle = vehicles.find((vehicle) => vehicle._id === form.vehicleId);
    if (!selectedVehicle) {
      setError("Vehículo no válido");
      return;
    }

    if (!isVehicleDocsValid(selectedVehicle)) {
      setError("Actualiza los documentos del vehículo seleccionado");
      return;
    }

    if (!form.origin || !form.destination || !form.departureAt || !form.seatsTotal || !form.pricePerSeat) {
      setError("Completa los campos obligatorios marcados con *");
      return;
    }

    const departureDate = new Date(form.departureAt);
    if (Number.isNaN(departureDate.getTime())) {
      setError("Fecha de salida inválida");
      return;
    }

    const seatsTotal = Number(form.seatsTotal);
    if (!Number.isInteger(seatsTotal) || seatsTotal < 1) {
      setError("Número de puestos inválido");
      return;
    }

    if (seatsTotal > selectedVehicle.capacity) {
      setError(`El vehículo seleccionado solo admite ${selectedVehicle.capacity} puestos`);
      return;
    }

    const pricePerSeat = Number(form.pricePerSeat);
    if (Number.isNaN(pricePerSeat) || pricePerSeat < 0) {
      setError("El precio debe ser un número mayor o igual a 0");
      return;
    }

    const distanceKm = form.distanceKm ? Number(form.distanceKm) : undefined;
    if (distanceKm != null && (Number.isNaN(distanceKm) || distanceKm < 0)) {
      setError("La distancia debe ser un número positivo");
      return;
    }

    const durationMinutes = form.durationMinutes ? Number(form.durationMinutes) : undefined;
    if (durationMinutes != null && (Number.isNaN(durationMinutes) || durationMinutes < 0)) {
      setError("La duración debe ser un número positivo");
      return;
    }

    if (
      tariffSuggestion &&
      pricePerSeat >= 0 &&
      (pricePerSeat < tariffSuggestion.range.min || pricePerSeat > tariffSuggestion.range.max)
    ) {
      setError(
        `El precio debe estar entre ${tariffSuggestion.range.min} y ${tariffSuggestion.range.max} según la sugerencia`
      );
      return;
    }

    const payload = {
      vehicleId: form.vehicleId,
      origin: form.origin,
      destination: form.destination,
      routeDescription: form.routeDescription || undefined,
      departureAt: departureDate.toISOString(),
      seatsTotal,
      pricePerSeat,
      distanceKm,
      durationMinutes,
      pickupPoints: pickupPoints.map((point) => ({
        name: point.name,
        description: point.description,
        lat: Number(point.lat),
        lng: Number(point.lng)
      }))
    };

    const invalidPickup = payload.pickupPoints.find(
      (point) => !point.name || Number.isNaN(point.lat) || Number.isNaN(point.lng)
    );
    if (invalidPickup) {
      setError("Verifica los puntos de recogida: se requieren nombre y coordenadas numéricas");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/trips", payload);
      setSuccess("Viaje creado correctamente");
      setForm({ ...emptyForm });
      setPickupPoints([]);
      setPickupDraft({ name: "", description: "", lat: "", lng: "" });
      setDistanceFeedback("");
      setTariffSuggestion(null);
      setTariffFeedback("");
    } catch (err) {
      const message = err?.response?.data?.error || "No se pudo crear el viaje";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function toDistancePoint(value, label) {
    if (!value) throw new Error(`Ingresa coordenadas de ${label}`);
    const trimmed = value.trim();
    if (!trimmed) throw new Error(`Ingresa coordenadas de ${label}`);
    const parts = trimmed.split(",");
    if (parts.length !== 2) {
      throw new Error(`Usa formato lat,lng para ${label}`);
    }
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(`Coordenadas inválidas para ${label}`);
    }
    return { lat, lng };
  }

  async function handleDistanceFetch() {
    setError("");
    setSuccess("");
    setDistanceFeedback("");
    setTariffSuggestion(null);
    setTariffFeedback("");

    if (!form.origin.trim() || !form.destination.trim()) {
      setError("Ingresa origen y destino antes de calcular la distancia");
      return;
    }

    let parsedOrigin;
    let parsedDestination;

    try {
      parsedOrigin = toDistancePoint(form.origin, "origen");
      parsedDestination = toDistancePoint(form.destination, "destino");
    } catch (coordinateError) {
      setCalculatingDistance(false);
      setError(coordinateError.message);
      return;
    }

    const payload = {
      origin: parsedOrigin,
      destination: parsedDestination,
      mode: "driving"
    };

    setCalculatingDistance(true);
    try {
      const { data } = await api.post("/maps/calculate", payload);
      setForm((prev) => ({
        ...prev,
        distanceKm: data?.distanceKm != null ? String(data.distanceKm) : prev.distanceKm,
        durationMinutes: data?.durationMinutes != null ? String(data.durationMinutes) : prev.durationMinutes
      }));
      setDistanceFeedback("Distancia estimada actualizada desde OpenRouteService");
    } catch (err) {
      const message =
        err?.response?.data?.error ||
        "No pudimos calcular la distancia automáticamente. Ingresa los datos manualmente.";
      setError(message);
    } finally {
      setCalculatingDistance(false);
    }
  }

  async function handleTariffSuggestion() {
    setError("");
    setSuccess("");
    setTariffFeedback("");

    const distanceNumber = Number(form.distanceKm);
    const durationNumber = Number(form.durationMinutes);
    if (!Number.isFinite(distanceNumber) || distanceNumber < 0 || !Number.isFinite(durationNumber) || durationNumber < 0) {
      setError("Verifica distancia y duración antes de solicitar la sugerencia");
      return;
    }

    setSuggestingTariff(true);
    try {
      const { data } = await api.post("/trips/tariff/suggest", {
        distanceKm: distanceNumber,
        durationMinutes: durationNumber
      });
      setTariffSuggestion(data);
      setTariffFeedback("Tarifa sugerida actualizada para este viaje");
    } catch (err) {
      const message = err?.response?.data?.error || "No pudimos sugerir la tarifa. Intenta más tarde.";
      setError(message);
    } finally {
      setSuggestingTariff(false);
    }
  }

  function applySuggestedTariff() {
    if (!tariffSuggestion) return;
    setForm((prev) => ({ ...prev, pricePerSeat: String(tariffSuggestion.suggestedTariff) }));
    setTariffFeedback("Aplicamos la tarifa sugerida. Puedes ajustar dentro del rango permitido.");
  }

  function addPickupPoint() {
    if (!pickupDraft.name || !pickupDraft.lat || !pickupDraft.lng) {
      setError("Completa nombre y coordenadas para agregar un punto");
      return;
    }
    setPickupPoints((prev) => [
      ...prev,
      {
        name: pickupDraft.name,
        description: pickupDraft.description,
        lat: Number(pickupDraft.lat),
        lng: Number(pickupDraft.lng)
      }
    ]);
    setPickupDraft({ name: "", description: "", lat: "", lng: "" });
    setError("");
  }

  function removePickup(index) {
    setPickupPoints((prev) => prev.filter((_, idx) => idx !== index));
  }

  return (
    <section className="py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Publicar nuevo viaje</h1>
        <p className="text-sm text-slate-600">
          Comparte tu ruta con otros sabaneros. Completa la información obligatoria y publica el viaje.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      )}
      {vehiclesError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>{vehiclesError}</span>
          <button
            type="button"
            className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            onClick={refreshVehicles}
          >
            Reintentar
          </button>
        </div>
      )}
      {distanceFeedback && (
        <div className="mb-4 max-w-2xl rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {distanceFeedback}
        </div>
      )}
      {tariffFeedback && (
        <div className="mb-4 max-w-2xl rounded-md border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
          {tariffFeedback}
        </div>
      )}

      {loadingVehicles ? (
        <p className="text-sm text-slate-500">Cargando vehículos...</p>
      ) : !hasVehicle ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Registra un vehículo primero para ofrecer viajes.
        </div>
      ) : !hasValidVehicle ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Todos tus vehículos tienen documentos vencidos. Actualiza el SOAT y la licencia para publicar viajes.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              Vehículo *
              <select
                value={form.vehicleId}
                onChange={(event) => setForm((prev) => ({ ...prev, vehicleId: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Selecciona el vehículo</option>
                {vehicles.map((vehicle) => {
                  const docsOk = isVehicleDocsValid(vehicle);
                  return (
                    <option key={vehicle._id} value={vehicle._id} disabled={!docsOk}>
                      {vehicle.brand} {vehicle.model} · Placa {vehicle.plate}
                      {!docsOk ? " (documentos vencidos)" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Fecha y hora de salida *
              <input
                type="datetime-local"
                value={form.departureAt}
                onChange={(event) => setForm((prev) => ({ ...prev, departureAt: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              Origen *
              <input
                type="text"
                value={form.origin}
                onChange={(event) => setForm((prev) => ({ ...prev, origin: event.target.value }))}
                placeholder="Coordenadas lat,lng (ej: 4.65,-74.05)"
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Destino *
              <input
                type="text"
                value={form.destination}
                onChange={(event) => setForm((prev) => ({ ...prev, destination: event.target.value }))}
                placeholder="Coordenadas lat,lng (ej: 4.86,-74.03)"
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="text-sm text-slate-600">
            Descripción de la ruta
            <textarea
              value={form.routeDescription}
              onChange={(event) => setForm((prev) => ({ ...prev, routeDescription: event.target.value }))}
              rows={3}
              placeholder="Describe paradas principales o referencias importantes"
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm text-slate-600">
              Puestos totales *
              <input
                type="number"
                min={1}
                value={form.seatsTotal}
                onChange={(event) => setForm((prev) => ({ ...prev, seatsTotal: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Precio por puesto *
              <input
                type="number"
                min={0}
                value={form.pricePerSeat}
                onChange={(event) => setForm((prev) => ({ ...prev, pricePerSeat: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Distancia estimada (km)
              <input
                type="number"
                min={0}
                value={form.distanceKm}
                onChange={(event) => setForm((prev) => ({ ...prev, distanceKm: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-600">
              Duración estimada (min)
              <input
                type="number"
                min={0}
                value={form.durationMinutes}
                onChange={(event) => setForm((prev) => ({ ...prev, durationMinutes: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-md border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
              onClick={handleDistanceFetch}
              disabled={calculatingDistance}
            >
              {calculatingDistance ? "Calculando distancia..." : "Calcular distancia (OpenRouteService)"}
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
              onClick={handleTariffSuggestion}
              disabled={suggestingTariff}
            >
              {suggestingTariff ? "Calculando tarifa..." : "Obtener tarifa sugerida"}
            </button>
            {tariffSuggestion && (
              <span className="text-xs text-slate-500">
                Rango permitido: {formatCurrency.format(tariffSuggestion.range.min)} - {formatCurrency.format(tariffSuggestion.range.max)}
              </span>
            )}
          </div>

          {tariffSuggestion && (
            <div className="rounded-md border border-slate-200 bg-white/70 p-4 text-sm text-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">
                    Tarifa sugerida: {formatCurrency.format(tariffSuggestion.suggestedTariff)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Tarifa base {formatCurrency.format(tariffSuggestion.breakdown.baseBoarding)} · Distancia {formatCurrency.format(tariffSuggestion.breakdown.distanceComponent)} · Tiempo {formatCurrency.format(tariffSuggestion.breakdown.durationComponent)}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
                  onClick={applySuggestedTariff}
                >
                  Aplicar tarifa sugerida
                </button>
              </div>
            </div>
          )}

          <section className="rounded-lg border border-slate-200 bg-white/70 p-4">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Puntos de recogida</h2>
              <p className="text-xs text-slate-500">Opcional, puedes reutilizar los del vehículo o agregar nuevos.</p>
            </header>

            {pickupPoints.length > 0 ? (
              <ul className="mb-4 space-y-2 text-sm text-slate-600">
                {pickupPoints.map((point, index) => (
                  <li
                    key={`${point.name}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
                  >
                    <div>
                      <p className="font-medium">{point.name}</p>
                      {point.description && <p className="text-xs text-slate-500">{point.description}</p>}
                      <p className="text-xs text-slate-500">
                        ({point.lat}, {point.lng})
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => removePickup(index)}
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-slate-500">Agrega al menos un punto de referencia para tus pasajeros.</p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs uppercase tracking-wide text-slate-500">
                Nombre
                <input
                  type="text"
                  value={pickupDraft.name}
                  onChange={(event) => setPickupDraft((prev) => ({ ...prev, name: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Parque principal Chía"
                />
              </label>
              <label className="text-xs uppercase tracking-wide text-slate-500">
                Descripción
                <input
                  type="text"
                  value={pickupDraft.description}
                  onChange={(event) => setPickupDraft((prev) => ({ ...prev, description: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Junto a la tienda"
                />
              </label>
              <label className="text-xs uppercase tracking-wide text-slate-500">
                Latitud
                <input
                  type="number"
                  value={pickupDraft.lat}
                  onChange={(event) => setPickupDraft((prev) => ({ ...prev, lat: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  placeholder="4.8619"
                  step="any"
                />
              </label>
              <label className="text-xs uppercase tracking-wide text-slate-500">
                Longitud
                <input
                  type="number"
                  value={pickupDraft.lng}
                  onChange={(event) => setPickupDraft((prev) => ({ ...prev, lng: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  placeholder="-74.032"
                  step="any"
                />
              </label>
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="button"
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  onClick={addPickupPoint}
                >
                  Agregar punto
                </button>
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
              disabled={submitting}
            >
              {submitting ? "Publicando..." : "Publicar viaje"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
