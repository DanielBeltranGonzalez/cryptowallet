import { render, screen, waitFor } from "@testing-library/react";
import Footer from "@/components/Footer";

const mockFetch = jest.fn();
global.fetch = mockFetch;

afterEach(() => {
  jest.clearAllMocks();
});

describe("Footer", () => {
  it("renders the version prop", () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve({ count: 0 }) });
    render(<Footer version="v1.2.3" />);
    expect(screen.getByText(/v1\.2\.3/)).toBeInTheDocument();
  });

  it("renders the email link", () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve({ count: 0 }) });
    render(<Footer version="v1.0.0" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "mailto:tacombel@gmail.com");
  });

  it("calls /api/views on mount and displays count", async () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve({ count: 123 }) });
    render(<Footer version="v1.0.0" />);

    expect(mockFetch).toHaveBeenCalledWith("/api/views", { method: "POST" });

    await waitFor(() => {
      expect(screen.getByText(/123 visitas/)).toBeInTheDocument();
    });
  });

  it("does not show view count before fetch resolves", () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<Footer version="v1.0.0" />);
    expect(screen.queryByText(/visitas/)).not.toBeInTheDocument();
  });
});
