// จัดการการบันทึกและโหลดแคชของ KU Schedule (chrome.storage.local)

async function loadCachedSchedule() {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const res = await chrome.storage.local.get(["ku_schedule_cache"]);
      return res?.ku_schedule_cache || null;
    }
    return null;
  } catch (err) {
    console.warn("Error loading cached schedule:", err);
    return null;
  }
}

async function saveCachedSchedule(info, courses, enrolledYears = null) {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({
        ku_schedule_cache: {
          studentInfo: info,
          courses: courses,
          enrolledYears: enrolledYears,
          savedAt: Date.now(),
        },
      });
    }
  } catch (e) {
    console.warn("Error saving to cache:", e);
  }
}
