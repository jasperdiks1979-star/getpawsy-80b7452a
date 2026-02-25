import { AutonomousSeoEngine } from "@/components/admin/AutonomousSeoEngineUI";
import { Helmet } from "react-helmet-async";

export default function AutonomousSeoEnginePage() {
  return (
    <>
      <Helmet>
        <title>Autonomous SEO Engine | GetPawsy Admin</title>
      </Helmet>
      <AutonomousSeoEngine />
    </>
  );
}
