import request from "supertest";
import mongoose from "mongoose";
import crypto from "crypto";
import { jest } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import PasswordReset from "../models/PasswordReset.js";
import { clearRevokedTokens } from "../utils/tokenBlacklist.js";

let app;
let mongoServer;

jest.setTimeout(30000);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGO_URI = uri;

  const appModule = await import("../app.js");
  app = appModule.default;
  await mongoose.connection.asPromise();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  await User.deleteMany({});
  await Vehicle.deleteMany({});
  await PasswordReset.deleteMany({});
  clearRevokedTokens();
});

describe("Auth routes", () => {
  it("should reject non-institutional email", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "user@example.com",
      firstName: "Test",
      lastName: "User",
      universityId: "12345",
      phone: "3001234567",
      password: "secreto123"
    });
    expect(res.status).toBe(400);
  });

  it("should register a user with institutional email and hash the password", async () => {
    const payload = {
      email: "test@unisabana.edu.co",
      firstName: "Test",
      lastName: "User",
      universityId: "A00123456",
      phone: "3001234567",
      password: "SecurePass123",
      photoUrl: "https://example.com/avatar.png"
    };

    const res = await request(app).post("/auth/register").send(payload);

    expect(res.status).toBe(201);
    expect(res.body?.user?.email).toBe(payload.email.toLowerCase());
    expect(res.body?.user?.firstName).toBe(payload.firstName);

    const storedUser = await User.findOne({ email: payload.email.toLowerCase() }).lean();
    expect(storedUser).toBeTruthy();
    expect(storedUser.passwordHash).toBeDefined();
    expect(storedUser.passwordHash).not.toBe(payload.password);
    expect(storedUser.roles).toContain("passenger");
  });

  it("should prevent duplicate email registrations", async () => {
    const payload = {
      email: "duplicate@unisabana.edu.co",
      firstName: "Dup",
      lastName: "User",
      universityId: "A00011111",
      phone: "3000000000",
      password: "SecurePass123"
    };

    await request(app).post("/auth/register").send(payload).expect(201);
    const second = await request(app).post("/auth/register").send(payload);

    expect(second.status).toBe(409);
    expect(second.body?.error).toBe("Email ya registrado");
  });

  it("should reject invalid login attempts with friendly message", async () => {
    const payload = {
      email: "valid@unisabana.edu.co",
      firstName: "Valid",
      lastName: "User",
      universityId: "A00022222",
      phone: "3005550000",
      password: "SecurePass123"
    };

    await request(app).post("/auth/register").send(payload).expect(201);

    const wrongPassword = await request(app)
      .post("/auth/login")
      .send({ email: payload.email, password: "WrongPass123" });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body?.error).toBe("Credenciales inválidas");

    const unknownUser = await request(app)
      .post("/auth/login")
      .send({ email: "missing@unisabana.edu.co", password: "SecurePass123" });
    expect(unknownUser.status).toBe(401);
    expect(unknownUser.body?.error).toBe("Credenciales inválidas");
  });

  it("issues short-lived hashed password reset tokens", async () => {
    const payload = {
      email: "forgot@unisabana.edu.co",
      firstName: "Forgot",
      lastName: "User",
      universityId: "A00055555",
      phone: "3005550101",
      password: "SecurePass123"
    };

    await request(app).post("/auth/register").send(payload).expect(201);
    const createdUser = await User.findOne({ email: payload.email.toLowerCase() });
    expect(createdUser).toBeTruthy();

    const randomSpy = jest.spyOn(crypto, "randomBytes");
    try {
      randomSpy.mockReturnValueOnce(Buffer.from("a".repeat(64), "hex"));
      await request(app).post("/auth/forgot-password").send({ email: payload.email }).expect(200);

      let tokens = await PasswordReset.find({ userId: createdUser._id }).sort({ createdAt: 1 }).lean();
      expect(tokens).toHaveLength(1);
      const expectedHash = crypto.createHash("sha256").update("a".repeat(64)).digest("hex");
      expect(tokens[0].token).toBe(expectedHash);
      expect(tokens[0].used).toBe(false);
      const span = tokens[0].expiresAt.getTime() - tokens[0].createdAt.getTime();
      const ttlMs = 1000 * 60 * 15;
      expect(span).toBeGreaterThanOrEqual(ttlMs - 1000);
      expect(span).toBeLessThanOrEqual(ttlMs + 1000);

      randomSpy.mockReturnValueOnce(Buffer.from("b".repeat(64), "hex"));
      await request(app).post("/auth/forgot-password").send({ email: payload.email }).expect(200);

      tokens = await PasswordReset.find({ userId: createdUser._id }).sort({ createdAt: 1 }).lean();
      expect(tokens).toHaveLength(2);
      expect(tokens[0].used).toBe(true);
      expect(tokens[1].used).toBe(false);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("resets password exactly once per token", async () => {
    const payload = {
      email: "reset@unisabana.edu.co",
      firstName: "Reset",
      lastName: "User",
      universityId: "A00066666",
      phone: "3005550202",
      password: "SecurePass123"
    };

    await request(app).post("/auth/register").send(payload).expect(201);

    const randomSpy = jest.spyOn(crypto, "randomBytes");
    randomSpy.mockReturnValueOnce(Buffer.from("c".repeat(64), "hex"));
    await request(app).post("/auth/forgot-password").send({ email: payload.email }).expect(200);
    randomSpy.mockRestore();

    const rawToken = "c".repeat(64);
    const resetRes = await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, password: "NuevoPass123" });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body?.ok).toBe(true);

    const loginNew = await request(app)
      .post("/auth/login")
      .send({ email: payload.email, password: "NuevoPass123" });
    expect(loginNew.status).toBe(200);

    const loginOld = await request(app)
      .post("/auth/login")
      .send({ email: payload.email, password: payload.password });
    expect(loginOld.status).toBe(401);

    const secondReset = await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, password: "OtraClave123" });
    expect(secondReset.status).toBe(400);
    expect(secondReset.body?.error).toBe("Token inválido o expirado");
  });

  it("rejects expired password reset tokens", async () => {
    const payload = {
      email: "expired@unisabana.edu.co",
      firstName: "Expired",
      lastName: "User",
      universityId: "A00077777",
      phone: "3005550303",
      password: "SecurePass123"
    };

    await request(app).post("/auth/register").send(payload).expect(201);
    const user = await User.findOne({ email: payload.email.toLowerCase() });
    expect(user).toBeTruthy();

    const rawToken = "d".repeat(64);
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await PasswordReset.create({
      userId: user._id,
      token: tokenHash,
      expiresAt: new Date(Date.now() - 1000),
      used: false
    });

    const res = await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, password: "OtraClave123" });
    expect(res.status).toBe(400);
    expect(res.body?.error).toBe("Token inválido o expirado");
  });

  it("requires authentication to logout", async () => {
    const res = await request(app).post("/auth/logout").send();
    expect(res.status).toBe(401);
    expect(res.body?.error).toBe("No token");
  });

  it("should revoke token on logout and block further access", async () => {
    const payload = {
      email: "logout@unisabana.edu.co",
      firstName: "Bye",
      lastName: "User",
      universityId: "A00033333",
      phone: "3010000000",
      password: "SecurePass123"
    };

    await request(app).post("/auth/register").send(payload).expect(201);
    const loginRes = await request(app).post("/auth/login").send({ email: payload.email, password: payload.password });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.token;

    const profileRes = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send();
    expect(profileRes.status).toBe(200);

    const logoutRes = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .send();

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toEqual({ ok: true });

    const afterLogout = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send();
    expect(afterLogout.status).toBe(401);

    const secondLogout = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .send();
    expect(secondLogout.status).toBe(401);
  });
  it("should track active vehicle when creating and switching", async () => {
    const payload = {
      email: "driver@unisabana.edu.co",
      firstName: "Driver",
      lastName: "User",
      universityId: "A00044444",
      phone: "3005556666",
      password: "SecurePass123",
      role: "driver",
      vehicle: {
        plate: "AAA111",
        brand: "Renault",
        model: "Logan",
        capacity: 4,
        vehiclePhotoUrl: "https://example.com/vehicle.jpg",
        soatPhotoUrl: "https://example.com/soat.jpg",
        licensePhotoUrl: "https://example.com/license.jpg",
        soatExpiration: new Date(Date.now() + 86400000).toISOString(),
        licenseNumber: "LIC001",
        licenseExpiration: new Date(Date.now() + 86400000 * 200).toISOString()
      }
    };

    await request(app).post("/auth/register").send(payload).expect(201);
    const userAfterRegister = await User.findOne({ email: payload.email }).lean();
    expect(userAfterRegister.activeVehicle).toBeTruthy();

    const loginRes = await request(app).post("/auth/login").send({ email: payload.email, password: payload.password });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.token;

    const secondVehicle = {
      plate: "BBB222",
      brand: "Kia",
      model: "Rio",
      capacity: 4,
      soatExpiration: new Date(Date.now() + 86400000 * 5).toISOString(),
      licenseNumber: "LIC002",
      licenseExpiration: new Date(Date.now() + 86400000 * 400).toISOString(),
      vehiclePhotoUrl: "https://example.com/vehicle2.jpg",
      soatPhotoUrl: "https://example.com/soat.pdf",
      licensePhotoUrl: "https://example.com/license.pdf"
    };

    const createRes = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token}`)
      .send(secondVehicle);
    expect(createRes.status).toBe(201);
    const createdVehicleId = createRes.body._id;

    await Vehicle.findByIdAndUpdate(createdVehicleId, {
      status: "verified",
      statusUpdatedAt: new Date()
    });

    const activateRes = await request(app)
      .put(`/vehicles/${createdVehicleId}/activate`)
      .set("Authorization", `Bearer ${token}`)
      .send();
    expect(activateRes.status).toBe(200);

    const refreshedUser = await User.findOne({ email: payload.email }).lean();
    expect(String(refreshedUser.activeVehicle)).toBe(String(createdVehicleId));
  });

  it("prevents switching to driver without verified vehicles", async () => {
    const payload = {
      email: "switcher@unisabana.edu.co",
      firstName: "Switch",
      lastName: "Tester",
      universityId: "A00055555",
      phone: "3005557777",
      password: "SecurePass123"
    };

    await request(app).post("/auth/register").send(payload).expect(201);

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: payload.email, password: payload.password })
      .expect(200);

    const token = loginRes.body.token;

    const noRoleRes = await request(app)
      .put("/auth/role")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "driver" });
    expect(noRoleRes.status).toBe(403);

    const vehiclePayload = {
      plate: "DDD333",
      brand: "Mazda",
      model: "CX-30",
      capacity: 4,
      soatExpiration: new Date(Date.now() + 86400000 * 90).toISOString(),
      licenseNumber: "LIC333",
      licenseExpiration: new Date(Date.now() + 86400000 * 180).toISOString(),
      vehiclePhotoUrl: "https://example.com/mazda.jpg",
      soatPhotoUrl: "https://example.com/soat.pdf",
      licensePhotoUrl: "https://example.com/license.pdf"
    };

    const createVehicleRes = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token}`)
      .send(vehiclePayload)
      .expect(201);

    expect(createVehicleRes.body._id).toBeTruthy();

    const pendingSwitch = await request(app)
      .put("/auth/role")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "driver" });
    expect(pendingSwitch.status).toBe(400);
    expect(pendingSwitch.body?.error).toMatch(/verific|document/i);

    await Vehicle.updateOne({ plate: vehiclePayload.plate }, { status: "verified", statusUpdatedAt: new Date() });

    const driverSwitch = await request(app)
      .put("/auth/role")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "driver" })
      .expect(200);
    expect(driverSwitch.body?.user?.activeRole).toBe("driver");

    const passengerSwitch = await request(app)
      .put("/auth/role")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "passenger" })
      .expect(200);
    expect(passengerSwitch.body?.user?.activeRole).toBe("passenger");
  });
});
