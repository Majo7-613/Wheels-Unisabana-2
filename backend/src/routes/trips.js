// Trip endpoints for creation, discovery, and seat booking with atomic updates.
import mongoose from "mongoose";
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import Trip from "../models/Trip.js";
import Vehicle from "../models/Vehicle.js";
import User from "../models/User.js";
import Rating from "../models/Rating.js";
import { suggestTariff, validateTariffInputs } from "../services/tariffService.js";
import { sendEmail } from "../services/emailService.js";

const router = Router();

function sanitizeTrip(trip) {
  if (!trip) return null;
  const obj = trip.toObject ? trip.toObject({ versionKey: false }) : trip;
  return obj;
}

function normalizePickupPayload(rawPoint = {}) {
  const name = rawPoint?.name?.trim();
  if (!name) {
    return { error: "Ingresa un nombre para el punto" };
  }
  const description = rawPoint?.description?.trim();
  const lat = Number(rawPoint?.lat);
  const lng = Number(rawPoint?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "Latitud y longitud deben ser numéricas" };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: "Coordenadas fuera de rango" };
  }
  return {
    value: {
      name,
      description: description || undefined,
      lat,
      lng
    }
  };
}

// POST /trips: create a new trip authored by the authenticated driver.

// Helper: snap polyline to stops and generate pickup suggestions
async function generatePickupSuggestionsFromPolyline(route, stops) {
  if (!Array.isArray(route) || !route.length || !Array.isArray(stops) || !stops.length) return [];
  // For now, snap to the closest stop for each polyline point, dedupe by stop id
  const snapped = [];
  const usedIds = new Set();
  for (const point of route) {
    let minDist = Infinity, closest = null;
    for (const stop of stops) {
      const d = Math.hypot(point.lat - stop.lat, point.lng - stop.lng);
      if (d < minDist) {
        minDist = d;
        closest = stop;
      }
    }
    if (closest && !usedIds.has(closest.id)) {
      snapped.push({
        name: closest.name,
        description: closest.description || undefined,
        lat: closest.lat,
        lng: closest.lng,
        source: "system",
        status: "active"
      });
      usedIds.add(closest.id);
    }
  }
  return snapped;
}

