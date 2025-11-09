import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";

export default function Logout() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { palette } = useTheme();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (loading) return;
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div
        className={`w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl ${palette.card}`}
        style={{ boxShadow: `0 25px 60px ${palette.glow}` }}
      >
        <div className="relative mb-6 flex items-center justify-center text-[0.65rem] uppercase tracking-[0.35em] text-white/50">
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="absolute left-0 flex items-center gap-1 text-white/70 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span className="hidden sm:inline">Atrás</span>
          </button>
          <span>Configuración</span>
        </div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-white/80">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M18 12H9m9 0l-3-3m3 3l-3 3"
            />
          </svg>
        </div>
        <p className="mt-6 text-xl font-semibold text-white">¿Cerrar sesión?</p>
        <p className="mt-2 text-sm text-white/60">
          {`¿Estás seguro de que deseas salir de tu cuenta${user?.firstName ? `, ${user.firstName}` : ""}?`}
        </p>
        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="w-full rounded-full bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Cerrando sesión..." : "Sí, cerrar sesión"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="w-full rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
