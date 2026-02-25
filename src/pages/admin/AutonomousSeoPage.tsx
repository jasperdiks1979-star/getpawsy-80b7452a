import { AutonomousSeoSystem } from "@/components/admin/AutonomousSeoSystem";
import { Helmet } from "react-helmet-async";

export default function AutonomousSeoPage() {
  return (
    <>
      <Helmet>
        <title>Autonomous SEO AI | GetPawsy Admin</title>
      </Helmet>
      <AutonomousSeoSystem />
    </>
  );
}