router.post("/", requireAuth, async (req, res) => {
  const {
    vehicleId,
    origin,
    destination,
    routeDescription,
    departureAt,
    seatsTotal,
    pricePerSeat,
    pickupPoints,
    distanceKm,
    durationMinutes,
    originStopId,
    originStopName,
    originStopLat,
    originStopLng,
    destinationStopId,
    destinationStopName,
    destinationStopLat,
    destinationStopLng,
    route
  } = req.body || {};

  // New: require stops/polyline for new-style trips, else fallback to legacy
  const isNewStyle = originStopId && destinationStopId && Array.isArray(route) && route.length >= 2;
  if (isNewStyle) {
    if (!departureAt || !seatsTotal || pricePerSeat == null) {
      return res.status(400).json({ error: "Datos incompletos para crear viaje" });
    }
  } else {
    if (!origin || !destination || !departureAt || !seatsTotal || pricePerSeat == null) {
      return res.status(400).json({ error: "Datos incompletos para crear viaje" });
    }
  }

  const user = await User.findById(req.user.sub);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  if (!user.roles?.includes("driver")) {
    return res.status(403).json({ error: "Activa el modo conductor para publicar viajes" });
  }

  const finalVehicleId = vehicleId || user.activeVehicle;
  if (!finalVehicleId) {
    return res.status(400).json({ error: "Selecciona un vehículo con documentos vigentes" });
  }

  const vehicle = await Vehicle.findOne({ _id: finalVehicleId, owner: req.user.sub });
  if (!vehicle) {
    return res.status(404).json({ error: "Vehículo no encontrado" });
  }

  const now = new Date();
  if (vehicle.soatExpiration < now || vehicle.licenseExpiration < now) {
    return res.status(400).json({ error: "Actualiza los documentos del vehículo antes de crear viajes" });
  }

  const departureDate = new Date(departureAt);
  if (Number.isNaN(departureDate.getTime())) {
    return res.status(400).json({ error: "Fecha de salida inválida" });
  }
  if (departureDate < now) {
    return res.status(400).json({ error: "La fecha de salida debe ser futura" });
  }

  const seatsNumber = Number(seatsTotal);
  if (!Number.isInteger(seatsNumber) || seatsNumber < 1) {
    return res.status(400).json({ error: "Cantidad de puestos inválida" });
  }
  if (seatsNumber > vehicle.capacity) {
    return res.status(400).json({ error: "Los puestos superan la capacidad del vehículo" });
  }

  const priceNumber = Number(pricePerSeat);
  if (Number.isNaN(priceNumber) || priceNumber < 0) {
    return res.status(400).json({ error: "Precio por puesto inválido" });
  }

  if (pickupPoints && !Array.isArray(pickupPoints)) {
    return res.status(400).json({ error: "pickupPoints debe ser una lista" });
  }

  if (pickupPoints) {
    const invalidPoint = pickupPoints.find((point) => normalizePickupPayload(point).error);
    if (invalidPoint) {
      const { error: pointError } = normalizePickupPayload(invalidPoint);
      return res.status(400).json({ error: pointError });
    }
  }


  let tripPayload = {
    driver: req.user.sub,
    vehicle: vehicle._id,
    routeDescription,
    departureAt: departureDate,
    seatsTotal: seatsNumber,
    seatsAvailable: seatsNumber,
    pricePerSeat: priceNumber,
    distanceKm: distanceKm != null ? Number(distanceKm) : undefined,
    durationMinutes: durationMinutes != null ? Number(durationMinutes) : undefined
  };

  if (isNewStyle) {
    // New-style: store stops, polyline, and generate pickupPoints from route
    tripPayload = {
      ...tripPayload,
      originStopId,
      originStopName,
      originStopLat,
      originStopLng,
      destinationStopId,
      destinationStopName,
      destinationStopLat,
      destinationStopLng,
      route
    };
    // Fetch stops from DB or cache (reuse /maps/transmilenio/stops logic)
    let stops = [];
    try {
      const stopsModule = await import("./maps.js");
      stops = (await stopsModule.getTransmilenioStopsList?.()) || [];
    } catch {
      // fallback: no stops
    }
    tripPayload.pickupPoints = await generatePickupSuggestionsFromPolyline(route, stops);
    // For new-style, legacy origin/destination are optional
    tripPayload.origin = originStopName || "";
    tripPayload.destination = destinationStopName || "";
  } else {
    // Legacy: use provided origin/destination and pickupPoints
    tripPayload.origin = origin;
    tripPayload.destination = destination;
    tripPayload.pickupPoints = pickupPoints?.map((point) => {
      const { value } = normalizePickupPayload(point);
      return {
        ...value,
        source: "driver",
        status: "active",
        requestedBy: req.user.sub,
        createdAt: new Date()
      };
    });
  }

  if (tripPayload.distanceKm != null && (Number.isNaN(tripPayload.distanceKm) || tripPayload.distanceKm < 0)) {
    return res.status(400).json({ error: "Distancia inválida" });
  }
  if (tripPayload.durationMinutes != null && (Number.isNaN(tripPayload.durationMinutes) || tripPayload.durationMinutes < 0)) {
    return res.status(400).json({ error: "Duración inválida" });
  }

  Object.keys(tripPayload).forEach((key) => tripPayload[key] === undefined && delete tripPayload[key]);

  const trip = await Trip.create(tripPayload);
  res.status(201).json({ trip: sanitizeTrip(trip) });
});

