export const GLOBAL_COURSE_POLICY_REVISION = '2026-09-10';
export const GLOBAL_UNRELEASED_TRACK_IDS = Object.freeze([116, 117]);

export function courseTrackId(courseId) {
  const id = Number(courseId);
  return Number.isInteger(id) && id > 0 ? Math.trunc(id / 100) : null;
}

export function isGlobalCourseAvailable(courseId) {
  const trackId = courseTrackId(courseId);
  return trackId != null && !GLOBAL_UNRELEASED_TRACK_IDS.includes(trackId);
}
