import { useEffect, useMemo, useState } from "react";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext.jsx";
import TransmilenioMap from "../../components/TransmilenioMap.jsx";

const initialFilters = {
  origin: "",
  destination: "",
  date: "",
  seats: ""
};

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0
});

function formatDriverName(driver) {
  if (!driver) return "Conductor";
  if (typeof driver === "string") return driver;
  const first = driver.firstName || driver.name || "";
  const last = driver.lastName || "";
  const candidate = `${first} ${last}`.trim();
  if (candidate) return candidate;
  if (driver.email) return driver.email.split("@")[0];
  return "Conductor";
}

function extractInitials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function formatVehicleLabel(vehicle) {
  if (!vehicle) return "Vehículo registrado";
  const brandModel = `${vehicle.brand || ""} ${vehicle.model || ""}`.trim();
  return brandModel || "Vehículo registrado";
}

function formatDeparture(dateValue) {
  const departure = new Date(dateValue);
  if (Number.isNaN(departure.getTime())) return dateValue;
  return departure.toLocaleString("es-CO", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function TripList() {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [reservationTrip, setReservationTrip] = useState(null);
  const [reservationForm, setReservationForm] = useState({ seats: 1, pickupPointIndex: 0, paymentMethod: "cash" });
  const [reservationError, setReservationError] = useState("");
  const [reservationSending, setReservationSending] = useState(false);
  const [customPickupEnabled, setCustomPickupEnabled] = useState(false);
  const [customPickup, setCustomPickup] = useState({ name: "", description: "", lat: "", lng: "" });
  const [reservationFieldErrors, setReservationFieldErrors] = useState({});
  const [reservationSuccess, setReservationSuccess] = useState(null);

  const clearFieldError = (field) => {
    setReservationFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  useEffect(() => {
    let ignore = false;
    async function fetchTrips() {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get("/trips");
        if (!ignore) {
          setTrips(Array.isArray(data?.trips) ? data.trips : []);
        }
      } catch (err) {
        console.error("trips list", err);
        if (!ignore) setError("No se pudieron cargar los viajes. Intenta nuevamente.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    fetchTrips();
    return () => {
      ignore = true;
    };
  }, []);

  const filteredTrips = useMemo(() => {
    const originFilter = filters.origin.trim().toLowerCase();
    const destinationFilter = filters.destination.trim().toLowerCase();
    const seatsFilter = Number(filters.seats);
    const dateFilter = filters.date ? new Date(filters.date) : null;
    return trips.filter((trip) => {
      const matchesOrigin = originFilter ? trip.origin.toLowerCase().includes(originFilter) : true;
      const matchesDestination = destinationFilter ? trip.destination.toLowerCase().includes(destinationFilter) : true;
      const matchesSeats = Number.isInteger(seatsFilter) && seatsFilter > 0 ? trip.seatsAvailable >= seatsFilter : true;
      const matchesDate = dateFilter ? new Date(trip.departureAt).toDateString() === dateFilter.toDateString() : true;
      return matchesOrigin && matchesDestination && matchesSeats && matchesDate;
    });
  }, [filters, trips]);

  function resetReservationState() {
    setReservationTrip(null);
    setReservationForm({ seats: 1, pickupPointIndex: 0, paymentMethod: "cash" });
    setReservationError("");
    setReservationSending(false);
    setCustomPickupEnabled(false);
    setCustomPickup({ name: "", description: "", lat: "", lng: "" });
    setReservationFieldErrors({});
  }

  async function handleReservationSubmit(event) {
    event.preventDefault();
    if (!reservationTrip) return;
    setReservationFieldErrors({});
    setReservationError("");
    const seats = Number(reservationForm.seats);
    const fieldErrors = {};
    if (!Number.isInteger(seats) || seats < 1) {
      fieldErrors.seats = "Selecciona una cantidad válida de puestos";
    } else if (seats > reservationTrip.seatsAvailable) {
      fieldErrors.seats = "No hay suficientes cupos disponibles";
    }
    let pickup;
    if (customPickupEnabled) {
      const name = customPickup.name.trim();
      const description = customPickup.description.trim();
      const lat = Number(customPickup.lat);
      const lng = Number(customPickup.lng);
      if (!name) {
        fieldErrors.customPickupName = "Describe el nuevo punto de recogida";
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        fieldErrors.customPickupLat = "Selecciona coordenadas válidas o haz clic en el mapa";
        fieldErrors.customPickupLng = "Selecciona coordenadas válidas o haz clic en el mapa";
      } else if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        fieldErrors.customPickupLat = "Las coordenadas están fuera del rango permitido";
        fieldErrors.customPickupLng = "Las coordenadas están fuera del rango permitido";
      }
      if (Object.keys(fieldErrors).length) {
        setReservationFieldErrors(fieldErrors);
        return;
      }
      pickup = { name, description: description || undefined, lat, lng };
    } else {
      pickup = availablePickupPoints[reservationForm.pickupPointIndex];
      if (!pickup) {
        fieldErrors.pickupPointIndex = "Selecciona un punto de recogida";
      }
    }

    if (Object.keys(fieldErrors).length) {
      setReservationFieldErrors(fieldErrors);
      return;
    }

    setReservationSending(true);
    try {
      const payload = {
        seats,
        paymentMethod: reservationForm.paymentMethod,
        pickupPoints: Array.from({ length: seats }, () => ({
          name: pickup.name,
          description: pickup.description,
          lat: pickup.lat,
          lng: pickup.lng
        }))
      };
      const { data } = await api.post(`/trips/${reservationTrip._id}/reservations`, payload);
      let nextTrip = data?.trip || null;

      if (customPickupEnabled) {
        try {
          const suggestionRes = await api.post(`/trips/${reservationTrip._id}/pickup-suggestions`, pickup);
          if (suggestionRes.data?.trip) {
            nextTrip = suggestionRes.data.trip;
          }
        } catch (suggestionError) {
          console.error("pickup suggestion", suggestionError);
        }
      }

      if (nextTrip) {
        setTrips((prev) => prev.map((trip) => (trip._id === nextTrip._id ? nextTrip : trip)));
      }
      setReservationSuccess({
        id: nextTrip?._id || reservationTrip._id,
        driverName: reservationDriverName,
        seats,
        origin: reservationTrip.origin,
        destination: reservationTrip.destination,
        departureAt: reservationTrip.departureAt,
        pickupName: pickup.name
      });
      resetReservationState();
    } catch (err) {
      const message = err?.response?.data?.error || "No se pudo reservar el viaje";
      setReservationError(message);
      setReservationSending(false);
    }
  }

  const availablePickupPoints = reservationTrip?.pickupPoints?.filter((point) => point.status !== "rejected") || [];
  const selectedReservationPickup = !customPickupEnabled
    ? availablePickupPoints[reservationForm.pickupPointIndex] || null
    : null;
  const customPickupLat = Number(customPickup.lat);
  const customPickupLng = Number(customPickup.lng);
  const customPickupSelectedPoint =
    customPickupEnabled && Number.isFinite(customPickupLat) && Number.isFinite(customPickupLng)
      ? { lat: customPickupLat, lng: customPickupLng }
      : null;

  useEffect(() => {
    if (!reservationTrip) return;
    if (!availablePickupPoints.length) {
      if (reservationForm.pickupPointIndex !== 0) {
        setReservationForm((prev) => ({ ...prev, pickupPointIndex: 0 }));
      }
      return;
    }
    if (reservationForm.pickupPointIndex >= availablePickupPoints.length) {
      setReservationForm((prev) => ({ ...prev, pickupPointIndex: 0 }));
    }
  }, [availablePickupPoints.length, reservationForm.pickupPointIndex, reservationTrip]);

  useEffect(() => {
    if (!reservationSuccess) return undefined;
    const timeoutId = setTimeout(() => setReservationSuccess(null), 6000);
    return () => clearTimeout(timeoutId);
  }, [reservationSuccess]);

  const reservationDriverName = formatDriverName(reservationTrip?.driver);
  const reservationDriverInitials = extractInitials(reservationDriverName) || "WD";
  const reservationVehicleLabel = formatVehicleLabel(reservationTrip?.vehicle);
  const reservationPlateLabel = reservationTrip?.vehicle?.plate ? ` · Placa ${reservationTrip.vehicle.plate}` : "";
  const reservationDriverRating = reservationTrip?.driverStats?.average
    ? `${reservationTrip.driverStats.average.toFixed(1)} ⭐ (${reservationTrip.driverStats.ratingsCount} reseñas)`
    : "Sin calificaciones aún";
  const reservationPriceLabel = currencyFormatter.format(reservationTrip?.pricePerSeat || 0);
  const reservationDateLabel = reservationTrip ? formatDeparture(reservationTrip.departureAt) : "";
  const reservationSeatCount = Number(reservationForm.seats) || 0;
  const normalizedSeatCount = reservationSeatCount > 0 ? reservationSeatCount : 0;
  const reservationSeatLabel =
    normalizedSeatCount === 0 ? "Sin cupos" : normalizedSeatCount === 1 ? "1 cupo" : `${normalizedSeatCount} cupos`;
  const reservationSubtotal = (reservationTrip?.pricePerSeat || 0) * normalizedSeatCount;
  const reservationTotalLabel = currencyFormatter.format(reservationSubtotal || 0);
  const successDepartureLabel = reservationSuccess ? formatDeparture(reservationSuccess.departureAt) : "";
  const successSeatLabel =
    reservationSuccess && reservationSuccess.seats
      ? reservationSuccess.seats === 1
        ? "1 cupo reservado"
        : `${reservationSuccess.seats} cupos reservados`
      : "";

  return (
    <section className="py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Viajes disponibles</h1>
        <p className="text-sm text-slate-600">Filtra y reserva un cupo en las rutas activas de la comunidad.</p>
      </header>

      {reservationSuccess && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-white text-base font-semibold text-emerald-600">
            ✓
          </div>
          <div className="flex-1">
            <p className="font-semibold">Reserva enviada a {reservationSuccess.driverName}</p>
            <p className="text-emerald-800">
              {successSeatLabel}
              {successSeatLabel ? " · " : ""}
              {reservationSuccess.origin} → {reservationSuccess.destination} | {successDepartureLabel}
            </p>
            <p className="text-xs text-emerald-700">Te notificaremos cuando el conductor confirme tu cupo.</p>
          </div>
          <button
            type="button"
            className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            onClick={() => setReservationSuccess(null)}
          >
            Cerrar
          </button>
        </div>
      )}

      <form className="mb-6 grid gap-4 rounded-xl border border-white/60 bg-white/80 p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm text-slate-600">
          Origen
          <input
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="Campus Puente del Común"
            value={filters.origin}
            onChange={(event) => setFilters((prev) => ({ ...prev, origin: event.target.value }))}
          />
        </label>
        <label className="text-sm text-slate-600">
          Destino
          <input
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="Chía"
            value={filters.destination}
            onChange={(event) => setFilters((prev) => ({ ...prev, destination: event.target.value }))}
          />
        </label>
        <label className="text-sm text-slate-600">
          Fecha
          <input
            type="date"
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={filters.date}
            onChange={(event) => setFilters((prev) => ({ ...prev, date: event.target.value }))}
          />
        </label>
        <label className="text-sm text-slate-600">
          Cupos mínimos
          <input
            type="number"
            min={1}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={filters.seats}
            onChange={(event) => setFilters((prev) => ({ ...prev, seats: event.target.value }))}
          />
        </label>
      </form>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando viajes...</p>
      ) : error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : filteredTrips.length === 0 ? (
        <p className="text-sm text-slate-500">No encontramos viajes que coincidan con tu búsqueda.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredTrips.map((trip) => {
            const displayDate = formatDeparture(trip.departureAt);
            const driverId =
              trip.driver?._id?.toString?.() ||
              (typeof trip.driver === "string" ? trip.driver : "");
            const isOwner = user?.id && driverId === user.id;
            const myReservation = user
              ? (trip.reservations || []).find((reservation) =>
                  (reservation.passenger || "").toString() === user.id &&
                  !["cancelled", "rejected"].includes(reservation.status)
                )
              : null;
            const myReservationStatus = myReservation?.status;
            const driverName = formatDriverName(trip.driver);
            const driverInitials = extractInitials(driverName);
            const vehicleLabel = formatVehicleLabel(trip.vehicle);
            const plateLabel = trip.vehicle?.plate ? ` · Placa ${trip.vehicle.plate}` : "";
            const driverRating = trip.driverStats?.average
              ? `${trip.driverStats.average.toFixed(1)} ⭐ (${trip.driverStats.ratingsCount} reseñas)`
              : "Sin calificaciones aún";
            const seatsPillLabel = `${trip.seatsAvailable} de ${trip.seatsTotal ?? trip.seatsAvailable} cupos disponibles`;
            return (
              <article key={trip._id} className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                      {driverInitials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{driverName}</p>
                      <p className="text-xs text-slate-500">
                        {vehicleLabel}
                        {plateLabel}
                      </p>
                      <p className="text-xs font-medium text-amber-600">{driverRating}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Precio por asiento</p>
                    <p className="text-2xl font-semibold text-slate-900">
                      {currencyFormatter.format(trip.pricePerSeat || 0)}
                    </p>
                    <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                      {seatsPillLabel}
                    </span>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-sm text-slate-700">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Recogida</p>
                      <p className="font-medium text-slate-900">{trip.origin}</p>
                      <p className="text-xs text-slate-500">{displayDate}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Destino</p>
                      <p className="font-medium text-slate-900">{trip.destination}</p>
                      {trip.routeDescription && (
                        <p className="text-xs text-slate-500">{trip.routeDescription}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {trip.distanceKm && (
                      <p className="rounded-lg bg-white px-3 py-2 text-center text-xs text-slate-500">
                        Distancia estimada:
                        <span className="ml-1 font-semibold text-slate-900">{trip.distanceKm} km</span>
                      </p>
                    )}
                    {trip.durationMinutes && (
                      <p className="rounded-lg bg-white px-3 py-2 text-center text-xs text-slate-500">
                        Duración estimada:
                        <span className="ml-1 font-semibold text-slate-900">{trip.durationMinutes} min</span>
                      </p>
                    )}
                  </div>
                </div>

                {trip.pickupPoints?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Puntos de recogida</p>
                    <ul className="mt-2 space-y-1 text-sm text-slate-600">
                      {trip.pickupPoints.map((pick, index) => (
                        <li key={`${trip._id}-pickup-${index}`}>
                          {(() => {
                            const latNum = Number(pick.lat);
                            const lngNum = Number(pick.lng);
                            const latDisplay = Number.isFinite(latNum) ? latNum.toFixed(4) : pick.lat;
                            const lngDisplay = Number.isFinite(lngNum) ? lngNum.toFixed(4) : pick.lng;
                            return `${pick.name} (${latDisplay}, ${lngDisplay})`;
                          })()}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                  {isOwner ? (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                      Este viaje es tuyo
                    </span>
                  ) : myReservationStatus ? (
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600">
                      {myReservationStatus === "pending" ? "Reserva pendiente" : "Reserva confirmada"}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
                      disabled={trip.seatsAvailable === 0 || reservationSending}
                      onClick={() => {
                        setReservationTrip(trip);
                        setReservationForm({
                          seats: 1,
                          pickupPointIndex: 0,
                          paymentMethod: "cash"
                        });
                        setReservationError("");
                        setReservationFieldErrors({});
                        const hasPickupPoints = Array.isArray(trip.pickupPoints) && trip.pickupPoints.length > 0;
                        setCustomPickupEnabled(!hasPickupPoints);
                        setCustomPickup({ name: "", description: "", lat: "", lng: "" });
                      }}
                    >
                      Reservar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {reservationTrip && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/60 bg-white p-6 shadow-lg">
            <header className="mb-5 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700">
                    {reservationDriverInitials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{reservationDriverName}</p>
                    <p className="text-xs text-slate-500">
                      {reservationVehicleLabel}
                      {reservationPlateLabel}
                    </p>
                    <p className="text-xs font-medium text-amber-600">{reservationDriverRating}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Precio por asiento</p>
                  <p className="text-xl font-semibold text-slate-900">{reservationPriceLabel}</p>
                  <p className="text-xs text-slate-500">{reservationDateLabel}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-xs text-slate-600">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Recogida</p>
                    <p className="text-sm font-medium text-slate-900">{reservationTrip.origin}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Destino</p>
                    <p className="text-sm font-medium text-slate-900">{reservationTrip.destination}</p>
                  </div>
                </div>
              </div>
            </header>

            {!availablePickupPoints.length && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                El conductor aún no ha definido puntos de recogida para este viaje. Selecciona uno en el mapa para sugerirlo al confirmar tu reserva.
              </div>
            )}

            <div className="mb-4 space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={customPickupEnabled || !availablePickupPoints.length}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      const forceEnabled = !availablePickupPoints.length;
                      setCustomPickupEnabled(enabled || forceEnabled);
                      if (!enabled && !forceEnabled) {
                        setCustomPickup({ name: "", description: "", lat: "", lng: "" });
                        clearFieldError("customPickupName");
                        clearFieldError("customPickupLat");
                        clearFieldError("customPickupLng");
                      } else {
                        clearFieldError("pickupPointIndex");
                      }
                      setReservationError("");
                    }}
                    disabled={!availablePickupPoints.length}
                  />
                  Sugerir un nuevo punto usando el mapa
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  {customPickupEnabled || !availablePickupPoints.length
                    ? "Haz clic en el mapa para fijar coordenadas y describe el punto para el conductor."
                    : "Puedes elegir uno de los puntos del conductor o activar la casilla para proponer uno nuevo."}
                </p>
              </div>

              <TransmilenioMap
                height={260}
                pickupPoints={availablePickupPoints}
                selectedPoint={customPickupEnabled ? customPickupSelectedPoint : selectedReservationPickup}
                onPickupSelect={(_point, index) => {
                  setCustomPickupEnabled(false);
                  setCustomPickup({ name: "", description: "", lat: "", lng: "" });
                  setReservationForm((prev) => ({ ...prev, pickupPointIndex: index }));
                  clearFieldError("customPickupName");
                  clearFieldError("customPickupLat");
                  clearFieldError("customPickupLng");
                  clearFieldError("pickupPointIndex");
                  setReservationError("");
                }}
                onSelectPoint={
                  customPickupEnabled
                    ? ({ lat, lng }) => {
                        setCustomPickup((prev) => ({
                          ...prev,
                          lat: lat.toFixed(5),
                          lng: lng.toFixed(5)
                        }));
                        clearFieldError("customPickupLat");
                        clearFieldError("customPickupLng");
                        setReservationError("");
                      }
                    : undefined
                }
                interactive={customPickupEnabled}
              />
              <p className="text-xs text-slate-500">
                {customPickupEnabled
                  ? "Haz clic en el mapa para ajustar tu sugerencia. También puedes editar los campos manualmente."
                  : "Haz clic en un marcador verde para seleccionar el punto de recogida antes de confirmar tu reserva."}
              </p>
            </div>

            {(customPickupEnabled || !availablePickupPoints.length) && (
              <div className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-white/70 p-4 text-sm text-slate-700">
                <p className="text-sm font-medium text-slate-800">Describe el nuevo punto</p>
                <label className="block text-xs uppercase tracking-wide text-slate-500">
                  Nombre del punto *
                  <input
                    type="text"
                    className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                      reservationFieldErrors.customPickupName ? "border-red-300 focus:border-red-400 focus:outline-none" : "border-slate-200"
                    }`}
                    value={customPickup.name}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setCustomPickup((prev) => ({ ...prev, name: nextValue }));
                      clearFieldError("customPickupName");
                      setReservationError("");
                    }}
                    placeholder="Portal Norte"
                    aria-invalid={Boolean(reservationFieldErrors.customPickupName)}
                  />
                  {reservationFieldErrors.customPickupName && (
                    <p className="mt-1 text-[0.7rem] text-red-600">{reservationFieldErrors.customPickupName}</p>
                  )}
                </label>
                <label className="block text-xs uppercase tracking-wide text-slate-500">
                  Referencia o descripción
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={customPickup.description}
                    onChange={(event) => {
                      setCustomPickup((prev) => ({ ...prev, description: event.target.value }));
                      setReservationError("");
                    }}
                    placeholder="Frente a la entrada principal"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs uppercase tracking-wide text-slate-500">
                    Latitud *
                    <input
                      type="number"
                      step="any"
                      className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                        reservationFieldErrors.customPickupLat ? "border-red-300 focus:border-red-400 focus:outline-none" : "border-slate-200"
                      }`}
                      value={customPickup.lat}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setCustomPickup((prev) => ({ ...prev, lat: nextValue }));
                        clearFieldError("customPickupLat");
                        setReservationError("");
                      }}
                      placeholder="4.76123"
                      aria-invalid={Boolean(reservationFieldErrors.customPickupLat)}
                    />
                    {reservationFieldErrors.customPickupLat && (
                      <p className="mt-1 text-[0.7rem] text-red-600">{reservationFieldErrors.customPickupLat}</p>
                    )}
                  </label>
                  <label className="block text-xs uppercase tracking-wide text-slate-500">
                    Longitud *
                    <input
                      type="number"
                      step="any"
                      className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                        reservationFieldErrors.customPickupLng ? "border-red-300 focus:border-red-400 focus:outline-none" : "border-slate-200"
                      }`}
                      value={customPickup.lng}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setCustomPickup((prev) => ({ ...prev, lng: nextValue }));
                        clearFieldError("customPickupLng");
                        setReservationError("");
                      }}
                      placeholder="-74.04561"
                      aria-invalid={Boolean(reservationFieldErrors.customPickupLng)}
                    />
                    {reservationFieldErrors.customPickupLng && (
                      <p className="mt-1 text-[0.7rem] text-red-600">{reservationFieldErrors.customPickupLng}</p>
                    )}
                  </label>
                </div>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleReservationSubmit}>
              <label className="block text-sm text-slate-600">
                Cantidad de cupos
                <input
                  type="number"
                  min={1}
                  max={reservationTrip.seatsAvailable}
                  value={reservationForm.seats}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setReservationForm((prev) => ({ ...prev, seats: nextValue }));
                    clearFieldError("seats");
                    setReservationError("");
                  }}
                  className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                    reservationFieldErrors.seats ? "border-red-300 focus:border-red-400 focus:outline-none" : "border-slate-200"
                  }`}
                  aria-invalid={Boolean(reservationFieldErrors.seats)}
                />
                {reservationFieldErrors.seats && (
                  <p className="mt-1 text-xs text-red-600">{reservationFieldErrors.seats}</p>
                )}
              </label>

              {availablePickupPoints.length ? (
                <label className="block text-sm text-slate-600">
                  Punto de recogida del conductor
                  <select
                    value={reservationForm.pickupPointIndex}
                    onChange={(event) => {
                      setReservationForm((prev) => ({
                        ...prev,
                        pickupPointIndex: Number(event.target.value) || 0
                      }));
                      clearFieldError("pickupPointIndex");
                      setReservationError("");
                    }}
                    className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                      reservationFieldErrors.pickupPointIndex ? "border-red-300 focus:border-red-400 focus:outline-none" : "border-slate-200"
                    }`}
                    disabled={customPickupEnabled}
                    aria-invalid={Boolean(reservationFieldErrors.pickupPointIndex)}
                  >
                    {availablePickupPoints.map((pick, index) => (
                      <option key={`${reservationTrip._id}-pickup-option-${index}`} value={index}>
                        {pick.name}
                      </option>
                    ))}
                  </select>
                  {customPickupEnabled && (
                    <p className="mt-1 text-xs text-slate-500">Desactiva la sugerencia para volver a elegir un punto existente.</p>
                  )}
                  {reservationFieldErrors.pickupPointIndex && (
                    <p className="mt-1 text-xs text-red-600">{reservationFieldErrors.pickupPointIndex}</p>
                  )}
                </label>
              ) : null}

              <label className="block text-sm text-slate-600">
                Método de pago
                <select
                  value={reservationForm.paymentMethod}
                  onChange={(event) => {
                    setReservationForm((prev) => ({ ...prev, paymentMethod: event.target.value }));
                    setReservationError("");
                  }}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="cash">Efectivo</option>
                  <option value="nequi">Nequi</option>
                </select>
              </label>

              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-slate-500">Precio unitario</span>
                  <span className="font-semibold text-slate-900">{reservationPriceLabel}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-slate-500">Cupos</span>
                  <span className="font-medium text-slate-900">{reservationSeatLabel}</span>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-white px-3 py-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Total a pagar</p>
                    <p className="text-[0.7rem] text-slate-500">Se confirma con el conductor</p>
                  </div>
                  <span className="text-lg font-semibold text-emerald-700">{reservationTotalLabel}</span>
                </div>
              </div>

              {reservationError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {reservationError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                  onClick={resetReservationState}
                  disabled={reservationSending}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
                  disabled={reservationSending}
                >
                  {reservationSending ? "Reservando..." : "Confirmar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
