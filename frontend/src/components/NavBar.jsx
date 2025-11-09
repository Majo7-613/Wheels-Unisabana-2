import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

const baseNav = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/trips", label: "Viajes" },
  { to: "/reservations", label: "Reservas" },
  { to: "/vehicles", label: "Vehículos", requiresRole: "driver" },
  { to: "/trips/new", label: "Crear viaje", requiresRole: "driver" },
  { to: "/profile", label: "Perfil" },
  { to: "/features/add-pickup-points", label: "Puntos", requiresRole: "driver" },
  { to: "/features/calculate-distance", label: "Distancias" }
];

export default function NavBar() {
  const { isAuthenticated, user, loadingProfile } = useAuth();
  const { palette } = useTheme();
  const roles = user?.roles || [];
  const allowedNav = baseNav.filter((item) => !item.requiresRole || roles.includes(item.requiresRole));

  return (
    <nav
      className={`rounded-full border border-white/10 bg-white/10 px-5 py-3 text-xs uppercase tracking-[0.3em] text-white/70 shadow-lg`}
      style={{ boxShadow: `0 18px 40px ${palette.glow}` }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <Link to={isAuthenticated ? "/dashboard" : "/"} className="text-white/80 hover:text-white">
          Wheels Hub
        </Link>
        {isAuthenticated && (
          <div className="flex flex-wrap items-center gap-2 text-[0.65rem]">
            {allowedNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1 transition ${
                    isActive
                      ? "bg-white/30 text-white"
                      : "text-white/60 hover:bg-white/15 hover:text-white"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-3 text-[0.65rem]">
          {!isAuthenticated ? (
            <>
              <Link to="/login" className="text-white/70 hover:text-white">
                Login
              </Link>
              <Link to="/register" className="text-white/70 hover:text-white">
                Registro
              </Link>
            </>
          ) : (
            <>
              <div className="hidden sm:flex flex-col text-right text-white/60">
                <span className="font-semibold text-white">
                  {loadingProfile
                    ? "Cargando..."
                    : `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || user?.email}
                </span>
                <span className="text-[0.6rem] uppercase tracking-[0.4em] text-white/50">
                  {user?.activeRole === "driver" ? "Conductor" : "Pasajero"}
                </span>
              </div>
              <Link
                to="/logout"
                className="rounded-full bg-white/15 px-3 py-1 text-white hover:bg-white/25"
              >
                Cerrar sesión
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
