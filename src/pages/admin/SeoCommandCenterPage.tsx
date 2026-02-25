import { SeoCommandCenter } from "@/components/admin/SeoCommandCenter";
import { Helmet } from "react-helmet-async";

export default function SeoCommandCenterPage() {
  return (
    <>
      <Helmet>
        <title>SEO Command Center | GetPawsy Admin</title>
      </Helmet>
      <SeoCommandCenter />
    </>
  );
}
