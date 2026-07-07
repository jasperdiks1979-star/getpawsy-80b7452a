import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {
    select: () => chain, eq: () => chain, gte: () => chain,
    order: () => chain, limit: () => Promise.resolve({ data: [], error: null }),
  };
  return { supabase: { from: () => chain } };
});

import Page from "../CustomerBehaviourEnginePage";

describe("CustomerBehaviourEnginePage", () => {
  it("renders heading and tabs without crashing on empty data", () => {
    render(<Page />);
    expect(screen.getByText(/Customer Behaviour Engine/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Visitor clusters/i })).toBeInTheDocument();
  });
});