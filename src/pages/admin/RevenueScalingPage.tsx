import { RevenueScalingBlueprint } from "@/components/admin/RevenueScalingBlueprint";
import { Helmet } from "react-helmet-async";

export default function RevenueScalingPage() {
  return (
    <>
      <Helmet>
        <title>12-Month Revenue Scaling | GetPawsy Admin</title>
      </Helmet>
      <RevenueScalingBlueprint />
    </>
  );
}
