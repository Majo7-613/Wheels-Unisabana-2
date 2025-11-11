import request from "supertest";
import mongoose from "mongoose";
import crypto from "crypto";
import User from "../src/models/User.js";
import Vehicle from "../src/models/Vehicle.js";
import PasswordReset from "../src/models/PasswordReset.js";
import dotenv from "dotenv";
import { jest } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";

dotenv.config();
let app;
let mongoServer;

jest.setTimeout(30000);

const passengerPayload = (overrides = {}) => ({
  firstName: "Test",
  lastName: "User",
  universityId: "ID12345",
  phone: "3001234567",
  email: "test@unisabana.edu.co",
  password: "secret123",
  ...overrides
});

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGO_URI = uri;

  const appModule = await import("../src/app.js");
  app = appModule.default;
  await mongoose.connection.asPromise();
});

afterEach(async () => {
  await User.deleteMany({});
  await Vehicle.deleteMany({});
  await PasswordReset.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe("Auth API", () => {
  test("register successful with institutional email", async () => {
    const res = await request(app).post("/auth/register").send(passengerPayload());
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("test@unisabana.edu.co");
    expect(res.body.user.roles).toContain("passenger");
  });

  test("register rejects non-institutional email", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send(passengerPayload({ email: "x@gmail.com" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/institucional/);
  });

  test("duplicate email returns 409", async () => {
    await request(app).post("/auth/register").send(passengerPayload({ email: "dup@unisabana.edu.co" }));
    const res = await request(app).post("/auth/register").send(passengerPayload({ email: "dup@unisabana.edu.co" }));
    expect(res.status).toBe(409);
  });

  test("login works with correct credentials", async () => {
    const email = "login@unisabana.edu.co";
    await request(app).post("/auth/register").send(passengerPayload({ email }));
    const res = await request(app).post("/auth/login").send({ email, password: "secret123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(email);
  });

  test("login rejects invalid credentials with friendly error", async () => {
    const email = "invalid@unisabana.edu.co";
    await request(app).post("/auth/register").send(passengerPayload({ email }));

    const wrongPassword = await request(app).post("/auth/login").send({ email, password: "wrongpass" });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error).toBe("Credenciales inválidas");

    const unknownUser = await request(app)
      .post("/auth/login")
      .send({ email: "nouser@unisabana.edu.co", password: "secret123" });
    expect(unknownUser.status).toBe(401);
    expect(unknownUser.body.error).toBe("Credenciales inválidas");
  });

  test("logout clears session server-side placeholder", async () => {
    const email = "logout@unisabana.edu.co";
    await request(app).post("/auth/register").send(passengerPayload({ email }));
    const loginRes = await request(app).post("/auth/login").send({ email, password: "secret123" });
    expect(loginRes.status).toBe(200);

    const logoutRes = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${loginRes.body.token}`)
      .send();

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toEqual({ ok: true });
  });

  test("forgot-password creates a token and reset works", async () => {
    const email = "forgot@unisabana.edu.co";
    await request(app).post("/auth/register").send(passengerPayload({ email }));
    const tokenRaw = "e".repeat(64);
    const randomSpy = jest.spyOn(crypto, "randomBytes");
    randomSpy.mockReturnValueOnce(Buffer.from(tokenRaw, "hex"));
    const res = await request(app).post("/auth/forgot-password").send({ email });
    randomSpy.mockRestore();
    expect(res.status).toBe(200);
    // token created
    const pr = await PasswordReset.findOne({}).lean();
    expect(pr).toBeTruthy();
    const expectedHash = crypto.createHash("sha256").update(tokenRaw).digest("hex");
    expect(pr.token).toBe(expectedHash);

    const reset = await request(app).post("/auth/reset-password").send({ token: tokenRaw, password: "newpass123" });
    expect(reset.status).toBe(200);
    // login with new password
    const login = await request(app).post("/auth/login").send({ email, password: "newpass123" });
    expect(login.status).toBe(200);
  });

  test("driver can register additional vehicle and activate it", async () => {
    const email = "driver@unisabana.edu.co";
    const registerPayload = passengerPayload({
      email,
      role: "driver",
      vehicle: {
        plate: "ABC123",
        brand: "Toyota",
        model: "Corolla",
        capacity: 4,
        vehiclePhotoUrl: "https://example.com/car.jpg",
        soatPhotoUrl: "https://example.com/soat.jpg",
        licensePhotoUrl: "https://example.com/license.jpg",
        soatExpiration: new Date(Date.now() + 86400000).toISOString(),
        licenseNumber: "LIC123",
        licenseExpiration: new Date(Date.now() + 86400000 * 365).toISOString()
      }
    });

    await request(app).post("/auth/register").send(registerPayload).expect(201);

    const userAfterRegister = await User.findOne({ email }).lean();
    expect(userAfterRegister.activeVehicle).toBeTruthy();

    const loginRes = await request(app).post("/auth/login").send({ email, password: registerPayload.password });
    expect(loginRes.status).toBe(200);

    const token = loginRes.body.token;
    const secondaryVehiclePayload = {
      plate: "DEF456",
      brand: "Mazda",
      model: "3",
      capacity: 4,
      soatExpiration: new Date(Date.now() + 86400000 * 5).toISOString(),
      licenseNumber: "LIC789",
      licenseExpiration: new Date(Date.now() + 86400000 * 400).toISOString(),
      vehiclePhotoUrl: "https://example.com/vehicle2.jpg",
      soatPhotoUrl: "https://example.com/soat.pdf",
      licensePhotoUrl: "https://example.com/license.pdf"
    };

    const createVehicleRes = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token}`)
      .send(secondaryVehiclePayload);
    expect(createVehicleRes.status).toBe(201);

    const createdVehicleId = createVehicleRes.body._id;

    await Vehicle.findByIdAndUpdate(createdVehicleId, {
      status: "verified",
      statusUpdatedAt: new Date()
    });

    const activateRes = await request(app)
      .put(`/vehicles/${createdVehicleId}/activate`)
      .set("Authorization", `Bearer ${token}`)
      .send();
    expect(activateRes.status).toBe(200);

    const refreshedUser = await User.findOne({ email }).lean();
    expect(String(refreshedUser.activeVehicle)).toBe(String(createdVehicleId));
  });
});
