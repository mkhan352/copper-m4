import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

// Only what every version of the home page keeps: the placeholder (Module 0)
// and the landing page (Module 1 on). Module specs test the rest.
describe("Home page", () => {
  it("shows the logo", () => {
    render(<Home />);
    expect(screen.getAllByAltText("Copper State Labs").length).toBeGreaterThan(
      0,
    );
  });

  it("has the fictional-use footer", () => {
    render(<Home />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "Fictional — for educational use.",
    );
  });

  it("has a Returns and refunds section that sends shoppers to the chat and the Support page", () => {
    const { container } = render(<Home />);
    const section = container.querySelector("#refunds")!;
    expect(section).toHaveTextContent("Returns and refunds");
    expect(section).toHaveTextContent("30 days");
    expect(section).toHaveTextContent("14 days");
    const links = [...section.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(links).toContain("#ask");
    expect(links).toContain("/support");
  });

  it("the header links to the Support page and its section links work from any page", () => {
    const { container } = render(<Home />);
    const header = container.querySelector('[data-testid="site-header"]')!;
    const links = [...header.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(links).toContain("/support");
    expect(links).toContain("/#refunds");
    expect(links).toContain("/#ask");
  });
});
