import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";

export const { fontFamily: interFont } = loadInter("normal", {
  weights: ["400", "600", "700"],
  subsets: ["latin"],
});

export const { fontFamily: poppinsFont } = loadPoppins("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});
