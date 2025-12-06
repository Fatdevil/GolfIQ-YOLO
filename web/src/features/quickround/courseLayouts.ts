import type { CourseBundle } from "@/courses/types";
import type { CourseLayout } from "@/types/course";
import { DEMO_COURSE_NAME } from "./constants";

export const DEMO_LINKS_HERO_LAYOUT: CourseLayout = {
  id: "demo-links-hero",
  name: DEMO_COURSE_NAME,
    holes: [
      {
        number: 1,
        par: 4,
        yardage_m: 360,
        tee: { lat: 59.3005, lon: 18.0948 },
        green: { lat: 59.3009, lon: 18.0962 },
      },
      {
        number: 2,
        par: 3,
        yardage_m: 165,
        tee: { lat: 59.2998, lon: 18.0971 },
        green: { lat: 59.2994, lon: 18.0986 },
      },
      {
        number: 3,
        par: 5,
        yardage_m: 480,
        tee: { lat: 59.2987, lon: 18.1002 },
        green: { lat: 59.2984, lon: 18.1018 },
      },
      {
        number: 4,
        par: 4,
        yardage_m: 355,
        tee: { lat: 59.2976, lon: 18.1031 },
        green: { lat: 59.2972, lon: 18.1044 },
      },
      {
        number: 5,
        par: 4,
        yardage_m: 320,
        tee: { lat: 59.2966, lon: 18.106 },
        green: { lat: 59.2962, lon: 18.1074 },
      },
  ],
};

export function courseBundleToLayout(bundle?: CourseBundle | null): CourseLayout | null {
  if (!bundle) {
    return null;
  }

  return {
    id: bundle.id,
    name: bundle.name,
    holes: bundle.holes.map((hole) => ({
      number: hole.number,
      par: hole.par,
      tee: { ...hole.tee_center },
      green: hole.green.middle,
    })),
  };
}

export function resolveCourseLayout(
  courseId?: string | null,
  courseName?: string | null,
  bundle?: CourseBundle | null
): CourseLayout | null {
  const layoutFromBundle = courseBundleToLayout(bundle);
  if (layoutFromBundle) {
    return layoutFromBundle;
  }

  if (!courseId && !courseName) {
    return null;
  }

  const normalizedName = courseName?.toLowerCase().trim();
  if (
    courseId === "demo-links" ||
    courseId === "demo-links-hero" ||
    normalizedName === DEMO_COURSE_NAME.toLowerCase()
  ) {
    return DEMO_LINKS_HERO_LAYOUT;
  }

  return null;
}
