import React from "react";
import { BrandEndCard } from "./BrandEndCard";

export const Scene5CTA: React.FC<{ cta: string; url?: string }> = ({ cta, url }) => (
  <BrandEndCard cta={cta} url={url} />
);