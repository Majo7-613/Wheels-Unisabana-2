// Core Express app composition: config, middlewares, DB, routes, docs, and error handling.
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./utils/swagger.js";
// Feature route modules grouped by domain for separation of concerns.
import authRoutes from "./routes/auth.js";
import vehicleRoutes from "./routes/vehicles.js";
import tripRoutes from "./routes/trips.js";
import ratingRoutes from "./routes/ratings.js";
import mapsRoutes from "./routes/maps.js";
import navigationRoutes from "./routes/navigation.js";
import userRoutes from "./routes/users.js";

// Initialize environment variables early; prevents undefined config at runtime.
dotenv.config();

// Create the Express app instance; this is exported for reuse in tests (Supertest).
const app = express();

// CORS middleware enables cross-origin requests from the frontend during development.
// In production, restrict origins to trusted hosts for security.
app.use(cors());

// Built-in JSON body parser; exposes req.body as a JavaScript object for APIs.
app.use(express.json());

// Serve uploaded assets (vehicle documents, photos) from configurable directory.
const uploadsDir = path.resolve(process.cwd(), process.env.UPLOADS_DIR || "uploads");
app.use("/uploads", express.static(uploadsDir));

// Mongoose configuration tuned for dev: fail-fast without buffering (no silent queueing when DB is down)
// and strictQuery to avoid ambiguous query parsing.
mongoose.set("bufferCommands", false);
mongoose.set("strictQuery", true);

// Conditional DB connection: app boots without Mongo to keep health/docs available.
// Auth and persistence endpoints will surface 503 until MONGO_URI is configured.
const mongoUri = process.env.MONGO_URI;
if (mongoUri) {
  mongoose
    .connect(mongoUri, { dbName: "wheels" })
    .then(() => console.log("MongoDB conectado"))
    .catch((e) => console.error("Error MongoDB", e.message));
} else {
  console.warn("MONGO_URI no definido; se omite conexión a MongoDB");
}

// Convenience redirect to API docs when hitting the root; improves DX in dev environments.
app.get("/", (_req, res) => res.redirect("/api-docs"));

// Mount feature routes by resource to keep routing table organized and maintainable.
app.use("/auth", authRoutes);
app.use("/vehicles", vehicleRoutes);
app.use("/trips", tripRoutes);
app.use("/ratings", ratingRoutes);
app.use("/maps", mapsRoutes);
app.use("/navigation", navigationRoutes);
app.use("/users", userRoutes);

// Serve Swagger UI with the OpenAPI spec; this gives interactive API documentation in dev and QA.
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Lightweight healthcheck used by Docker, uptime monitors, and quick local diagnostics.
app.get("/health", (_req, res) => res.json({ ok: true }));

// Global error handler to avoid process crashes on uncaught exceptions in route handlers.
// Always return a generic 500 to clients; log details server-side to prevent information leaks.
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// Export the app so tests can import it without binding a network port.
export default app;
