// Minimal OpenAPI 3 spec powering Swagger UI. Extend as endpoints evolve (schemas, params, auth).
const renderUrl = process.env.SWAGGER_SERVER_URL || process.env.RENDER_EXTERNAL_URL;

const servers = [{ url: "http://localhost:4000" }];

if (renderUrl) {
  servers.push({ url: renderUrl });
} else {
  servers.push({ url: "https://wheels-backend.onrender.com" }); // Default Render deployment URL.
}

const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "Wheels Sabana API",
    version: "1.0.0"
  },
  servers,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Incluye Authorization: Bearer <token> obtenido en /auth/login"
      }
    },
    schemas: {
      RegisterRequest: {
        type: "object",
        required: [
          "email",
          "password",
          "firstName",
          "lastName",
          "universityId",
          "phone"
        ],
        properties: {
          email: {
            type: "string",
            format: "email",
            example: "usuario@unisabana.edu.co"
          },
          password: { type: "string", minLength: 8, example: "Secret123" },
          firstName: { type: "string", example: "Laura" },
          lastName: { type: "string", example: "Gonzalez" },
          universityId: { type: "string", example: "A00012345" },
          phone: { type: "string", example: "3001234567" },
          photoUrl: { type: "string", format: "uri" },
          emergencyContact: {
            type: "object",
            properties: {
              name: { type: "string" },
              phone: { type: "string" }
            }
          },
          preferredPaymentMethod: {
            type: "string",
            enum: ["cash", "nequi"],
            example: "nequi"
          },
          role: {
            type: "string",
            enum: ["passenger", "driver"],
            default: "passenger"
          },
          vehicle: {
            type: "object",
            description: "Requerido cuando role=driver",
            properties: {
              plate: { type: "string", example: "ABC123" },
              brand: { type: "string", example: "Toyota" },
              model: { type: "string", example: "Corolla" },
              capacity: { type: "integer", minimum: 1, maximum: 8, example: 4 },
              vehiclePhotoUrl: { type: "string", format: "uri" },
              soatPhotoUrl: { type: "string", format: "uri" },
              soatExpiration: { type: "string", format: "date" },
              licenseNumber: { type: "string" },
              licenseExpiration: { type: "string", format: "date" }
            }
          }
        }
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: {
            type: "string",
            format: "email",
            example: "usuario@unisabana.edu.co"
          },
          password: { type: "string", example: "Secret123" }
        }
      },
      MapsCalculateRequest: {
        type: "object",
        required: ["origin", "destination"],
        properties: {
          origin: {
            oneOf: [
              {
                type: "object",
                required: ["lat", "lng"],
                properties: {
                  lat: { type: "number", example: 4.65 },
                  lng: { type: "number", example: -74.05 }
                }
              },
              { type: "string", example: "4.65,-74.05" }
            ]
          },
          destination: {
            oneOf: [
              {
                type: "object",
                required: ["lat", "lng"],
                properties: {
                  lat: { type: "number", example: 4.86 },
                  lng: { type: "number", example: -74.03 }
                }
              },
              { type: "string", example: "4.86,-74.03" }
            ]
          }
        }
      },
      TariffSuggestRequest: {
        type: "object",
        required: ["distanceKm", "durationMinutes"],
        properties: {
          distanceKm: { type: "number", example: 12.5 },
          durationMinutes: { type: "number", example: 25 },
          demandFactor: { type: "number", example: 1.1 },
          occupancy: { type: "integer", example: 3 }
        }
      }
    }
  },
  paths: {
    "/auth/register": {
      post: {
        summary: "Registro",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterRequest" }
            }
          }
        },
        responses: {
          "201": { description: "Usuario creado" },
          "400": { description: "Solicitud inválida" },
          "409": { description: "Email duplicado" }
        }
      }
    },
    "/auth/login": {
      post: {
        summary: "Login",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" }
            }
          }
        },
        responses: {
          "200": { description: "Token emitido" },
          "401": { description: "Credenciales inválidas" }
        }
      }
    },
    "/auth/me": {
      get: {
        summary: "Perfil",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "OK" },
          "401": { description: "No autorizado" }
        }
      }
    },
    "/auth/logout": {
      post: {
        summary: "Cerrar sesión",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Sesión invalidada" },
          "401": { description: "No autorizado" }
        }
      }
    },
    "/maps/distance": {
      get: {
        summary: "Distance Matrix (legacy)",
        parameters: [
          {
            in: "query",
            name: "origin",
            required: true,
            schema: { type: "string", example: "4.65,-74.05" }
          },
          {
            in: "query",
            name: "destination",
            required: true,
            schema: { type: "string", example: "4.86,-74.03" }
          }
        ],
        responses: {
          "200": { description: "OK" },
          "400": { description: "Parámetros faltantes" }
        }
      }
    },
    "/maps/calculate": {
      post: {
        summary: "Calcular distancia y duración",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MapsCalculateRequest" }
            }
          }
        },
        responses: {
          "200": { description: "OK" },
          "400": { description: "Solicitud inválida" },
          "429": { description: "Rate limit" }
        }
      }
    },
    "/trips/tariff/suggest": {
      post: {
        summary: "Tarifa sugerida",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TariffSuggestRequest" }
            }
          }
        },
        responses: {
          "200": { description: "OK" },
          "400": { description: "Solicitud inválida" }
        }
      }
    },
    "/navigation/waze": {
      get: {
        summary: "Deep link Waze",
        parameters: [
          {
            in: "query",
            name: "lat",
            required: true,
            schema: { type: "number", example: 4.65 }
          },
          {
            in: "query",
            name: "lng",
            required: true,
            schema: { type: "number", example: -74.05 }
          }
        ],
        responses: { "200": { description: "OK" }, "400": { description: "Parámetros inválidos" } }
      }
    }
  }
};

export default swaggerSpec;
