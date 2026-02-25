import { render, screen, fireEvent } from "@testing-library/react";
import ConsentModal from "@/components/ConsentModal";
import { LanguageProvider } from "@/contexts/LanguageContext";

function renderModal() {
  return render(
    <LanguageProvider>
      <ConsentModal />
    </LanguageProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("ConsentModal", () => {
  it("shows the modal when consent has not been given", () => {
    renderModal();
    expect(screen.getByText("Aviso Legal y Privacidad")).toBeInTheDocument();
  });

  it("does not show the modal when consent was already given this session", () => {
    sessionStorage.setItem("legal-consent", "1");
    renderModal();
    expect(screen.queryByText("Aviso Legal y Privacidad")).not.toBeInTheDocument();
  });

  it("hides the modal after clicking accept", () => {
    renderModal();
    fireEvent.click(screen.getByText("He leído y acepto"));
    expect(screen.queryByText("Aviso Legal y Privacidad")).not.toBeInTheDocument();
  });

  it("stores consent in sessionStorage after accepting", () => {
    renderModal();
    fireEvent.click(screen.getByText("He leído y acepto"));
    expect(sessionStorage.getItem("legal-consent")).toBe("1");
  });

  it("renders all required legal sections", () => {
    renderModal();
    expect(screen.getByText("Almacenamiento local")).toBeInTheDocument();
    expect(screen.getByText("Servicios externos")).toBeInTheDocument();
    expect(screen.getByText("Sin asesoramiento financiero")).toBeInTheDocument();
    expect(screen.getByText("Cookies")).toBeInTheDocument();
  });
});