// GET /trips: list all trips with optional filters for passengers.
router.get("/", async (req, res) => {
  const { departure_point, min_seats, max_price, start_time, end_time } = req.query || {};
  const criteria = { status: { $in: ["scheduled", "full"] } };

  if (departure_point) {
    criteria.origin = { $regex: departure_point, $options: "i" };
  }
  if (min_seats) {
    const seats = Number(min_seats);
    if (!Number.isNaN(seats)) criteria.seatsAvailable = { $gte: seats };
  }
  if (max_price) {
    const price = Number(max_price);
    if (!Number.isNaN(price)) criteria.pricePerSeat = { $lte: price };
  }
  // Optional time range filtering for departureAt
  if (start_time || end_time) {
    const range = {};
    if (start_time) {
      const s = new Date(start_time);
      if (!Number.isNaN(s.getTime())) {
        range.$gte = s;
      }
    }
    if (end_time) {
      const e = new Date(end_time);
      if (!Number.isNaN(e.getTime())) {
        range.$lte = e;
      }
    }
    if (Object.keys(range).length) {
      criteria.departureAt = range;
    }
  }

  const list = await Trip.find(criteria)
    .select("-pickupSuggestions")
    .populate("driver", "firstName lastName photoUrl roles")
    .populate("vehicle", "brand model plate color")
    .sort({ departureAt: 1 })
    .lean();

  const driverIds = Array.from(
    new Set(
      list
        .map((trip) => trip.driver?._id?.toString())
        .filter((id) => Boolean(id))
    )
  );

  let ratingMap = new Map();
  if (driverIds.length) {
    const driverObjectIds = driverIds.map((id) => new mongoose.Types.ObjectId(id));
    const ratingStats = await Rating.aggregate([
      { $match: { to: { $in: driverObjectIds } } },
      {
        $group: {
          _id: "$to",
          average: { $avg: "$score" },
          count: { $sum: 1 }
        }
      }
    ]);
    ratingMap = new Map(
      ratingStats.map((stat) => [stat._id.toString(), { average: stat.average, count: stat.count }])
    );
  }

  const enrichedTrips = list.map((trip) => {
    const driverId = trip.driver?._id?.toString();
    const stats = driverId ? ratingMap.get(driverId) : null;
    return {
      ...trip,
      driverStats: stats
        ? {
            average: Number(stats.average?.toFixed(2)) || null,
            ratingsCount: stats.count
          }
        : null
    };
  });

  res.json({ trips: enrichedTrips });
});

router.post("/tariff/suggest", (req, res) => {
  const validationError = validateTariffInputs(req.body || {});
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const suggestion = suggestTariff(req.body || {});
  res.json(suggestion);
});

// POST /trips/:id/reservations: passenger books one or more seats selecting pickup points.
router.post("/:id/reservations", requireAuth, async (req, res) => {
  const { seats, pickupPoints, paymentMethod } = req.body || {};
  const seatsRequested = Number(seats);
  if (!Number.isInteger(seatsRequested) || seatsRequested < 1) {
    return res.status(400).json({ error: "Cantidad de puestos inválida" });
  }
  if (!Array.isArray(pickupPoints) || pickupPoints.length !== seatsRequested) {
    return res.status(400).json({ error: "Debes indicar un punto de recogida por puesto" });
  }

  const normalizedReservationPoints = [];
  for (const point of pickupPoints) {
    const { value, error } = normalizePickupPayload(point);
    if (error) {
      return res.status(400).json({ error });
    }
    normalizedReservationPoints.push(value);
  }

  if (paymentMethod && !["cash", "nequi"].includes(paymentMethod)) {
    return res.status(400).json({ error: "Método de pago inválido" });
  }
  const reservationDoc = {
    passenger: req.user.sub,
    seats: seatsRequested,
    pickupPoints: normalizedReservationPoints,
    paymentMethod: paymentMethod || "cash",
    status: "pending"
  };

  const trip = await Trip.findOneAndUpdate(
    {
      _id: req.params.id,
      seatsAvailable: { $gte: seatsRequested },
      status: { $in: ["scheduled", "full"] },
      driver: { $ne: req.user.sub },
      reservations: {
        $not: {
          $elemMatch: { passenger: req.user.sub, status: { $in: ["pending", "confirmed"] } }
        }
      }
    },
    {
      $inc: { seatsAvailable: -seatsRequested },
      $push: { reservations: reservationDoc }
    },
    { new: true }
  );

  if (!trip) {
    const existingTrip = await Trip.findById(req.params.id);
    if (!existingTrip) return res.status(404).json({ error: "Viaje no encontrado" });
    if (existingTrip.driver.toString() === req.user.sub) {
      return res.status(400).json({ error: "No puedes reservar tu propio viaje" });
    }
    if (existingTrip.status === "cancelled" || existingTrip.status === "completed") {
      return res.status(400).json({ error: "El viaje no está disponible" });
    }
    if (existingTrip.seatsAvailable < seatsRequested) {
      return res.status(400).json({ error: "Sin cupos suficientes" });
    }
    const hasReservation = existingTrip.reservations?.some(
      (r) => r.passenger.toString() === req.user.sub && r.status === "confirmed"
    );
    if (hasReservation) {
      return res.status(400).json({ error: "Ya tienes una reserva activa en este viaje" });
    }
    return res.status(400).json({ error: "No se pudo crear la reserva" });
  }

  if (trip.seatsAvailable === 0 && trip.status !== "full") {
    trip.status = "full";
    await trip.save();
  }

  res.status(201).json({ trip: sanitizeTrip(trip) });
});

