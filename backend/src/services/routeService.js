import axios from "axios";

class RouteServiceError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "RouteServiceError";
    this.statusCode = options.statusCode || 500;
    this.provider = options.provider;
    this.providerStatus = options.providerStatus;
  }
}

/**
 * getRoute - fetch a route suggestion from a provider
 * @param {string|object} origin - LatLng as "lat,lng" or { lat, lng }
 * @param {string|object} destination - LatLng as "lat,lng" or { lat, lng }
 * @param {string} provider - 'osrm' or 'google'
 * @returns {Promise<{distance:number,duration:number,polyline:string,raw:object}>}
 */
export async function getRoute(origin, destination, provider = "osrm") {
  // normalize inputs to { lat, lng }
  function parse(point, label) {
    if (!point) throw new RouteServiceError(`${label} requerido`, { statusCode: 400 });
    if (typeof point === "string") {
      const parts = point.split(",").map((p) => p.trim());
      if (parts.length !== 2) throw new RouteServiceError(`Formato inválido para ${label}`, { statusCode: 400 });
      const lat = Number(parts[0]);
      const lng = Number(parts[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new RouteServiceError(`Coordenadas inválidas para ${label}`, { statusCode: 400 });
      return { lat, lng };
    }
    if (typeof point === "object") {
      const lat = Number(point.lat);
      const lng = Number(point.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new RouteServiceError(`Coordenadas inválidas para ${label}`, { statusCode: 400 });
      return { lat, lng };
    }
    throw new RouteServiceError(`${label} requerido`, { statusCode: 400 });
  }

  const o = parse(origin, "origin");
  const d = parse(destination, "destination");

  if (provider === "osrm") {
    // OSRM public demo server expects lon,lat ordering
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lng},${o.lat};${d.lng},${d.lat}`;
    try {
      const res = await axios.get(url, { params: { overview: "full", geometries: "polyline" }, timeout: 10000 });
      const raw = res.data;
      if (!raw || raw.code !== "Ok" || !Array.isArray(raw.routes) || !raw.routes.length) {
        throw new RouteServiceError("OSRM no devolvió rutas válidas", { statusCode: 502, provider: "osrm", providerStatus: raw?.code });
      }
      const route = raw.routes[0];
      const distance = route.distance; // meters
      const duration = route.duration; // seconds
      const polyline = route.geometry; // encoded polyline
      return { distance, duration, polyline, raw };
    } catch (err) {
      if (err instanceof RouteServiceError) throw err;
      throw new RouteServiceError("Error solicitando OSRM", { statusCode: 502, provider: "osrm", providerStatus: err?.response?.status });
    }
  }

  if (provider === "google") {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) throw new RouteServiceError("GOOGLE_MAPS_API_KEY no configurada", { statusCode: 500 });
    const url = "https://maps.googleapis.com/maps/api/directions/json";
    try {
      const now = Math.floor(Date.now() / 1000);
      const params = {
        origin: `${o.lat},${o.lng}`,
        destination: `${d.lat},${d.lng}`,
        departure_time: now,
        key
      };
      const res = await axios.get(url, { params, timeout: 10000 });
      const raw = res.data;
      if (!raw || raw.status !== "OK" || !Array.isArray(raw.routes) || !raw.routes.length) {
        throw new RouteServiceError("Google Directions no devolvió rutas válidas", { statusCode: 502, provider: "google", providerStatus: raw?.status });
      }
      const route = raw.routes[0];
      // Aggregate legs to compute total distance/duration
      const legs = route.legs || [];
      let distance = 0; // meters
      let duration = 0; // seconds (duration_in_traffic if available)
      for (const leg of legs) {
        distance += leg.distance?.value || 0;
        // prefer duration_in_traffic when present
        duration += leg.duration_in_traffic?.value || leg.duration?.value || 0;
      }
      const polyline = route.overview_polyline?.points || null;
      return { distance, duration, polyline, raw };
    } catch (err) {
      if (err instanceof RouteServiceError) throw err;
      throw new RouteServiceError("Error solicitando Google Directions", { statusCode: 502, provider: "google", providerStatus: err?.response?.status });
    }
  }

  throw new RouteServiceError("Provider desconocido. Usa 'osrm' o 'google'", { statusCode: 400 });
}

export { RouteServiceError };
