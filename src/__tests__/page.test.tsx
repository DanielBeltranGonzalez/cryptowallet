import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Home from "@/app/page";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const TEST_ADDRESS = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

beforeEach(() => {
  localStorage.clear();
  mockFetch.mockReset();
});

describe("Home page", () => {
  it("renders the main heading", () => {
    render(<Home />);
    expect(screen.getByText("Solana Wallets Balance Viewer")).toBeInTheDocument();
  });

  it("shows the add address button", () => {
    render(<Home />);
    expect(screen.getByText("+ Añadir dirección")).toBeInTheDocument();
  });

  it("shows input when add button is clicked", () => {
    render(<Home />);
    fireEvent.click(screen.getByText("+ Añadir dirección"));
    expect(screen.getByPlaceholderText("Dirección de Solana...")).toBeInTheDocument();
  });

  it("hides input when cancel is clicked", () => {
    render(<Home />);
    fireEvent.click(screen.getByText("+ Añadir dirección"));
    fireEvent.click(screen.getByText("Cancelar"));
    expect(screen.queryByPlaceholderText("Dirección de Solana...")).not.toBeInTheDocument();
  });

  it("adds an address and displays it", () => {
    render(<Home />);
    fireEvent.click(screen.getByText("+ Añadir dirección"));
    fireEvent.change(screen.getByPlaceholderText("Dirección de Solana..."), {
      target: { value: TEST_ADDRESS },
    });
    fireEvent.click(screen.getByText("Confirmar"));
    expect(screen.getByText(TEST_ADDRESS)).toBeInTheDocument();
  });

  it("does not add a duplicate address", () => {
    render(<Home />);

    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByText("+ Añadir dirección"));
      fireEvent.change(screen.getByPlaceholderText("Dirección de Solana..."), {
        target: { value: TEST_ADDRESS },
      });
      fireEvent.click(screen.getByText("Confirmar"));
    }

    expect(screen.getAllByText(TEST_ADDRESS)).toHaveLength(1);
  });

  it("shows the fetch button after an address is added", () => {
    render(<Home />);
    fireEvent.click(screen.getByText("+ Añadir dirección"));
    fireEvent.change(screen.getByPlaceholderText("Dirección de Solana..."), {
      target: { value: TEST_ADDRESS },
    });
    fireEvent.click(screen.getByText("Confirmar"));
    expect(screen.getByText("Actualizar saldos")).toBeInTheDocument();
  });

  it("removes an address when Eliminar is clicked", () => {
    render(<Home />);
    fireEvent.click(screen.getByText("+ Añadir dirección"));
    fireEvent.change(screen.getByPlaceholderText("Dirección de Solana..."), {
      target: { value: TEST_ADDRESS },
    });
    fireEvent.click(screen.getByText("Confirmar"));

    // Expand the card to reveal the Eliminar button
    fireEvent.click(screen.getByLabelText("Expandir"));
    fireEvent.click(screen.getByText("Eliminar"));

    expect(screen.queryByText(TEST_ADDRESS)).not.toBeInTheDocument();
  });

  it("persists addresses in localStorage", () => {
    const { unmount } = render(<Home />);
    fireEvent.click(screen.getByText("+ Añadir dirección"));
    fireEvent.change(screen.getByPlaceholderText("Dirección de Solana..."), {
      target: { value: TEST_ADDRESS },
    });
    fireEvent.click(screen.getByText("Confirmar"));
    unmount();

    const stored = JSON.parse(localStorage.getItem("solana-addresses") ?? "[]") as string[];
    expect(stored).toContain(TEST_ADDRESS);
  });

  it("shows SOL balance after fetching", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/balances") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              [TEST_ADDRESS]: { status: "ok", sol: 1.5, tokens: [] },
            }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<Home />);
    fireEvent.click(screen.getByText("+ Añadir dirección"));
    fireEvent.change(screen.getByPlaceholderText("Dirección de Solana..."), {
      target: { value: TEST_ADDRESS },
    });
    fireEvent.click(screen.getByText("Confirmar"));
    fireEvent.click(screen.getByText("Actualizar saldos"));

    await waitFor(() => {
      expect(screen.getByText(/1\.5000 SOL/)).toBeInTheDocument();
    });
  });
});
