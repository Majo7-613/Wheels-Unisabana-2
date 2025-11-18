// Maps integration endpoints proxy to OpenRouteService via mapsService.
import { Router } from "express";
import { calculateDistance, getDistanceMatrix, MapsServiceError } from "../services/mapsService.js";
import { getRoute, RouteServiceError } from "../services/routeService.js";
import {
  getTransmilenioRoutes,
  getTransmilenioStations
} from "../services/transmilenioService.js";

const router = Router();

const ALLOWED_MODES = new Set(["driving", "walking", "bicycling"]);

function normalizePoint(value, label) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) throw new Error(`${label} requerido`);
    const parts = trimmed.split(",");
    if (parts.length !== 2) throw new Error(`Formato inválido para ${label}. Usa lat,lng`);
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(`Coordenadas inválidas para ${label}`);
    return `${lat},${lng}`;
  }

  if (value && typeof value === "object") {
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(`Coordenadas inválidas para ${label}`);
    }
    return `${lat},${lng}`;
  }

  throw new Error(`${label} requerido`);
}

function normalizeMode(mode) {
  if (!mode) return "driving";
  const normalized = String(mode).toLowerCase();
  if (ALLOWED_MODES.has(normalized)) return normalized;
  throw new Error("Modo de transporte inválido");
}

// GET /maps/distance?origin=...&destination=...
// Validates required query parameters and returns upstream JSON (distance, duration, etc.).
router.get("/distance", async (req, res) => {
  const { origin, destination } = req.query || {};
  if (!origin || !destination) return res.status(400).json({ error: "origin y destination requeridos" });
  try {
    const data = await getDistanceMatrix(origin, destination, { mode: normalizeMode(req.query.mode) });
    res.json(data);
  } catch (e) {
    const status = e instanceof MapsServiceError ? e.statusCode : 500;
    res.status(status).json({ error: "Distance Matrix error", detail: e.message, providerStatus: e.providerStatus });
  }
});

// POST /maps/calculate body: { origin, destination, mode? }
router.post("/calculate", async (req, res) => {
  const { origin, destination, mode } = req.body || {};

  let serializedOrigin;
  let serializedDestination;
  let finalMode;

  try {
    serializedOrigin = normalizePoint(origin, "origin");
    serializedDestination = normalizePoint(destination, "destination");
    finalMode = normalizeMode(mode);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    const payload = await calculateDistance({ origin: serializedOrigin, destination: serializedDestination, mode: finalMode });
    res.json(payload);
  } catch (error) {
    if (error instanceof MapsServiceError) {
      return res.status(error.statusCode).json({
        error: error.message,
        providerStatus: error.providerStatus,
        cacheHit: error.cacheHit
      });
    }
    res.status(500).json({ error: "Distance Matrix error", detail: error.message });
  }
});

async function handleTransmilenioFetch(res, fetchFn) {
  try {
    const { data, cacheHit, fetchedAt } = await fetchFn();
    res.json({ data, meta: { cacheHit, fetchedAt } });
  } catch (error) {
    const status = error?.statusCode || error?.response?.status || 502;
    res.status(status).json({
      error: error?.message || "TransMilenio no disponible",
      cacheHit: Boolean(error?.cacheHit)
    });
  }
}


router.get("/transmilenio/routes", async (_req, res) => {
  await handleTransmilenioFetch(res, getTransmilenioRoutes);
});

router.get("/transmilenio/stations", async (_req, res) => {
  await handleTransmilenioFetch(res, getTransmilenioStations);
});

// Lightweight stops endpoint: id, name, lat, lng
router.get("/transmilenio/stops", async (_req, res) => {
  try {
    const { data } = await getTransmilenioStations();
    if (!data?.features?.length) return res.json({ stops: [] });
    const stops = data.features.map((feature) => {
      const props = feature.properties || {};
      return {
        id: props.numero_estacion || props.codigo_nodo_estacion || props.objectid || feature.id,
        name: props.nombre_estacion || props.nombre || "Estación",
        lat: props.latitud_estacion || (feature.geometry?.coordinates?.[1]),
        lng: props.longitud_estacion || (feature.geometry?.coordinates?.[0])
      };
    }).filter(stop => stop.id && stop.name && typeof stop.lat === "number" && typeof stop.lng === "number");
    // Add Universidad de La Sabana as an extra stop (hardcoded)
    try {
      const uniSabana = {
        id: "UNISABANA",
        name: "Universidad de La Sabana",
        lat: 4.858333,
        lng: -74.030556
      };
      // Avoid duplicates by id
      if (!stops.find(s => String(s.id) === String(uniSabana.id))) {
        stops.unshift(uniSabana);
      }
    } catch (e) {
      // non-fatal: continue returning existing stops
    }
    res.json({ stops });
  } catch (error) {
    res.status(502).json({ error: error?.message || "No se pudo obtener paradas TM" });
  }
});

// GET /maps/route-suggest?origin=lat,lng&destination=lat,lng&provider=osrm|google
router.get("/route-suggest", async (req, res) => {
  const { origin, destination } = req.query || {};
  const provider = req.query.provider || "osrm";
  if (!origin || !destination) return res.status(400).json({ error: "origin y destination requeridos" });
  try {
    const payload = await getRoute(origin, destination, provider);
    res.json(payload);
  } catch (error) {
    const status = error?.statusCode || 500;
    res.status(status).json({ error: error?.message || "Route provider error", provider: error?.provider, providerStatus: error?.providerStatus });
  }
});

export default router;
