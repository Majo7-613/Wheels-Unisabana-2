import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { jest } from "@jest/globals";
import User from "../src/models/User.js";
import Vehicle from "../src/models/Vehicle.js";

let app;
let mongoServer;

jest.setTimeout(30000);

async function bootstrapDriver(email = "driver@unisabana.edu.co") {
  const password = "SecurePass123";
  const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  const digits = String(Math.floor(Math.random() * 900) + 100);
  const paddedPlate = `${letters}${digits}`;

  await request(app).post("/auth/register").send({
    email,
    firstName: "Driver",
    lastName: "Test",
    universityId: "A" + Math.floor(Math.random() * 10_000_000).toString().padStart(8, "0"),
    phone: "3010000000",
    password
  });

  const loginRes = await request(app).post("/auth/login").send({ email, password });
  const token = loginRes.body.token;

  const vehicleRes = await request(app)
    .post("/vehicles")
    .set("Authorization", `Bearer ${token}`)
    .send({
      plate: paddedPlate,
      brand: "Renault",
      model: "Logan",
      capacity: 4,
      soatExpiration: new Date(Date.now() + 86400000 * 10).toISOString(),
      licenseNumber: `LIC-${paddedPlate}`,
      licenseExpiration: new Date(Date.now() + 86400000 * 200).toISOString(),
      vehiclePhotoUrl: "https://example.com/vehicle.jpg",
      soatPhotoUrl: "https://example.com/soat.pdf",
      licensePhotoUrl: "https://example.com/license.pdf"
    })
    .expect(201);

  return { token, vehicleId: vehicleRes.body._id };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();
  const appModule = await import("../src/app.js");
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
});

describe("Vehicle pickup points routes", () => {
  it("allows drivers to add, list, update, and delete pickup points", async () => {
    const { token, vehicleId } = await bootstrapDriver();

    const createRes = await request(app)
      .post(`/vehicles/${vehicleId}/pickup-points`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Puente Madera",
        description: "Entrada principal",
        lat: 4.8623,
        lng: -74.0509
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body?.pickupPoint?.name).toBe("Puente Madera");
    const pointId = createRes.body?.pickupPoint?._id;
    expect(pointId).toBeTruthy();

    const listRes = await request(app)
      .get(`/vehicles/${vehicleId}/pickup-points`)
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body?.pickupPoints).toHaveLength(1);
    expect(listRes.body.pickupPoints[0].description).toBe("Entrada principal");

    const updateRes = await request(app)
      .put(`/vehicles/${vehicleId}/pickup-points/${pointId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Puente Madera",
        description: "Actualizado",
        lat: 4.8625,
        lng: -74.051
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body?.pickupPoint?.description).toBe("Actualizado");

    const deleteRes = await request(app)
      .delete(`/vehicles/${vehicleId}/pickup-points/${pointId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({ ok: true });

    const afterDelete = await request(app)
      .get(`/vehicles/${vehicleId}/pickup-points`)
      .set("Authorization", `Bearer ${token}`);
    expect(afterDelete.body?.pickupPoints).toHaveLength(0);
  });

  it("rejects pickup points with invalid coordinates", async () => {
    const { token, vehicleId } = await bootstrapDriver("coords@unisabana.edu.co");
    const res = await request(app)
      .post(`/vehicles/${vehicleId}/pickup-points`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Fuera", lat: 200, lng: 50 });
    expect(res.status).toBe(400);
    expect(res.body?.error).toBe("Coordenadas fuera de rango");
  });

  it("prevents drivers from modifying pickup points on vehicles they do not own", async () => {
    const owner = await bootstrapDriver("owner@unisabana.edu.co");
    const outsider = await bootstrapDriver("outsider@unisabana.edu.co");

    const res = await request(app)
      .post(`/vehicles/${owner.vehicleId}/pickup-points`)
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({ name: "Ad portas", lat: 4.85, lng: -74.05 });

    expect(res.status).toBe(404);
  });
});