// POST /trips/:id/pickup-suggestions: passengers propose new pickup points as part of bookings.
router.post("/:id/pickup-suggestions", requireAuth, async (req, res) => {
  const { value, error } = normalizePickupPayload(req.body || {});
  if (error) {
    return res.status(400).json({ error });
  }

  const trip = await Trip.findById(req.params.id);
  if (!trip) return res.status(404).json({ error: "Viaje no encontrado" });

  if (trip.driver?.toString() === req.user.sub) {
    return res.status(400).json({ error: "Los conductores deben gestionar puntos desde el panel correspondiente" });
  }

  const pendingForPassenger = (trip.pickupSuggestions || []).filter(
    (suggestion) => suggestion.passenger?.toString() === req.user.sub && suggestion.status === "pending"
  );
  if (pendingForPassenger.length >= 3) {
    return res.status(429).json({ error: "Ya tienes solicitudes pendientes para este viaje" });
  }

  const pickupPoint = {
    ...value,
    source: "passenger",
    status: "active",
    requestedBy: req.user.sub,
    createdAt: new Date()
  };

  trip.pickupPoints = trip.pickupPoints || [];
  trip.pickupPoints.push(pickupPoint);
  trip.pickupSuggestions = trip.pickupSuggestions || [];
  trip.pickupSuggestions.push({
    passenger: req.user.sub,
    ...value,
    status: "pending"
  });

  await trip.save();

  const suggestion = trip.pickupSuggestions[trip.pickupSuggestions.length - 1];
  return res.status(201).json({ suggestion, pickupPoint, trip: sanitizeTrip(trip) });
});

function adjustTripCapacity(trip) {
  if (trip.seatsAvailable === 0 && trip.status === "scheduled") {
    trip.status = "full";
  }
  if (trip.seatsAvailable > 0 && trip.status === "full") {
    trip.status = "scheduled";
  }
}

router.put("/:tripId/reservations/:reservationId/confirm", requireAuth, async (req, res) => {
  const { tripId, reservationId } = req.params;
  const trip = await Trip.findOne({ _id: tripId, driver: req.user.sub });
  if (!trip) return res.status(404).json({ error: "Viaje no encontrado" });

  const reservation = trip.reservations.id(reservationId);
  if (!reservation) return res.status(404).json({ error: "Reserva no encontrada" });
  if (reservation.status === "rejected" || reservation.status === "cancelled") {
    return res.status(400).json({ error: "La reserva ya fue cancelada" });
  }
  if (reservation.status === "confirmed") {
    return res.json({ trip: sanitizeTrip(trip) });
  }
  if (reservation.status !== "pending") {
    return res.status(400).json({ error: "Reserva en estado inválido" });
  }

  reservation.status = "confirmed";
  reservation.decisionAt = new Date();

  adjustTripCapacity(trip);
  await trip.save();
  return res.json({ trip: sanitizeTrip(trip) });
});

router.put("/:tripId/reservations/:reservationId/reject", requireAuth, async (req, res) => {
  const { tripId, reservationId } = req.params;
  const trip = await Trip.findOne({ _id: tripId, driver: req.user.sub });
  if (!trip) return res.status(404).json({ error: "Viaje no encontrado" });

  const reservation = trip.reservations.id(reservationId);
  if (!reservation) return res.status(404).json({ error: "Reserva no encontrada" });
  if (reservation.status === "rejected" || reservation.status === "cancelled") {
    return res.json({ trip: sanitizeTrip(trip) });
  }
  if (reservation.status !== "pending") {
    return res.status(400).json({ error: "Solo reservas pendientes pueden rechazarse" });
  }

  reservation.status = "rejected";
  reservation.decisionAt = new Date();
  trip.seatsAvailable = Math.min(trip.seatsAvailable + reservation.seats, trip.seatsTotal);
  adjustTripCapacity(trip);
  await trip.save();
  return res.json({ trip: sanitizeTrip(trip) });
});

