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
  const f = (firstName || "").trim().charAt(0) || "";
  const l = (lastName || "").trim().charAt(0) || "";
  const initials = `${f}${l}`.toUpperCase();
  return initials || "WS";
};

function InfoRow({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/5 p-4 text-left">
      <p className="text-xs uppercase tracking-[0.3em] text-white/60">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value ?? "—"}</p>
    </div>
  );
}

export default function ProfilePage() {
  const { user, refreshProfile, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingRole, setUpdatingRole] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);

  const availableRoles = useMemo(() => user?.roles || [], [user?.roles]);
  const hasDriverRole = availableRoles.includes("driver") || availableRoles.includes("conductor");

  useEffect(() => {
    if (!user) {
      setForm(emptyForm);
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
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    async function loadVehicles() {
      if (!user?.id || !hasDriverRole) return setVehicles([]);
      setLoadingVehicles(true);
      try {
        const { data } = await api.get("/vehicles");
        if (!cancelled) setVehicles(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setVehicles([]);
      } finally {
        if (!cancelled) setLoadingVehicles(false);
      }
    }
    loadVehicles();
    return () => {
      cancelled = true;
    };
  }, [user?.id, hasDriverRole]);

  async function changeRole(role) {
    if (!role || role === user?.activeRole) return;
    setUpdatingRole(true);
    setError("");
    setSuccess("");
    try {
      await api.put("/auth/role", { role });
      await refreshProfile();
      setSuccess("Rol actualizado");
    } catch (err) {
      setError(err?.response?.data?.error || "No se pudo actualizar el rol");
    } finally {
      setUpdatingRole(false);
    }
  }

  async function onSave(e) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
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
            ? { name: form.emergencyContactName, phone: form.emergencyContactPhone }
            : null
      };
      await updateProfile(payload);
      setSuccess("Perfil actualizado correctamente");
      setEditing(false);
    } catch (err) {
      setError(err?.response?.data?.error || "No se pudo actualizar el perfil");
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <section className="py-6">
        <p className="text-sm text-slate-500">Inicia sesión para ver tu perfil.</p>
      </section>
    );
  }

  const driverActive = ["conductor", "driver"].includes(user?.activeRole);
  const passengerActive = ["pasajero", "passenger"].includes(user?.activeRole) || !driverActive;

  return (
    <section className="py-6">
      <div>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Mi perfil</h1>
          <p className="text-sm text-slate-600">Consulta tu información y mantenla al día.</p>
        </header>

        {error && <div className="mb-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {success && <div className="mb-4 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

        <div className="grid gap-6">
          <article className="relative overflow-hidden rounded-[32px] border border-white/40 bg-gradient-to-b from-[#003366] to-[#001a33] p-6 text-white shadow">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-full bg-white/10 flex items-center justify-center text-2xl font-semibold">{avatarFallback(user.firstName, user.lastName)}</div>
              <div>
                <h2 className="text-2xl font-semibold">{user.firstName} {user.lastName}</h2>
                <p className="text-sm text-white/80">{user.email}</p>
                <span className="mt-2 inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/90">Rol: {user.activeRole}</span>
              </div>
            </div>
          </article>

          {!editing ? (
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4">
                <InfoRow label="Nombre" value={`${user.firstName || ""} ${user.lastName || ""}`.trim() || "—"} />
                <InfoRow label="Correo" value={user.email} />
                <InfoRow label="Cédula" value={user.universityId || "—"} />
                <InfoRow label="Teléfono" value={user.phone || "—"} />
              </div>
            </div>
          ) : (
            <form onSubmit={onSave} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4">
                <label className="text-xs">
                  Nombre
                  <input className="mt-2 w-full rounded border px-3 py-2" value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} />
                </label>
                <label className="text-xs">
                  Apellido
                  <input className="mt-2 w-full rounded border px-3 py-2" value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} />
                </label>
                <label className="text-xs">
                  Teléfono
                  <input className="mt-2 w-full rounded border px-3 py-2" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" className="px-4 py-2 rounded border" onClick={() => { setEditing(false); setForm(emptyForm); }}>Cancelar</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-teal-500 text-white">{saving ? 'Guardando...' : 'Guardar'}</button>
                </div>
              </div>
            </form>
          )}

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Modo de usuario</h3>
                <p className="mt-1 text-xs text-slate-500">Cambia entre pasajero y conductor.</p>
              </div>
              {updatingRole && <span className="text-sm text-slate-500">Guardando...</span>}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className={`p-4 rounded-lg ${passengerActive ? 'bg-cyan-50 border-cyan-200' : 'bg-slate-50 border-slate-200'} border`}>
                <p className="font-semibold">Pasajero</p>
                <p className="text-xs text-slate-500">Buscar viajes</p>
                <div className="mt-3">
                  <button className="px-3 py-1 rounded bg-cyan-500 text-white" disabled={updatingRole} onClick={() => changeRole('pasajero')}>Activar pasajero</button>
                </div>
              </div>

              <div className={`p-4 rounded-lg ${driverActive ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'} border`}>
                <p className="font-semibold">Conductor</p>
                <p className="text-xs text-slate-500">Ofrecer viajes</p>
                <div className="mt-3">
                  <button className="px-3 py-1 rounded bg-emerald-500 text-white" disabled={updatingRole || !hasDriverRole || !vehicles.length} onClick={() => changeRole('conductor')}>Activar conductor</button>
                </div>
                <div className="mt-2 text-xs text-slate-600">{loadingVehicles ? 'Cargando vehículos...' : vehicles.length ? vehicles[0]?.plate || '—' : 'Sin vehículos registrados'}</div>
              </div>
            </div>
          </section>

          <div className="flex gap-3">
            <button className="flex-1 rounded border px-4 py-2" onClick={() => refreshProfile()}>Actualizar datos</button>
            <button className="flex-1 rounded border px-4 py-2 bg-blue-50" onClick={() => setShowResetModal(true)}>Restablecer contraseña</button>
            <button className="flex-1 rounded border px-4 py-2 bg-red-50" onClick={() => navigate('/logout')}>Cerrar sesión</button>
          </div>

          {showResetModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white p-6 rounded shadow-md w-full max-w-md">
                <h4 className="font-semibold mb-2">Restablecer contraseña</h4>
                <p className="text-sm text-slate-600 mb-4">Se enviarán instrucciones a tu correo institucional.</p>
                <div className="flex justify-end gap-2">
                  <button className="px-4 py-2" onClick={() => setShowResetModal(false)}>Cerrar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
