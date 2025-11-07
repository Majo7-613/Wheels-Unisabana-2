# Wheels Sabana

## BackEnd: https://wheels-unisabana-2.onrender.com/api-docs/
## FrontEnd: https://wheels-unisabana-2-frontend.vercel.app/

Plataforma de movilidad universitaria: React + Node + Express + MongoDB + Redis.

## Flujo principal (según reglas y tickets)
1) Autenticación institucional (registro/login con correo @unisabana.edu.co).
2) Configuración del conductor: vehículo y puntos de recogida.
3) Publicación de viajes y reservas (decremento atómico de cupos).
4) Cálculo de distancia/ETA (Google Distance Matrix con caché).
5) Navegación (Waze deep link) y calificaciones.

Autenticación primero: un usuario no autenticado solo debe ver Login/Registro; el resto de rutas son protegidas.

## Requisitos
- Node 18+
- Docker (opcional para MongoDB y Redis)
- PowerShell (Windows) para ejecutar scripts

## Preparación de diseños (UI)
Coloca los PNG de /Designs dentro de:
- frontend/public/Designs/
  - Add Pickup Points (Driver).png
  - Calculate Distance (System).png
  - ...otros

Los componentes de features referencian esas rutas públicas.

## Instalación y ejecución (rápido)
- Opción 1 (un clic, Windows):
  - PowerShell en la raíz del proyecto:
    - powershell -ExecutionPolicy Bypass -File .\scripts\run-all.ps1
  - Abre:
    - Frontend: http://localhost:5173
    - Backend: http://localhost:4000 (health: /health, docs: /api-docs)

- Opción 2 (manual):
  1) Instala dependencias:
     - npm run setup
  2) Variables backend:
     - copy backend/.env.example backend/.env
     - Ajusta: JWT_SECRET, MONGO_URI, GOOGLE_MAPS_KEY (si usarás /maps/distance)
  3) Ejecuta en paralelo:
     - npm run dev:win
     - Frontend: http://localhost:5173
     - Backend: http://localhost:4000

## Checklist inmediato 
1) Cierra todas las terminales abiertas (para evitar procesos colgados).
2) Abre PowerShell en la raíz del proyecto:
   - powershell -ExecutionPolicy Bypass -File .\scripts\run-all.ps1
   - Esto instala deps, crea backend/.env (si falta), instala @vitejs/plugin-react si no existe, y levanta FE/BE.
3) Verifica que abre:
   - Backend: http://localhost:4000/health debe responder { "ok": true }
   - Docs: http://localhost:4000/api-docs
   - Frontend: http://localhost:5173
4) Si el frontend no levanta por el plugin:
   - cd frontend && npm i -D @vitejs/plugin-react && cd ..
   - Vuelve a correr: powershell -ExecutionPolicy Bypass -File .\scripts\run-all.ps1
5) Diseños (PNG):
   - Copia los archivos de /Designs a frontend/public/Designs/ (mismo nombre de los PNG).
   - Refresca http://localhost:5173.
6) Auth primero (flujo mínimo):
   - Regístrate con correo @unisabana.edu.co desde /register.
   - Inicia sesión en /login y valida que el navbar muestre Logout y rutas de features.
7) Pruebas rápidas del backend (sin Google/Mongo):
   - Salud: curl http://localhost:4000/health
   - Waze: curl "http://localhost:4000/navigation/waze?lat=4.65&lng=-74.05"
   - Distance (sin key): curl "http://localhost:4000/maps/distance?origin=4.65,-74.05&destination=4.86,-74.03" → debe dar 500 si no configuraste GOOGLE_MAPS_KEY.
8) Cuando uses Google/Mongo:
   - Edita backend/.env y define: MONGO_URI=mongodb://localhost:27017/wheels y GOOGLE_MAPS_KEY=tu_api_key
   - Reinicia solo el backend (cierra la ventana del backend y vuelve a ejecutar run-all.ps1 o cd backend && npm run dev)

## Diagnóstico rápido
- “Cannot find @vitejs/plugin-react” → cd frontend && npm i -D @vitejs/plugin-react
- “MONGO_URI undefined” y reinicios → ya está mitigado; edita backend/.env cuando quieras conectar Mongo.
- “connection refused” → espera 5–10s, revisa http://localhost:4000/health y http://localhost:5173; firewall/antivirus puede bloquear Node.
- Puertos ocupados → netstat -ano | findstr :4000 y :5173, cierra procesos que bloqueen.

