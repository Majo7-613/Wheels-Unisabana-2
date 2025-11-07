import axios from "axios";

const metaEnv = typeof import.meta !== "undefined" ? import.meta.env : undefined;
// Toggle between local dev API and the deployed Render API when building for production.
const resolvedDefaultBaseUrl = metaEnv?.DEV
  ? "http://localhost:4000"
  : "https://wheels-unisabana-2.onrender.com";
const apiBaseUrl =
  metaEnv?.VITE_API_URL ||
  process.env?.VITE_API_URL ||
  resolvedDefaultBaseUrl;
const apiTimeout = Number(metaEnv?.VITE_API_TIMEOUT || process.env?.VITE_API_TIMEOUT) || 20000;

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: apiTimeout
});

// Añadir token de localStorage si existe
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
