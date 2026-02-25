import { render, screen, fireEvent } from "@testing-library/react";
import ConsentModal from "@/components/ConsentModal";

beforeEach(() => {
  localStorage.clear();
});

describe("ConsentModal", () => {
  it("shows the modal when consent has not been given", () => {
    render(<ConsentModal />);
    expect(screen.getByText("Aviso Legal y Privacidad")).toBeInTheDocument();
  });

  it("does not show the modal when consent was already given", () => {
    localStorage.setItem("legal-consent", "1");
    render(<ConsentModal />);
    expect(screen.queryByText("Aviso Legal y Privacidad")).not.toBeInTheDocument();
  });

  it("hides the modal after clicking accept", () => {
    render(<ConsentModal />);
    fireEvent.click(screen.getByText("He leído y acepto"));
    expect(screen.queryByText("Aviso Legal y Privacidad")).not.toBeInTheDocument();
  });

  it("stores consent in localStorage after accepting", () => {
    render(<ConsentModal />);
    fireEvent.click(screen.getByText("He leído y acepto"));
    expect(localStorage.getItem("legal-consent")).toBe("1");
  });

  it("renders all required legal sections", () => {
    render(<ConsentModal />);
    expect(screen.getByText("Almacenamiento local")).toBeInTheDocument();
    expect(screen.getByText("Servicios externos")).toBeInTheDocument();
    expect(screen.getByText("Sin asesoramiento financiero")).toBeInTheDocument();
    expect(screen.getByText("Cookies")).toBeInTheDocument();
  });
});