## Estructura (resumen)
- frontend: Vite + Tailwind + Router + Tests
- backend: Express + Mongoose + Redis + Swagger + Jest/Supertest

## Endpoints principales (backend)
- Auth:
  - POST /auth/register
  - POST /auth/login
  - GET /auth/me  (Bearer <JWT>)
- Vehículos:
  - CRUD /vehicles
  - POST /vehicles/pickup-points
- Trips:
  - CRUD /trips
  - POST /trips/:id/book  (decremento cupos)
- Integraciones:
  - GET /maps/distance?origin=..&destination=..  (Google Distance Matrix)
  - GET /navigation/waze?lat=..&lng=..          (deep link)
- Swagger: http://localhost:4000/api-docs
- Health: /health

## API Contract por historia

### Registration with University Email
- **Endpoint:** `POST /auth/register`
- **Request:**
```
{
  "firstName": "string",
  "lastName": "string",
  "universityId": "string",
  "phone": "string",
  "email": "string",
  "password": "string",
  "role": "passenger" | "driver",
  "photoUrl": "string",
  "vehicle": {
    "plate": "string",
    "brand": "string",
    "model": "string",
    "capacity": number,
    "vehiclePhotoUrl": "string",
    "soatPhotoUrl": "string"
  }
}
```
- **Response (201):**
```
{
  "user": {
    "id": "string",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "universityId": "string",
    "phone": "string",
    "photoUrl": "string",
    "roles": ["passenger", "driver"],
    "activeRole": "passenger" | "driver",
    "createdAt": "ISO",
    "updatedAt": "ISO"
  },
  "vehicle": null | {
    "id": "string",
    "owner": "string",
    "plate": "string",
    "brand": "string",
    "model": "string",
    "capacity": number,
    "vehiclePhotoUrl": "string",
    "soatPhotoUrl": "string",
    "createdAt": "ISO",
    "updatedAt": "ISO"
  }
}
```

### Login with Credentials
- **Endpoint:** `POST /auth/login`
- **Request:** `{ "email": "string", "password": "string" }`
- **Response (200):** `{ "token": "jwt", "user": { ...perfil básico... } }`

### Logout
- **Endpoint:** `POST /auth/logout`
- **Response:** `{ "ok": true }`

### Password Recovery
- **Endpoint:** `POST /auth/forgot-password`
- **Request:** `{ "email": "string" }`
- **Response:** `{ "ok": true }`
- **Endpoint:** `POST /auth/reset-password`
- **Request:** `{ "token": "string", "password": "string" }`
- **Response:** `{ "ok": true }`

### View & Edit Profile
- **Endpoint:** `GET /users/me`
- **Response:** `{ "user": { ... }, "vehicle": { ... } }`
- **Endpoint:** `PUT /users/me`
- **Request:** `{ "firstName?": "string", "lastName?": "string", "phone?": "string", "photoUrl?": "string" }`
- **Response:** `{ "user": { ...actualizado... } }`

### Switch between Passenger and Driver Roles
- **Endpoint:** `PUT /auth/role`
- **Request:** `{ "role": "passenger" | "driver" }`
- **Response:** `{ "user": { ...con activeRole actualizado... } }`

### Register Vehicle / Manage Vehicle
- **Endpoint:** `POST /vehicles`
- **Request:** `{ "plate": "string", "brand": "string", "model": "string", "capacity": number, "vehiclePhotoUrl": "string", "soatPhotoUrl": "string" }`
- **Response:** `{ "_id": "string", ... }`
- **Endpoint:** `GET /vehicles`
- **Response:** `[ { ...vehículo... } ]`
- **Endpoint:** `PUT /vehicles/:id`
- **Request:** campos editables
- **Endpoint:** `DELETE /vehicles/:id`
- **Response:** `{ "ok": true }`

### Create Trip (Driver)
- **Endpoint:** `POST /trips`
- **Request:**
```
{
  "vehicleId": "string",
  "origin": "string",
  "destination": "string",
  "routeDescription": "string",
  "departureAt": "ISO",
  "seatsTotal": number,
  "pricePerSeat": number,
  "pickupPoints": [ { "name": "string", "description": "string", "lat": number, "lng": number } ],
  "distanceKm": number,
  "durationMinutes": number
}
```
- **Response (201):** `{ "trip": { ... } }`

