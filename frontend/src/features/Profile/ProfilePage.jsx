import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext.jsx";

const emptyForm = {
  firstName: "",
  lastName: "",
  phone: "",
  photoUrl: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  preferredPaymentMethod: "cash"
};

const avatarFallback = (firstName = "", lastName = "") => {
  const first = firstName.trim().charAt(0) || "";
  const last = lastName.trim().charAt(0) || "";
  const initials = `${first}${last}`.toUpperCase();
  return initials || "WS";
};

function InfoRow({ label, value }) {
  const display = value ?? "—";
  return (
    <div className="rounded-2xl border border-white/20 bg-white/5 p-4 text-left">
      <p className="text-xs uppercase tracking-[0.3em] text-white/60">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{display || "—"}</p>
    </div>
  );
}

export default function ProfilePage() {
  const { user, refreshProfile, updateProfile, loadingProfile } = useAuth();
  const navigate = useNavigate();
  const [updatingRole, setUpdatingRole] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [resetStep, setResetStep] = useState("request");
  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);

  const availableRoles = useMemo(() => user?.roles || [], [user?.roles]);
  const rolesKey = useMemo(() => availableRoles.join("|"), [availableRoles]);

  useEffect(() => {
    if (!user) {
      setForm(emptyForm);
      setResetEmail("");
      return;
    }
    setForm({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phone: user.phone || "",
      photoUrl: user.photoUrl || "",
      emergencyContactName: user.emergencyContact?.name || "",
      emergencyContactPhone: user.emergencyContact?.phone || "",
      preferredPaymentMethod: user.preferredPaymentMethod || "cash"
    });
    setResetEmail(user.email || "");
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const hasDriverRole = rolesKey.includes("driver");
    async function loadVehicles() {
      if (!user?.id || !hasDriverRole) {
        if (!cancelled) {
          setVehicles([]);
          setLoadingVehicles(false);
        }
        return;
      }
      setLoadingVehicles(true);
      try {
        const { data } = await api.get("/vehicles");
        if (!cancelled) {
          setVehicles(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setVehicles([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingVehicles(false);
        }
      }
    }
    loadVehicles();
    return () => {
      cancelled = true;
    };
  }, [user?.id, rolesKey]);

  async function changeRole(role) {
    if (!role || role === user?.activeRole) return;
    setUpdatingRole(true);
    setError("");
    setSuccess("");
    try {
      const { data } = await api.put("/auth/role", { role });
      if (data?.user) {
        await refreshProfile();
        setSuccess(`Rol activo actualizado a ${role === "conductor" ? "Conductor" : "Pasajero"}`);
      }
    } catch (err) {
      const message = err?.response?.data?.error || "No se pudo actualizar el rol";
      setError(message);
    } finally {
      setUpdatingRole(false);
    }
  }

  const driverActive = ["conductor", "driver"].includes(user?.activeRole);
  const passengerActive = ["pasajero", "passenger"].includes(user?.activeRole) || !driverActive;
  const hasDriverRole = rolesKey.includes("driver");
  const verifiedVehicles = useMemo(() => vehicles, [vehicles]);

  const driverReady = hasDriverRole && verifiedVehicles.length > 0;

  const driverActiveVehicle = useMemo(() => {
    if (!driverReady) return null;
    const activeId = user?.activeVehicle?.toString?.() || user?.activeVehicle;
    return (
      verifiedVehicles.find((vehicle) => vehicle?._id?.toString?.() === activeId) ||
      verifiedVehicles[0]
    );
  }, [driverReady, verifiedVehicles, user?.activeVehicle]);

  const hasVehicles = vehicles.length > 0;
  let driverHelperTone = "info";
  let driverHelperMessage = "";

  if (loadingVehicles) {
    driverHelperMessage = "Cargando información de tus vehículos...";
  } else if (!hasVehicles) {
    driverHelperTone = "warning";
    driverHelperMessage = "Registra un vehículo con tus documentos y podrás activar el modo conductor al instante.";
  } else if (driverActive) {
    driverHelperTone = "success";
    const parts = [];
    if (driverActiveVehicle?.plate) parts.push(driverActiveVehicle.plate);
    const name = [driverActiveVehicle?.brand, driverActiveVehicle?.model].filter(Boolean).join(" ");
    if (name) parts.push(name);
    driverHelperMessage = parts.length
      ? `Modo conductor activo · ${parts.join(" · ")}`
      : "Modo conductor activo. Ya puedes publicar viajes.";
  } else {
    driverHelperMessage = "Activa el modo conductor cuando quieras y comienza a ofrecer viajes con tus vehículos registrados.";
  }

  const driverHelperClasses =
    driverHelperTone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : driverHelperTone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-sky-200 bg-sky-50 text-sky-700";
  const driverToggleDisabled = updatingRole || driverActive || loadingVehicles;
  const passengerToggleDisabled = updatingRole || passengerActive;
  const driverActionLabel = !hasDriverRole || !hasVehicles ? "Registrar mi vehículo" : "Ir a mis vehículos";
  const showDriverAction =
    !driverActive && (!hasVehicles || !hasDriverRole);
  async function handleProfileSubmit(event) {
    event.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        photoUrl: form.photoUrl,
        preferredPaymentMethod: form.preferredPaymentMethod,
        emergencyContact:
          form.emergencyContactName || form.emergencyContactPhone
            ? {
                name: form.emergencyContactName,
                phone: form.emergencyContactPhone
              }
            : null
      };
      await updateProfile(payload);
      setSuccess("Perfil actualizado correctamente");
      setEditing(false);
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || "No se pudo actualizar el perfil";
      setError(message);
    } finally {
      setSavingProfile(false);
    }
  }

  function closePasswordModal() {
    setShowPasswordModal(false);
    setResetStep("request");
    setResetPassword("");
    setResetConfirmPassword("");
    setResetToken("");
    setResetError("");
    setResetMessage("");
    setResetLoading(false);
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    if (!resetEmail) {
      setResetError("Ingresa tu correo institucional");
      return;
    }
    setResetError("");
    setResetMessage("");
    setResetLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: resetEmail });
      setResetMessage("Si el correo existe enviaremos instrucciones a tu bandeja institucional.");
      setResetStep("request-sent");
    } catch (err) {
      setResetError("No se pudo enviar el correo. Intenta de nuevo más tarde.");
    } finally {
      setResetLoading(false);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    if (!resetToken) {
      setResetError("Ingresa el código/token recibido por correo");
      return;
    }
    if (!resetPassword || resetPassword.length < 8) {
      setResetError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (resetPassword !== resetConfirmPassword) {
      setResetError("Las contraseñas no coinciden");
      return;
    }
    setResetError("");
    setResetMessage("");
    setResetLoading(true);
    try {
      await api.post("/auth/reset-password", { token: resetToken, password: resetPassword });
      setResetStep("success");
      setResetMessage("Contraseña actualizada. Inicia sesión con tu nueva contraseña.");
    } catch (err) {
      setResetError(err?.response?.data?.error || "No se pudo restablecer la contraseña");
    } finally {
      setResetLoading(false);
    }
  }

  if (!user) {
    return (
      <section className="py-6">
        <p className="text-sm text-slate-500">Inicia sesión para ver tu perfil.</p>
      </section>
    );
  }

  return (
    <section className="py-6">
      <div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Mi perfil</h1>
          <p className="text-sm text-slate-600">Consulta tu información y mantenla al día.</p>
        </header>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="grid gap-6">
        {!editing ? (
          <article className="relative overflow-hidden rounded-[32px] border border-white/40 bg-gradient-to-b from-[#003366] to-[#001a33] p-8 text-white shadow-xl">
            <button
              type="button"
              className="absolute right-6 top-6 rounded-full bg-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white hover:bg-white/30"
              onClick={() => {
                setEditing(true);
                setError("");
                setSuccess("");
              }}
            >
              Editar
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-white/40 bg-white/10">
                {form.photoUrl ? (
                  <img src={form.photoUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-2xl font-semibold">
                    {avatarFallback(user.firstName, user.lastName)}
                  </span>
                )}
              </div>
              <h2 className="mt-4 text-2xl font-semibold">
                {user.firstName} {user.lastName}
              </h2>
              <p className="text-sm text-white/80">{user.email}</p>
              <span className="mt-3 inline-flex items-center rounded-full bg-white/15 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/90">
                Rol actual: {user.activeRole === "driver" ? "Conductor" : "Pasajero"}
              </span>
            </div>

            <div className="mt-8 space-y-4 rounded-2xl bg-white/10 p-6 backdrop-blur-sm">
              <InfoRow label="Teléfono" value={user.phone || "No registrado"} />
              <InfoRow label="Cédula" value={user.universityId || "No registrada"} />
              <InfoRow
                label="Contacto de emergencia"
                value={
                  user.emergencyContact?.name
                    ? `${user.emergencyContact.name} · ${user.emergencyContact.phone || "Sin teléfono"}`
                    : "Sin contacto registrado"
                }
              />
              <InfoRow
                label="Método de pago"
                value={user.preferredPaymentMethod === "nequi" ? "Nequi" : "Efectivo"}
              />
            </div>
          </article>
        ) : (
          <form
            onSubmit={handleProfileSubmit}
            className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-xl"
          >
            <header className="mb-6 flex items-center justify-between">
              <button
                type="button"
                className="text-sm font-medium text-slate-500 hover:text-slate-700"
                onClick={() => {
                  setEditing(false);
                  setError("");
                  setSuccess("");
                  setForm({
                    firstName: user.firstName || "",
                    lastName: user.lastName || "",
                    phone: user.phone || "",
                    photoUrl: user.photoUrl || "",
                    emergencyContactName: user.emergencyContact?.name || "",
                    emergencyContactPhone: user.emergencyContact?.phone || "",
                    preferredPaymentMethod: user.preferredPaymentMethod || "cash"
                  });
                }}
              >
                Cancelar
              </button>
              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Editar perfil</p>
                <h2 className="text-xl font-semibold text-slate-900">Actualiza tu información</h2>
              </div>
              <button
                type="submit"
                className="rounded-full bg-teal-500 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white hover:bg-teal-600 disabled:opacity-60"
                disabled={savingProfile || loadingProfile}
              >
                {savingProfile ? "Guardando..." : "Guardar"}
              </button>
            </header>

            <div className="grid gap-4">
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Nombre
                <input
                  type="text"
                  value={form.firstName}
                  onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  disabled={savingProfile}
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Apellido
                <input
                  type="text"
                  value={form.lastName}
                  onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  disabled={savingProfile}
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Teléfono
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  disabled={savingProfile}
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Correo institucional
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="mt-2 w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Cédula
                <input
                  type="text"
                  value={user.universityId || ""}
                  disabled
                  className="mt-2 w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                URL foto de perfil
                <input
                  type="url"
                  value={form.photoUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, photoUrl: event.target.value }))}
                  placeholder="https://"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  disabled={savingProfile}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Contacto de emergencia
                  <input
                    type="text"
                    value={form.emergencyContactName}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, emergencyContactName: event.target.value }))
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    disabled={savingProfile}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Teléfono contacto
                  <input
                    type="tel"
                    value={form.emergencyContactPhone}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, emergencyContactPhone: event.target.value }))
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    disabled={savingProfile}
                  />
                </label>
              </div>

              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Método de pago preferido
                <select
                  value={form.preferredPaymentMethod}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, preferredPaymentMethod: event.target.value }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  disabled={savingProfile}
                >
                  <option value="cash">Efectivo</option>
                  <option value="nequi">Nequi</option>
                </select>
              </label>
            </div>
          </form>
        )}

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Modo de usuario</h3>
              <p className="mt-1 text-xs text-slate-500">
                Cambia entre pasajero y conductor en cualquier momento.
              </p>
            </div>
            {updatingRole && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500">
                Guardando...
              </span>
            )}
          </div>

          <div className="mt-6 grid gap-4">
            <article
              className={`rounded-3xl border p-5 transition-all duration-200 ${
                passengerActive
                  ? "border-cyan-200 bg-cyan-50 shadow-[0_0_0_4px_rgba(14,165,233,0.15)]"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Pasajero</p>
                  <p className="text-xs text-slate-500">Buscar viajes</p>
                  {passengerActive && (
                    <span className="mt-3 inline-flex items-center rounded-full bg-cyan-100 px-3 py-1 text-[11px] font-semibold text-cyan-700">
                      Modo activo
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  aria-pressed={passengerActive}
                  aria-label="Activar modo pasajero"
                  className={`relative h-7 w-12 rounded-full border transition-all duration-200 ${
                    passengerActive
                      ? "border-cyan-400 bg-cyan-500"
                      : "border-slate-300 bg-slate-300 hover:border-cyan-400 hover:bg-cyan-400"
                  } ${passengerToggleDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                  onClick={() => changeRole("pasajero")}
                  disabled={passengerToggleDisabled}
                >
                  <span
                    className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                      passengerActive ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </article>

            <article
              className={`rounded-3xl border p-5 transition-all duration-200 ${
                driverActive
                  ? "border-emerald-300 bg-emerald-50 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]"
                  : driverReady
                  ? "border-slate-200 bg-white"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Conductor</p>
                  <p className="text-xs text-slate-500">Ofrecer viajes</p>
                  {driverActive && (
                    <span className="mt-3 inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                      Modo activo
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  aria-pressed={driverActive}
                  aria-label="Activar modo conductor"
                  className={`relative h-7 w-12 rounded-full border transition-all duration-200 ${
                    driverActive
                      ? "border-emerald-400 bg-emerald-500"
                      : "border-slate-300 bg-slate-300 hover:border-emerald-400 hover:bg-emerald-400"
                  } ${driverToggleDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                  onClick={() => changeRole("conductor")}
                  disabled={driverToggleDisabled}
                >
                  <span
                    className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                      driverActive ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {driverHelperMessage && (
                <div className={`mt-4 rounded-2xl border px-4 py-3 text-xs ${driverHelperClasses}`}>
                  <p>{driverHelperMessage}</p>
                  {showDriverAction && (
                    <button
                      type="button"
                      className="mt-3 inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:border-slate-400"
                      onClick={() => navigate("/vehicles")}
                    >
                      {driverActionLabel}
                    </button>
                  )}
                </div>
              )}
            </article>
          </div>
        </section>

        <section className="flex flex-wrap gap-3">
          <button
            type="button"
            className="flex-1 min-w-[180px] rounded-[20px] border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            onClick={() => refreshProfile()}
            disabled={updatingRole || savingProfile}
          >
            Actualizar datos
          </button>
          <button
            type="button"
            className="flex-1 min-w-[180px] rounded-[20px] border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-100"
            onClick={() => {
              setShowPasswordModal(true);
              setResetStep("request");
              setResetPassword("");
              setResetConfirmPassword("");
              setResetToken("");
              setResetError("");
              setResetMessage("");
            }}
          >
            Restablecer contraseña
          </button>
          <button
            type="button"
            className="flex-1 min-w-[180px] rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-100"
            onClick={() => navigate("/logout")}
          >
            Cerrar sesión
          </button>
        </section>
      </div>

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="bg-slate-900 px-6 py-5 text-white">
              <button
                type="button"
                className="text-sm font-medium text-white/70 hover:text-white"
                onClick={closePasswordModal}
              >
                Volver
              </button>
              <h2 className="mt-3 text-xl font-semibold">
                {resetStep === "request" || resetStep === "request-sent" ? "Recuperar contraseña" : "Nueva contraseña"}
              </h2>
              <p className="text-sm text-white/70">
                {resetStep === "request" || resetStep === "request-sent"
                  ? "Ingresa tu correo institucional para recibir instrucciones"
                  : "Ingresa tu nueva contraseña"}
              </p>
            </div>
            <div className="px-6 py-6">
              {resetError && (
                <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {resetError}
                </div>
              )}
              {resetMessage && (
                <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {resetMessage}
                </div>
              )}

              {(resetStep === "request" || resetStep === "request-sent") && (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <label className="text-sm text-slate-600">
                    Correo institucional
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.target.value)}
                      placeholder="nombre@unisabana.edu.co"
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      disabled={resetLoading}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full rounded-full bg-teal-500 py-3 text-sm font-semibold uppercase tracking-wider text-white hover:bg-teal-600 disabled:opacity-60"
                  >
                    {resetLoading ? "Enviando..." : "Enviar instrucciones"}
                  </button>
                </form>
              )}

              {resetStep === "request-sent" && (
                <div className="mt-5 space-y-3 text-sm text-slate-600">
                  <p>
                    Revisa tu correo institucional. Si ya tienes el token puedes avanzar para definir una nueva contraseña desde aquí mismo.
                  </p>
                  <button
                    type="button"
                    className="text-teal-600 hover:text-teal-700"
                    onClick={() => {
                      setResetStep("reset");
                      setResetError("");
                      setResetMessage("");
                    }}
                  >
                    Ya tengo el token, continuar
                  </button>
                </div>
              )}

              {resetStep === "reset" && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <label className="text-sm text-slate-600">
                    Token de verificación
                    <input
                      type="text"
                      value={resetToken}
                      onChange={(event) => setResetToken(event.target.value)}
                      placeholder="Pega aquí el código del correo"
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      disabled={resetLoading}
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Nueva contraseña
                    <input
                      type="password"
                      value={resetPassword}
                      onChange={(event) => setResetPassword(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      disabled={resetLoading}
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Confirmar contraseña
                    <input
                      type="password"
                      value={resetConfirmPassword}
                      onChange={(event) => setResetConfirmPassword(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      disabled={resetLoading}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full rounded-full bg-teal-500 py-3 text-sm font-semibold uppercase tracking-wider text-white hover:bg-teal-600 disabled:opacity-60"
                  >
                    {resetLoading ? "Procesando..." : "Restablecer contraseña"}
                  </button>
                </form>
              )}

              {resetStep === "success" && (
                <div className="space-y-4 text-center text-sm text-slate-600">
                  <p>Contraseña actualizada. Puedes usarla la próxima vez que inicies sesión.</p>
                  <button
                    type="button"
                    className="w-full rounded-full bg-teal-500 py-3 text-sm font-semibold uppercase tracking-wider text-white hover:bg-teal-600"
                    onClick={closePasswordModal}
                  >
                    Entendido
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      )}
    </section>
  );
}
