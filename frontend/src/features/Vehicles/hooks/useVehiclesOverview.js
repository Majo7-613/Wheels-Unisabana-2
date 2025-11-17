import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../../utils/api";

const defaultState = {
  vehicles: [],
  activeVehicleId: "",
  readiness: null
};

function normalizeVehicles(list) {
  if (!Array.isArray(list)) return [];
  return list.map((vehicle) => ({
    ...vehicle,
    _id: vehicle?._id ? String(vehicle._id) : ""
  }));
}

export default function useVehiclesOverview({ enabled = true } = {}) {
  const [vehicles, setVehicles] = useState(defaultState.vehicles);
  const [activeVehicleId, setActiveVehicleId] = useState(defaultState.activeVehicleId);
  const [readiness, setReadiness] = useState(defaultState.readiness);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");
  const lastRequestRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const shouldFetch = Boolean(enabled);

  const assignFromPayload = useCallback((payload) => {
    if (!mountedRef.current) return;
    setVehicles(normalizeVehicles(payload?.vehicles));
    setActiveVehicleId(payload?.activeVehicle ? String(payload.activeVehicle) : "");
    setReadiness(payload?.readiness || null);
  }, []);

  const resetState = useCallback(() => {
    if (!mountedRef.current) return;
    setVehicles(defaultState.vehicles);
    setActiveVehicleId(defaultState.activeVehicleId);
    setReadiness(defaultState.readiness);
  }, []);

  const setLoadingSafe = useCallback((value) => {
    if (mountedRef.current) setLoading(value);
  }, []);

  const setErrorSafe = useCallback((value) => {
    if (mountedRef.current) setError(value);
  }, []);

  const fetchOverview = useCallback(async () => {
    if (!shouldFetch) {
      resetState();
      setErrorSafe("");
      setLoadingSafe(false);
      return { ok: true, skipped: true };
    }

    const requestId = Date.now();
    lastRequestRef.current = requestId;
    setLoadingSafe(true);
    setErrorSafe("");

    try {
      const { data } = await api.get("/vehicles/overview");
      if (!mountedRef.current || lastRequestRef.current !== requestId) {
        return { ok: false, cancelled: true };
      }
      assignFromPayload(data || {});
      setLoadingSafe(false);
      return { ok: true };
    } catch (err) {
      if (!mountedRef.current || lastRequestRef.current !== requestId) {
        return { ok: false, cancelled: true };
      }
      const message = err?.response?.data?.error || "No se pudieron cargar los vehículos";
      setErrorSafe(message);
      resetState();
      setLoadingSafe(false);
      return { ok: false, error: message };
    }
  }, [assignFromPayload, resetState, setErrorSafe, setLoadingSafe, shouldFetch]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const value = useMemo(
    () => ({
      vehicles,
      activeVehicleId,
      readiness,
      loading,
      error,
      refresh: fetchOverview
    }),
    [vehicles, activeVehicleId, readiness, loading, error, fetchOverview]
  );

  return value;
}
