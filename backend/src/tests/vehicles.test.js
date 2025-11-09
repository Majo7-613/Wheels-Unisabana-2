import request from "supertest";
import mongoose from "mongoose";
import { jest } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import Trip from "../models/Trip.js";

let app;
let mongoServer;

jest.setTimeout(30000);

async function registerAndLogin({ emailSuffix = "driver", role = "passenger" } = {}) {
  const email = `${emailSuffix}${Date.now()}@unisabana.edu.co`;
  const password = "SuperSeguro123";

  const registerPayload = {
    email,
    password,
    firstName: "Test",
    lastName: "Driver",
    universityId: `A${Math.floor(Math.random() * 100000)}`,
    phone: "3000000000"
  };

  await request(app).post("/auth/register").send(registerPayload).expect(201);

  const loginRes = await request(app)
    .post("/auth/login")
    .send({ email, password })
    .expect(200);

  return { token: loginRes.body.token, userId: loginRes.body.user?.id, email, password };
}

function buildVehiclePayload(overrides = {}) {
  const base = {
    plate: `ABC${Math.floor(Math.random() * 900 + 100)}`,
    brand: "Chevrolet",
    model: "Spark",
    capacity: 4,
    soatExpiration: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString(),
    licenseNumber: `LIC${Math.floor(Math.random() * 900 + 100)}`,
    licenseExpiration: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180).toISOString(),
    vehiclePhotoUrl: "https://example.com/vehicle.jpg"
  };
  return { ...base, ...overrides };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();

  const appModule = await import("../app.js");
  app = appModule.default;
  await mongoose.connection.asPromise();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Vehicle.deleteMany({});
  await Trip.deleteMany({});
});

describe("Vehicles management", () => {
  it("lists multiple vehicles with metadata and switches the active one", async () => {
    const { token, userId } = await registerAndLogin({ emailSuffix: "multiveh" });

    const firstVehiclePayload = buildVehiclePayload({ plate: "AAA111" });
    await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token}`)
      .send(firstVehiclePayload)
      .expect(201);

    const secondVehiclePayload = buildVehiclePayload({ plate: "BBB222", model: "2020" });
    const createSecond = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token}`)
      .send(secondVehiclePayload)
      .expect(201);

    const listRes = await request(app)
      .get("/vehicles")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBe(2);
    listRes.body.forEach((vehicle) => {
      expect(vehicle.meta).toBeDefined();
      expect(vehicle.meta.status).toBeDefined();
      expect(Array.isArray(vehicle.meta.warnings)).toBe(true);
    });

    await Vehicle.findByIdAndUpdate(createSecond.body._id, {
      status: "verified",
      statusUpdatedAt: new Date()
    });

    await request(app)
      .put(`/vehicles/${createSecond.body._id}/activate`)
      .set("Authorization", `Bearer ${token}`)
      .send()
      .expect(200);

    const refreshedUser = await User.findById(userId).lean();
    expect(String(refreshedUser.activeVehicle)).toBe(String(createSecond.body._id));
  });

  it("prevents deleting a vehicle while trips are scheduled", async () => {
    const { token, userId } = await registerAndLogin({ emailSuffix: "blockdelete" });

    const createVehicleRes = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token}`)
      .send(buildVehiclePayload({ plate: "ZZZ999" }));

    expect(createVehicleRes.status).toBe(201);
    const vehicleId = createVehicleRes.body._id;

    const tripPayload = {
      vehicleId,
      origin: "Campus Norte",
      destination: "Campus Puente del Comun",
      departureAt: new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString(),
      seatsTotal: 3,
      pricePerSeat: 5000
    };

    const tripRes = await request(app)
      .post("/trips")
      .set("Authorization", `Bearer ${token}`)
      .send(tripPayload);

    expect(tripRes.status).toBe(201);
    const tripId = tripRes.body?.trip?._id;
    expect(tripId).toBeTruthy();

    const deleteBlocked = await request(app)
      .delete(`/vehicles/${vehicleId}`)
      .set("Authorization", `Bearer ${token}`)
      .send();

    expect(deleteBlocked.status).toBe(400);
    expect(deleteBlocked.body?.error).toMatch(/viajes activos/i);

    await request(app)
      .put(`/trips/${tripId}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send()
      .expect(200);

    const deleteOk = await request(app)
      .delete(`/vehicles/${vehicleId}`)
      .set("Authorization", `Bearer ${token}`)
      .send();

    expect(deleteOk.status).toBe(200);
    expect(deleteOk.body).toEqual({ ok: true });

    const userAfterDelete = await User.findById(userId).lean();
    expect(userAfterDelete.roles).not.toContain("driver");
    expect(userAfterDelete.activeVehicle).toBeNull();
  });
});
