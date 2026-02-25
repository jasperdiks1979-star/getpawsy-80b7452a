import { CRODashboard } from "@/components/admin/CRODashboard";
import { Helmet } from "react-helmet-async";

export default function CRODashboardPage() {
  return (
    <>
      <Helmet>
        <title>CRO & Revenue Dashboard | GetPawsy Admin</title>
      </Helmet>
      <CRODashboard />
    </>
  );
}