router.put("/:tripId/reservations/:reservationId/cancel", requireAuth, async (req, res) => {
  const { tripId, reservationId } = req.params;
  const trip = await Trip.findOne({ _id: tripId, "reservations._id": reservationId });
  if (!trip) return res.status(404).json({ error: "Reserva no encontrada" });

  const reservation = trip.reservations.id(reservationId);
  const isDriver = trip.driver.toString() === req.user.sub;
  const isPassenger = reservation.passenger?.toString() === req.user.sub;
  if (!isDriver && !isPassenger) {
    return res.status(403).json({ error: "No autorizado" });
  }
  if (reservation.status === "cancelled" || reservation.status === "rejected") {
    return res.json({ trip: sanitizeTrip(trip) });
  }

  reservation.status = "cancelled";
  reservation.decisionAt = new Date();
  trip.seatsAvailable = Math.min(trip.seatsAvailable + reservation.seats, trip.seatsTotal);
  adjustTripCapacity(trip);
  await trip.save();
  return res.json({ trip: sanitizeTrip(trip) });
});

// PUT /trips/:id/cancel: driver cancels trip and frees seats.
router.put("/:id/cancel", requireAuth, async (req, res) => {
  const trip = await Trip.findOne({ _id: req.params.id, driver: req.user.sub });
  if (!trip) return res.status(404).json({ error: "Viaje no encontrado" });

  trip.status = "cancelled";
  trip.seatsAvailable = 0;
  trip.reservations = trip.reservations.map((reservation) => ({
    ...(reservation?.toObject ? reservation.toObject() : reservation),
    status: "cancelled"
  }));

  await trip.save();

  // Notify passengers by email (non-blocking)
  try {
    const passengerIds = (trip.reservations || []).map((r) => r.passenger).filter(Boolean);
    if (passengerIds.length) {
      const users = await User.find({ _id: { $in: passengerIds } }).select("email firstName").lean();
      const userById = new Map(users.map((u) => [u._id.toString(), u]));

      const emailPromises = (trip.reservations || []).map((reservation) => {
        const pid = reservation.passenger?.toString();
        const user = pid ? userById.get(pid) : null;
        if (user && user.email) {
          return sendEmail({
            to: user.email,
            subject: "Viaje cancelado - Wheels Sabana",
            html: `<p>Hola <strong>${user.firstName || ""}</strong>,</p><p>Lamentamos informarte que el viaje ${sanitizeTrip(trip).origin || ""} → ${sanitizeTrip(trip).destination || ""} fue cancelado por el conductor.</p>`
          });
        }
        return Promise.resolve(null);
      });

      // fire and forget but await settled results to log any failures
      const settled = await Promise.allSettled(emailPromises);
      const errs = settled.filter((s) => s.status === "rejected");
      if (errs.length) {
        console.error(`Failed to send ${errs.length} trip-cancel emails`);
      }
    }
  } catch (err) {
    console.error("Error notifying passengers of trip cancellation", err && err.message ? err.message : err);
  }

  res.json({ trip: sanitizeTrip(trip) });
});

// GET /trips/:id/passengers: driver views confirmed passengers and pickup points.
router.get("/:id/passengers", requireAuth, async (req, res) => {
  const trip = await Trip.findOne({ _id: req.params.id, driver: req.user.sub })
    .populate("reservations.passenger", "firstName lastName phone email")
    .lean();
  if (!trip) return res.status(404).json({ error: "Viaje no encontrado" });

  const passengers = (trip.reservations || []).map((r) => ({
    id: r._id,
    passenger: r.passenger,
    seats: r.seats,
    pickupPoints: r.pickupPoints,
    paymentMethod: r.paymentMethod,
    status: r.status,
    decisionAt: r.decisionAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }));

  res.json({ passengers });
});

export default router;
