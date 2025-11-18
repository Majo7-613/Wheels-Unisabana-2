import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import useTransmilenioData from "../utils/useTransmilenioData";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Configure default Leaflet marker assets so Vite bundles the images correctly.
const DefaultIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Minimal ResizeObserver polyfill for browsers/tests without native support (e.g., Jest + jsdom).
if (typeof window !== "undefined" && typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

function toLatLng(point) {
  if (!point) return null;
  const lat = Number(point.lat ?? point.latitude);
  const lng = Number(point.lng ?? point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export default function TransmilenioMap({
  height = 360,
  pickupPoints = [],
  selectedPoint = null,
  onSelectPoint,
  onPickupSelect,
  className = "",
  interactive = true,
  // new props
  routePolyline = [], // [{lat,lng}, ...] - current drawn/selected route
  onDrawPolyline, // callback to set route polyline
  stops = [],
  originStopId,
  destinationStopId
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const routesLayerRef = useRef(null);
  const stationsLayerRef = useRef(null);
  const pickupLayerRef = useRef(null);
  const selectionMarkerRef = useRef(null);
  const clickHandlerRef = useRef(onSelectPoint);
  const pickupSelectHandlerRef = useRef(onPickupSelect);
  const suggestedRouteLayerRef = useRef(null);
  const drawnRouteLayerRef = useRef(null);
  const lastRequestedRouteRef = useRef(null);

  clickHandlerRef.current = onSelectPoint;
  pickupSelectHandlerRef.current = onPickupSelect;

  const { routes, stations, loading, error, refreshRoutes, refreshStations } = useTransmilenioData();

  const normalizedPickupPoints = useMemo(
    () =>
      pickupPoints
        .map((point, index) => ({
          ...point,
          __idx: index,
          __label: point?.name || `Punto ${index + 1}`,
          __latlng: toLatLng(point)
        }))
        .filter((point) => point.__latlng),
    [pickupPoints]
  );

  const selectedLatLng = useMemo(() => toLatLng(selectedPoint), [selectedPoint]);

  // helper: decode encoded polyline (Google/OSRM) to [{lat,lng},...]
  function decodePolyline(encoded) {
    if (!encoded) return [];
    let index = 0, lat = 0, lng = 0, coordinates = [];
    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;
      shift = 0; result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;
      coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return coordinates;
  }

  // Initialize map once.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      minZoom: 11,
      maxZoom: 18,
      preferCanvas: true
    }).setView([4.65, -74.08], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors"
    }).addTo(map);

    if (interactive) {
      map.on("click", (event) => {
        const handler = clickHandlerRef.current;
        if (handler) {
          handler({ lat: event.latlng.lat, lng: event.latlng.lng });
        }
      });
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [interactive]);

  // Render suggested route (from backend) when origin/destination stops change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !originStopId || !destinationStopId || !stops?.length) return;
    const origin = stops.find(s => String(s.id) === String(originStopId));
    const destination = stops.find(s => String(s.id) === String(destinationStopId));
    if (!origin || !destination) return;

    const key = `${origin.id}:${destination.id}`;
    // avoid duplicate requests for same origin/destination
    if (lastRequestedRouteRef.current === key) return;
    lastRequestedRouteRef.current = key;

    // request suggestion
    (async () => {
      try {
        const api = (await import("../utils/api")).default;
        const params = { origin: `${origin.lat},${origin.lng}`, destination: `${destination.lat},${destination.lng}`, provider: "osrm" };
        const { data } = await api.get("/maps/route-suggest", { params });
        const poly = data?.polyline || data?.raw?.routes?.[0]?.geometry || null;
        const decoded = poly ? decodePolyline(poly) : [];

        if (suggestedRouteLayerRef.current) {
          suggestedRouteLayerRef.current.removeFrom(map);
          suggestedRouteLayerRef.current = null;
        }

        if (decoded.length) {
          suggestedRouteLayerRef.current = L.polyline(decoded.map(p => [p.lat, p.lng]), {
            color: "#ef4444",
            weight: 4,
            opacity: 0.9,
            dashArray: "6,6"
          }).addTo(map);

          suggestedRouteLayerRef.current.on("click", () => {
            // apply suggestion to caller (TripForm)
            if (typeof onDrawPolyline === "function") {
              onDrawPolyline(decoded);
            }
          });
          // notify parent that a suggestion is available (include raw data)
          if (typeof onSuggestion === "function") {
            try {
              onSuggestion({ polyline: decoded, distance: data?.distance, duration: data?.duration, raw: data });
            } catch (e) {}
          }
        }
      } catch (e) {
        // ignore suggestion errors silently
      }
    })();
  }, [originStopId, destinationStopId, stops, onDrawPolyline]);

  // Render TransMilenio routes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routesLayerRef.current) {
      routesLayerRef.current.removeFrom(map);
      routesLayerRef.current = null;
    }

    if (!routes?.features?.length) return;

    routesLayerRef.current = L.geoJSON(routes, {
      style: () => ({
        color: "#0ea5e9",
        weight: 2.5,
        opacity: 0.6
      }),
      onEachFeature: (feature, layer) => {
        const { linea, sentido } = feature.properties || {};
        const title = [linea, sentido].filter(Boolean).join(" · ") || "Ruta troncal";
        layer.bindPopup(title);
      }
    }).addTo(map);
  }, [routes]);

  // Render stations.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (stationsLayerRef.current) {
      stationsLayerRef.current.removeFrom(map);
      stationsLayerRef.current = null;
    }

    if (!stations?.features?.length) return;

    stationsLayerRef.current = L.geoJSON(stations, {
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 4,
          fillColor: "#ef4444",
          color: "#fff",
          weight: 1,
          fillOpacity: 0.9,
          opacity: 1
        }),
      onEachFeature: (feature, layer) => {
        const { nombre_estacion: name, localidad } = feature.properties || {};
        const title = name || "Estación";
        const subtitle = localidad ? `Localidad: ${localidad}` : "";
        layer.bindPopup([title, subtitle].filter(Boolean).join("<br />"));
      }
    }).addTo(map);
  }, [stations]);

  // Render saved pickup points.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (pickupLayerRef.current) {
      pickupLayerRef.current.removeFrom(map);
      pickupLayerRef.current = null;
    }

    if (!normalizedPickupPoints.length) return;

    const markers = normalizedPickupPoints.map((point) => {
      const marker = L.circleMarker(point.__latlng, {
        radius: 7,
        fillColor: "#22c55e",
        color: "#15803d",
        weight: 1,
        fillOpacity: 0.9,
        opacity: 1
      }).bindPopup(`<strong>${point.__label}</strong><br/>(${point.__latlng.lat.toFixed(4)}, ${point.__latlng.lng.toFixed(4)})`);

      marker.on("click", () => {
        const handler = pickupSelectHandlerRef.current;
        if (handler) {
          handler(point, point.__idx);
        }
      });

      return marker;
    });

    pickupLayerRef.current = L.layerGroup(markers).addTo(map);
  }, [normalizedPickupPoints]);

  // Render drawn route polyline (routePolyline prop)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (drawnRouteLayerRef.current) {
      drawnRouteLayerRef.current.removeFrom(map);
      drawnRouteLayerRef.current = null;
    }

    if (!routePolyline || !routePolyline.length) return;

    drawnRouteLayerRef.current = L.polyline(routePolyline.map(p => [p.lat, p.lng]), {
      color: "#0ea5e9",
      weight: 4,
      opacity: 0.9
    }).addTo(map);
    try { drawnRouteLayerRef.current && map.fitBounds(drawnRouteLayerRef.current.getBounds(), { padding: [20, 20] }); } catch (e) {}
  }, [routePolyline]);

  // Render currently selected point marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selectedLatLng) {
      if (selectionMarkerRef.current) {
        selectionMarkerRef.current.removeFrom(map);
        selectionMarkerRef.current = null;
      }
      return;
    }

    if (!selectionMarkerRef.current) {
      selectionMarkerRef.current = L.marker(selectedLatLng, {
        keyboard: false,
        title: "Nuevo punto"
      }).addTo(map);
    } else {
      selectionMarkerRef.current.setLatLng(selectedLatLng);
    }
  }, [selectedLatLng]);

  const handleRefresh = () => {
    refreshRoutes();
    refreshStations();
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>Capas oficiales TransMilenio • Clic para seleccionar coordenadas</span>
        <div className="flex items-center gap-2">
          {error && <span className="text-red-600">{error}</span>}
          <button
            type="button"
            className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? "Actualizando..." : "Actualizar capas"}
          </button>
        </div>
      </div>
      <div className="relative">
        {loading && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/80 text-sm text-slate-600">
            Cargando capas...
          </div>
        )}
        <div
          ref={containerRef}
          className="rounded-xl border border-slate-200 shadow-inner"
          style={{ height }}
        />
      </div>
    </div>
  );
}
