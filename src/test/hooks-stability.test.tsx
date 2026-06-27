import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import React from "react";

// Mock the cart context
vi.mock("@/contexts/CartContext", () => ({
  useCart: () => ({
    addItem: vi.fn(),
    items: [],
  }),
}));

// Mock analytics
vi.mock("@/lib/analytics", () => ({
  trackCrossSellImpression: vi.fn(),
  trackCrossSellClick: vi.fn(),
  trackCrossSellAddToCart: vi.fn(),
  trackBundleAddToCart: vi.fn(),
}));

// Mock canvas-confetti
vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

// Mock IntersectionObserver — must be a real constructor so `new IntersectionObserver(...)`
// inside components doesn't blow up with "is not a constructor". vi.fn().mockReturnValue()
// stores an arrow as the implementation which fails on `new`.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
(window as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
  MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Import components after mocks
import { FrequentlyBoughtTogether } from "@/components/products/FrequentlyBoughtTogether";
import { CompleteTheLook } from "@/components/products/CompleteTheLook";

const mockProduct = {
  id: "test-product-1",
  name: "Test Product",
  price: 29.99,
  compare_at_price: 39.99,
  image_url: "/test-image.jpg",
  slug: "test-product",
  category: "test-category",
};

const mockRelatedProducts = [
  {
    id: "related-1",
    name: "Related Product 1",
    price: 19.99,
    image_url: "/related-1.jpg",
    slug: "related-1",
    category: "test-category",
  },
  {
    id: "related-2",
    name: "Related Product 2",
    price: 24.99,
    image_url: "/related-2.jpg",
    slug: "related-2",
    category: "test-category",
  },
  {
    id: "related-3",
    name: "Related Product 3",
    price: 34.99,
    image_url: "/related-3.jpg",
    slug: "related-3",
    category: "test-category",
  },
];

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe("Hook Stability Tests", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("FrequentlyBoughtTogether", () => {
    it("renders without error when loading", () => {
      expect(() => {
        render(
          <Wrapper>
            <FrequentlyBoughtTogether
              currentProduct={mockProduct}
              relatedProducts={mockRelatedProducts}
              isLoading={true}
            />
          </Wrapper>
        );
      }).not.toThrow();
    });

    it("renders without error when not loading with products", () => {
      expect(() => {
        render(
          <Wrapper>
            <FrequentlyBoughtTogether
              currentProduct={mockProduct}
              relatedProducts={mockRelatedProducts}
              isLoading={false}
            />
          </Wrapper>
        );
      }).not.toThrow();
    });

    it("renders without error with empty related products", () => {
      expect(() => {
        render(
          <Wrapper>
            <FrequentlyBoughtTogether
              currentProduct={mockProduct}
              relatedProducts={[]}
              isLoading={false}
            />
          </Wrapper>
        );
      }).not.toThrow();
    });

    it("maintains stable hook count across loading state changes", () => {
      // First render with loading=true
      const { rerender } = render(
        <Wrapper>
          <FrequentlyBoughtTogether
            currentProduct={mockProduct}
            relatedProducts={mockRelatedProducts}
            isLoading={true}
          />
        </Wrapper>
      );

      // Should not throw "Rendered more hooks than during the previous render"
      expect(() => {
        rerender(
          <Wrapper>
            <FrequentlyBoughtTogether
              currentProduct={mockProduct}
              relatedProducts={mockRelatedProducts}
              isLoading={false}
            />
          </Wrapper>
        );
      }).not.toThrow();

      // Toggle back to loading
      expect(() => {
        rerender(
          <Wrapper>
            <FrequentlyBoughtTogether
              currentProduct={mockProduct}
              relatedProducts={mockRelatedProducts}
              isLoading={true}
            />
          </Wrapper>
        );
      }).not.toThrow();
    });

    it("maintains stable hook count when products change from empty to populated", () => {
      const { rerender } = render(
        <Wrapper>
          <FrequentlyBoughtTogether
            currentProduct={mockProduct}
            relatedProducts={[]}
            isLoading={false}
          />
        </Wrapper>
      );

      // Should not throw when products appear
      expect(() => {
        rerender(
          <Wrapper>
            <FrequentlyBoughtTogether
              currentProduct={mockProduct}
              relatedProducts={mockRelatedProducts}
              isLoading={false}
            />
          </Wrapper>
        );
      }).not.toThrow();
    });
  });

  describe("CompleteTheLook", () => {
    it("renders without error when loading", () => {
      expect(() => {
        render(
          <Wrapper>
            <CompleteTheLook
              products={mockRelatedProducts}
              isLoading={true}
              currentProductName="Test Product"
              sourceProductId="test-1"
              sourceProductName="Test Product"
            />
          </Wrapper>
        );
      }).not.toThrow();
    });

    it("renders without error when not loading", () => {
      expect(() => {
        render(
          <Wrapper>
            <CompleteTheLook
              products={mockRelatedProducts}
              isLoading={false}
              currentProductName="Test Product"
              sourceProductId="test-1"
              sourceProductName="Test Product"
            />
          </Wrapper>
        );
      }).not.toThrow();
    });

    it("renders without error with empty products", () => {
      expect(() => {
        render(
          <Wrapper>
            <CompleteTheLook
              products={[]}
              isLoading={false}
              currentProductName="Test Product"
              sourceProductId="test-1"
              sourceProductName="Test Product"
            />
          </Wrapper>
        );
      }).not.toThrow();
    });

    it("maintains stable hook count across loading state changes", () => {
      const { rerender } = render(
        <Wrapper>
          <CompleteTheLook
            products={mockRelatedProducts}
            isLoading={true}
            currentProductName="Test Product"
            sourceProductId="test-1"
            sourceProductName="Test Product"
          />
        </Wrapper>
      );

      expect(() => {
        rerender(
          <Wrapper>
            <CompleteTheLook
              products={mockRelatedProducts}
              isLoading={false}
              currentProductName="Test Product"
              sourceProductId="test-1"
              sourceProductName="Test Product"
            />
          </Wrapper>
        );
      }).not.toThrow();
    });
  });
});

describe("React Error #310 Prevention", () => {
  it("does not throw when rendering components with various data states", () => {
    const states = [
      { isLoading: true, products: [] },
      { isLoading: true, products: mockRelatedProducts },
      { isLoading: false, products: [] },
      { isLoading: false, products: mockRelatedProducts },
    ];

    states.forEach((state, index) => {
      cleanup();
      expect(() => {
        render(
          <Wrapper>
            <FrequentlyBoughtTogether
              currentProduct={mockProduct}
              relatedProducts={state.products}
              isLoading={state.isLoading}
            />
          </Wrapper>
        );
      }).not.toThrow(`State ${index} caused an error`);
    });
  });
});
