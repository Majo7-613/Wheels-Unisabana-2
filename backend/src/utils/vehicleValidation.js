const DEFAULT_MAX_CAPACITY = Number(process.env.VEHICLE_MAX_CAPACITY || 8);
const MIN_CAPACITY = Number(process.env.VEHICLE_MIN_CAPACITY || 1);

// Colombian plate formats: private/public cars AAA123, motorcycles AAA12D.
const CAR_PLATE_REGEX = /^[A-Z]{3}[0-9]{3}$/;
const MOTORCYCLE_PLATE_REGEX = /^[A-Z]{3}[0-9]{2}[A-Z]$/;
const ALLOWED_PLATE_PATTERNS = [CAR_PLATE_REGEX, MOTORCYCLE_PLATE_REGEX];

export function normalizePlate(rawValue) {
  if (typeof rawValue !== "string") return "";
  return rawValue.trim().toUpperCase();
}

export function isPlateFormatValid(plate) {
  if (!plate) return false;
  return ALLOWED_PLATE_PATTERNS.some((regex) => regex.test(plate));
}

export function validatePlate(rawValue) {
  const normalized = normalizePlate(rawValue);
  if (!normalized) {
    return {
      ok: false,
      value: normalized,
      message: "Ingresa la placa del vehículo"
    };
  }
  if (!isPlateFormatValid(normalized)) {
    return {
      ok: false,
      value: normalized,
      message: "Formato de placa inválido. Usa un formato como ABC123 o ABC12D"
    };
  }
  return { ok: true, value: normalized };
}

export function validateCapacity(rawValue, { min = MIN_CAPACITY, max = DEFAULT_MAX_CAPACITY } = {}) {
  const numeric = Number(rawValue);
  if (!Number.isInteger(numeric)) {
    return {
      ok: false,
      value: numeric,
      message: "Ingresa la capacidad en puestos enteros"
    };
  }
  if (numeric < min || numeric > max) {
    return {
      ok: false,
      value: numeric,
      message: `La capacidad permitida va de ${min} a ${max} puestos`
    };
  }
  return { ok: true, value: numeric };
}

export function validateBasics({ plate, capacity }, options = {}) {
  const errors = [];
  const plateResult = validatePlate(plate);
  const capacityResult = validateCapacity(capacity, options);

  if (!plateResult.ok) {
    errors.push({ field: "plate", message: plateResult.message });
  }
  if (!capacityResult.ok) {
    errors.push({ field: "capacity", message: capacityResult.message });
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      plate: plateResult.value,
      capacity: capacityResult.value
    }
  };
}

export const VEHICLE_LIMITS = {
  minCapacity: MIN_CAPACITY,
  maxCapacity: DEFAULT_MAX_CAPACITY
};

export default {
  normalizePlate,
  isPlateFormatValid,
  validatePlate,
  validateCapacity,
  validateBasics,
  VEHICLE_LIMITS
};
