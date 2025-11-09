import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext.jsx";

const containerVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 }
};

const isInstitutionalEmail = (email) => {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized.includes("@")) return false;
  const domain = normalized.split("@")[1] || "";
  return domain === "unisabana.edu.co" || domain.endsWith(".unisabana.edu.co");
};

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [bannerError, setBannerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let timeoutId;
    if (success) {
      timeoutId = setTimeout(() => {
        const dest = loc.state?.from?.pathname || "/dashboard";
        nav(dest, { replace: true });
      }, 1400);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [success, loc.state, nav]);

  const formHasErrors = useMemo(() => Object.values(fieldErrors).some(Boolean), [fieldErrors]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setBannerError("");
    const errors = {};

    if (!form.email) {
      errors.email = "Ingresa tu correo institucional";
    } else if (!isInstitutionalEmail(form.email)) {
      errors.email = "Debes usar tu correo @unisabana.edu.co";
    }

    if (!form.password) {
      errors.password = "Ingresa tu contraseña";
    }

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setBannerError(Object.values(errors)[0]);
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", {
        email: String(form.email || "").trim().toLowerCase(),
        password: form.password
      });
      login(data.token, data.user);
      setSuccess(true);
    } catch (err) {
      const message = err?.response?.data?.error || "Credenciales inválidas";
      setBannerError(message);
      setFieldErrors({
        email: "Revisa tu correo",
        password: "Revisa tu contraseña"
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <section className="relative min-h-[100svh] bg-[#001A3D] flex items-center justify-center px-6 py-16 text-white">
        <motion.div
          variants={containerVariants}
          initial="initial"
          animate="animate"
          className="w-full max-w-sm rounded-[32px] bg-white/10 border border-emerald-400/40 backdrop-blur-xl p-10 text-center shadow-[0_25px_70px_rgba(0,0,0,0.45)]"
        >
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20">
            <svg className="h-12 w-12 text-emerald-300" viewBox="0 0 24 24" fill="none">
              <path
                d="M20 7L9 18l-5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="mt-6 text-3xl font-semibold">¡Bienvenido!</h2>
          <p className="mt-3 text-sm text-white/70">Sesión iniciada correctamente. Redirigiendo…</p>
        </motion.div>
      </section>
    );
  }

  return (
    <section className="relative min-h-[100svh] bg-[#001A3D] flex items-center justify-center px-6 py-16">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-10%] h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <motion.div
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className="relative z-10 w-full max-w-sm rounded-[32px] border border-white/20 bg-white/95 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)]"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-100">
            <span className="text-3xl">🚗</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Wheels Sabana</h1>
          <p className="text-sm text-slate-500">Viaja seguro con tu comunidad</p>
        </div>

        {bannerError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-2xl border border-red-400/40 bg-red-100 px-4 py-3 text-sm text-red-700"
          >
            {bannerError}
          </motion.div>
        )}

        <form onSubmit={onSubmit} className="grid gap-4">
          <label className="flex flex-col gap-2 text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-[0.3em]">Correo institucional</span>
            <input
              type="email"
              placeholder="nombre@unisabana.edu.co"
              value={form.email}
              onChange={(e) => {
                const value = e.target.value;
                setForm((prev) => ({ ...prev, email: value }));
                if (fieldErrors.email || bannerError) {
                  setFieldErrors((prev) => ({ ...prev, email: "" }));
                  setBannerError("");
                }
              }}
              className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-cyan-500 focus:border-cyan-400 tracking-normal ${
                fieldErrors.email
                  ? "border-red-400 bg-red-50 focus:ring-red-300 focus:border-red-400"
                  : "border-slate-200 bg-white"
              }`}
            />
            {fieldErrors.email && (
              <span className="mt-2 block text-xs font-medium text-red-500">{fieldErrors.email}</span>
            )}
          </label>

          <label className="flex flex-col gap-2 text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-[0.3em]">Contraseña</span>
            <input
              type="password"
              placeholder="******"
              value={form.password}
              onChange={(e) => {
                const value = e.target.value;
                setForm((prev) => ({ ...prev, password: value }));
                if (fieldErrors.password || bannerError) {
                  setFieldErrors((prev) => ({ ...prev, password: "" }));
                  setBannerError("");
                }
              }}
              className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-cyan-500 focus:border-cyan-400 tracking-normal ${
                fieldErrors.password
                  ? "border-red-400 bg-red-50 focus:ring-red-300 focus:border-red-400"
                  : "border-slate-200 bg-white"
              }`}
            />
            {fieldErrors.password && (
              <span className="mt-2 block text-xs font-medium text-red-500">{fieldErrors.password}</span>
            )}
          </label>

          <div className="flex items-center justify-between text-xs font-medium text-cyan-700">
            <Link to="/register" className="text-slate-500 hover:text-cyan-600 transition">
              ¿No tienes cuenta? Regístrate
            </Link>
            <Link to="/forgot-password" className="text-cyan-600 hover:text-cyan-500 transition">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            className={`mt-2 inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-[0.4em] text-white transition ${
              formHasErrors
                ? "bg-red-500/90 hover:bg-red-500/80"
                : "bg-cyan-600 hover:bg-cyan-700"
            } disabled:opacity-60`}
          >
            {loading ? "Validando..." : formHasErrors ? "Reintentar" : "Iniciar sesión"}
          </motion.button>
        </form>
      </motion.div>
    </section>
  );
}
