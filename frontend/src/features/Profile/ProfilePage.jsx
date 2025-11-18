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

// --- Normalizar rol para frontend
function normalizeRole(role) {
  if (!role) return "pasajero";
  if (role === "driver" || role === "conductor") return "conductor";
  if (role === "passenger" || role === "pasajero") return "pasajero";
  return "pasajero";
}

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

  // --- Cargar info inicial del usuario
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

  // --- Cargar vehículos si tiene rol de conductor
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
        if (!cancelled) setVehicles([]);
      } finally {
        if (!cancelled) setLoadingVehicles(false);
      }
    }
    loadVehicles();
    return () => {
      cancelled = true;
    };
  }, [user?.id, rolesKey]);

  // --- Cambiar rol activo
  async function changeRole(role) {
    const backendRole = role === "conductor" ? "driver" : "passenger";
    const currentNormalized = normalizeRole(user?.activeRole);
    if (!role || role === currentNormalized) return;

    setUpdatingRole(true);
    setError("");
    setSuccess("");

    try {
      const { data } = await api.put("/auth/role", { role: backendRole });
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

  const normalizedRole = normalizeRole(user?.activeRole);
  const passengerActive = normalizedRole === "pasajero";
  const driverActive = normalizedRole === "conductor";
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

  if (loadingVehicles) driverHelperMessage = "Cargando información de tus vehículos...";
  else if (!hasVehicles) {
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
  const showDriverAction = !driverActive && (!hasVehicles || !hasDriverRole);

  // --- Actualizar perfil
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

  // --- Forgot/Reset password functions 
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
      {/* ... todo tu JSX existente ... */}
      {/* Solo asegurarse de usar normalizedRole en todo donde se muestra o se compara activeRole */}
    </section>
  );
}
