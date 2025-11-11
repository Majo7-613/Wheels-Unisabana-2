import {
  normalizePlate,
  isPlateFormatValid,
  validatePlate,
  validateCapacity,
  validateBasics,
  VEHICLE_LIMITS
} from "../vehicleValidation.js";

describe("vehicleValidation helpers", () => {
  describe("normalizePlate", () => {
    it("trims and uppercases plate values", () => {
      expect(normalizePlate(" abc123 ")).toBe("ABC123");
      expect(normalizePlate("abc12d")).toBe("ABC12D");
      expect(normalizePlate(null)).toBe("");
    });
  });

  describe("isPlateFormatValid", () => {
    it("accepts standard car and motorcycle formats", () => {
      expect(isPlateFormatValid("ABC123")).toBe(true);
      expect(isPlateFormatValid("ABC12D")).toBe(true);
    });

    it("rejects unsupported patterns", () => {
      expect(isPlateFormatValid("AB1234")).toBe(false);
      expect(isPlateFormatValid("A1C123")).toBe(false);
    });
  });

  describe("validatePlate", () => {
    it("returns ok for recognized formats", () => {
      const result = validatePlate("abc123");
      expect(result.ok).toBe(true);
      expect(result.value).toBe("ABC123");
    });

    it("returns error for invalid plates", () => {
      const result = validatePlate("12A345");
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/formato/i);
    });
  });

  describe("validateCapacity", () => {
    it("accepts integer capacities inside bounds", () => {
      const result = validateCapacity(4);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(4);
    });

    it("rejects capacities outside configured range", () => {
      const result = validateCapacity(VEHICLE_LIMITS.maxCapacity + 1);
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/capacidad/i);
    });

    it("rejects non integer values", () => {
      const result = validateCapacity(3.5);
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/enteros/i);
    });
  });

  describe("validateBasics", () => {
    it("provides aggregated errors", () => {
      const result = validateBasics({ plate: "bad", capacity: 0 });
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const fields = result.errors.map((error) => error.field);
      expect(fields).toContain("plate");
      expect(fields).toContain("capacity");
    });

    it("returns normalized data when valid", () => {
      const result = validateBasics({ plate: "abc123", capacity: 4 });
      expect(result.ok).toBe(true);
      expect(result.normalized.plate).toBe("ABC123");
      expect(result.normalized.capacity).toBe(4);
    });
  });
});