### View Available Trips & Filters
- **Endpoint:** `GET /trips`
- **Query Params:** `departure_point`, `min_seats`, `max_price`
- **Response:** `{ "trips": [ { ... } ] }`

### Reserve Seats / Reserve Multiple Seats
- **Endpoint:** `POST /trips/:id/reservations`
- **Request:** `{ "seats": number, "pickupPoints": [ { "name": "string", "lat": number, "lng": number, "description": "string" } ], "paymentMethod": "cash" | "nequi" }`
- **Response:** `{ "trip": { ...actualizado... } }`

### Block Full Trips / Cancel Trip
- **Endpoint:** `PUT /trips/:id/cancel`
- **Response:** `{ "trip": { status: "cancelled", reservoirs... } }`

### Driver Views Passenger List
- **Endpoint:** `GET /trips/:id/passengers`
- **Response:** `{ "passengers": [ { "passenger": { ... }, "seats": number, "pickupPoints": [ ... ], "paymentMethod": "string" } ] }`

### Health & Availability
- **Endpoint:** `GET /health`
- **Response:** `{ "ok": true }`

## Variables de entorno (backend)
PORT=4000
MONGO_URI=mongodb://localhost:27017/wheels
JWT_SECRET=supersecret
GOOGLE_MAPS_KEY=your_api_key
REDIS_URL=redis://localhost:6379

## Pruebas (backend)
- npm test
- Nota: los tests mockean Mongo/Redis y validan health, waze, y errores de Distance Matrix.

## Problemas comunes
- Vite error @vitejs/plugin-react:
  - Ejecuta el script .\scripts\run-all.ps1 (instala el plugin automáticamente) o:
  - cd frontend && npm i -D @vitejs/plugin-react
- Backend reinicia por MONGO_URI:
  - Asegúrate de tener backend/.env o deja MONGO_URI vacío (arranca sin Mongo).
- Connection refused:
  - Comprueba http://localhost:4000/health y http://localhost:5173
  - Espera unos segundos tras arrancar; revisa firewall/antivirus.
  - netstat -ano | findstr :4000 y :5173 para verificar puertos.

## Si el backend “no abre”
- Verifica health: http://localhost:4000/health (debe responder {"ok": true})
- Logs de arranque: busca “API Wheels Sabana en http://localhost:4000”
- Puerto ocupado:
  - netstat -ano | findstr :4000  → mata el PID con: taskkill /PID <pid> /F
  - Reintenta: cd backend && npm run dev
- Reinicios constantes (OneDrive):
  - Se añadió backend/nodemon.json para mirar solo /src. Si sigue, cierra otras ventanas de Node.
- Sin Mongo:
  - El server arranca igual (MONGO_URI opcional). /auth devolverá 503 hasta configurar DB.
- Error al iniciar:
  - Reinstala deps solo del backend: cd backend && npm ci
  - Borra caché nodemon (si persiste): npm i -D nodemon@latest

## Roadmap UI (Auth primero)
- Páginas:
  - /login y /register (correo institucional obligatorio)
  - ProtectedRoute para features (solo con JWT)
- Features:
  - AddPickupPointsDriver (tras login)
  - CalculateDistanceSystem (tras login o de solo lectura según ticket)
- Navbar:
  - Mostrar Login/Logout dinámico según sesión.

## Docker Desktop en Windows (necesario para `docker compose`)
1) Abre Docker Desktop y espera a que muestre “Engine running”.

2) Asegúrate de usar Linux containers (no Windows containers).

3) Habilita WSL 2:
   - PowerShell (Admin): wsl --install (reinicia si lo pide)
   - Verifica: wsl -l -v (debe haber una distro con versión 2)

4) Docker Desktop → Settings → Resources → WSL Integration → Enable integration para tu distro.

5) Prueba:
   - docker --version
   - docker info (no debe fallar)
   - docker compose up -d (desde la raíz del proyecto)

Si ves “open //./pipe/dockerDesktopLinuxEngine”:
- Docker Desktop no está corriendo o el motor Linux está apagado. Ábrelo y repite.
- Reinicia WSL: wsl --shutdown y luego reinicia Docker Desktop.

## Fallback sin Docker (temporal)
- Usa MongoDB Atlas:
  - Crea cluster, usuario y agrega tu IP.
  - backend/.env → MONGO_URI=mongodb+srv://USER:PASS@CLUSTER.mongodb.net/wheels
- Redis es opcional (el backend arranca sin Redis).
- Reinicia backend: cd backend && npm run dev



