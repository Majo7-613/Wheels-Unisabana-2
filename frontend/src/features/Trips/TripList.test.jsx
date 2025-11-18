import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TripList from "./TripList.jsx";

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock("../../utils/api", () => ({
  get: (...args) => mockGet(...args),
  post: (...args) => mockPost(...args)
}));

jest.mock("../../context/AuthContext.jsx", () => ({
  useAuth: () => ({ user: { id: "passenger-1", roles: ["passenger"] } })
}));

jest.mock("../../components/TransmilenioMap.jsx", () => ({
  __esModule: true,
  default: ({ onSelectPoint }) => (
    <div
      data-testid="transmilenio-map"
      role="presentation"
      onClick={() => onSelectPoint?.({ lat: 4.75, lng: -74.05 })}
    >
      mapa-interactivo
    </div>
  )
}));

const tripFixture = () => ({
  _id: "trip-1",
  origin: "Campus",
  destination: "Bogotá",
  departureAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  pricePerSeat: 8000,
  seatsAvailable: 2,
  status: "scheduled",
  pickupPoints: [],
  reservations: []
});

describe("TripList pickup suggestions", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("permite sugerir un nuevo punto cuando el viaje no tiene recogidas", async () => {
    const trip = tripFixture();
    // Provide a default resolved value so any extra calls to GET /trips
    // (initial + possible refetches) return a valid payload and avoid
    // brittle "undefined" errors in the component under test.
    mockGet.mockResolvedValue({ data: { trips: [trip] } });
    mockPost
      .mockResolvedValueOnce({ data: { trip } })
      .mockResolvedValueOnce({
        data: {
          trip: {
            ...trip,
            pickupPoints: [
              {
                name: "Portal 170",
                description: "Entrada principal",
                lat: 4.7525,
                lng: -74.0363
              }
            ]
          }
        }
      });

    render(<TripList />);

    const reserveButton = await screen.findByRole("button", { name: /Reservar/i });
    await userEvent.click(reserveButton);

    const nameInput = await screen.findByLabelText(/Nombre del punto/i);
    const descriptionInput = screen.getByLabelText(/Referencia o descripción/i);
    const latInput = screen.getByLabelText(/Latitud/i);
    const lngInput = screen.getByLabelText(/Longitud/i);

    await userEvent.type(nameInput, "Portal 170");
    await userEvent.type(descriptionInput, "Entrada principal");
    await userEvent.clear(latInput);
    await userEvent.type(latInput, "4.7525");
    await userEvent.clear(lngInput);
    await userEvent.type(lngInput, "-74.0363");

    await userEvent.click(screen.getByRole("button", { name: /Confirmar/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));

    expect(mockPost).toHaveBeenNthCalledWith(
      1,
      "/trips/trip-1/reservations",
      expect.objectContaining({
        seats: 1,
        pickupPoints: [
          {
            name: "Portal 170",
            description: "Entrada principal",
            lat: 4.7525,
            lng: -74.0363
          }
        ]
      })
    );

    expect(mockPost).toHaveBeenNthCalledWith(
      2,
      "/trips/trip-1/pickup-suggestions",
      expect.objectContaining({
        name: "Portal 170",
        description: "Entrada principal",
        lat: 4.7525,
        lng: -74.0363
      })
    );
  });
});
