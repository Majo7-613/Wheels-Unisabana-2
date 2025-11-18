import React from "react";
import { Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
// Removed Dashboard, AddPickupPointsDriver and CalculateDistanceSystem per request
import TripList from "../features/Trips/TripList.jsx";
import TripForm from "../features/Trips/TripForm.jsx";
import VehiclesPage from "../features/Vehicles/VehiclesPage.jsx";
import ReservationsPage from "../features/Reservations/ReservationsPage.jsx";
import ProfilePage from "../features/Profile/ProfilePage.jsx";
import Logout from "../features/Auth/Logout.jsx";

export default [
  // Dashboard route removed
  <Route
    key="trips-list"
    path="/trips"
    element={
      <ProtectedRoute>
        <TripList />
      </ProtectedRoute>
    }
  />,
  <Route
    key="trip-create"
    path="/trips/new"
    element={
      <ProtectedRoute>
        <TripForm />
      </ProtectedRoute>
    }
  />,
  <Route
    key="vehicles"
    path="/vehicles"
    element={
      <ProtectedRoute>
        <VehiclesPage />
      </ProtectedRoute>
    // Removed pickup points and calculate-distance routes
    }
  />,
  <Route
    key="logout"
    path="/logout"
    element={
      <ProtectedRoute>
        <Logout />
      </ProtectedRoute>
    }
  />,
  <Route
    key="add-pickup"
    path="/features/add-pickup-points"
    element={
      <ProtectedRoute>
        <AddPickupPointsDriver />
      </ProtectedRoute>
    }
  />,
  <Route
    key="calc-distance"
    path="/features/calculate-distance"
    element={
      <ProtectedRoute>
        <CalculateDistanceSystem />
      </ProtectedRoute>
    }
  />
];
