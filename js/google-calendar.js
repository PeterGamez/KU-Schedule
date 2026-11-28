// Google Calendar API Integration (OAuth2) via chrome.identity

// ดึง OAuth Access Token จาก Google ผ่าน chrome.identity
function getGoogleAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.identity?.getAuthToken) {
      return reject(new Error("Chrome Identity API is not available"));
    }

    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message || "Failed to get auth token"));
      }
      if (!token) {
        return reject(new Error("No auth token returned"));
      }
      resolve(token);
    });
  });
}

// ล้าง Token ที่แคชไว้ในกรณีที่ Token หมดอายุหรือเกิด Error 401
function removeCachedAuthToken(token) {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.identity?.removeCachedAuthToken) {
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    } else {
      resolve();
    }
  });
}

// แปลงสีที่เลือกให้เป็น Google Calendar colorId ("1"-"24") รองรับทั้งสีมาตรฐาน สีที่แคชไว้เดิม และสี Custom
function resolveCalendarColorId(selectedColor) {
  if (!selectedColor || selectedColor.id === "default") return null;

  const isValidId = (val) => {
    const num = Number(val);
    return Number.isInteger(num) && num >= 1 && num <= 24;
  };

  if (isValidId(selectedColor.calendarColorId)) {
    return String(Number(selectedColor.calendarColorId));
  }

  if (selectedColor.id && typeof GOOGLE_CALENDAR_COLORS !== "undefined" && Array.isArray(GOOGLE_CALENDAR_COLORS)) {
    const matched = GOOGLE_CALENDAR_COLORS.find((col) => col.id === selectedColor.id);
    if (matched && isValidId(matched.calendarColorId)) {
      return String(Number(matched.calendarColorId));
    }
  }

  if (selectedColor.hex && typeof getClosestCalendarColorId === "function") {
    const closest = getClosestCalendarColorId(selectedColor.hex);
    if (isValidId(closest)) {
      return String(Number(closest));
    }
  }

  return null;
}

// ค้นหาหรือสร้างปฏิทินย่อยสำหรับเทอมนั้นๆ เพื่อความสะดวกในการเปิด/ปิด หรือลบทั้งเทอม
async function getOrCreateSecondaryCalendar(token, title, lang = "th", selectedColor = null) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 1. ค้นหาใน Calendar List ของผู้ใช้ว่ามีปฏิทินชื่อนี้อยู่แล้วหรือไม่
  // หากมีอยู่แล้ว ให้ลบปฏิทินเดิมออกก่อนเพื่อป้องกันปัญหากิจกรรมซ้ำซ้อน (Duplicate Events)
  try {
    const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", { headers });
    if (listRes.ok) {
      const data = await listRes.json();
      const existing = (data.items || []).find((cal) => cal.summary === title);
      if (existing) {
        try {
          await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(existing.id)}`, {
            method: "DELETE",
            headers,
          });
        } catch (delErr) {
          console.warn("Could not delete existing calendar before recreate:", delErr);
        }
      }
    }
  } catch (e) {
    console.warn("Could not fetch calendar list, attempting to create new calendar:", e);
  }

  // 2. หากยังไม่มี ให้สร้างปฏิทินย่อยใหม่
  const desc = lang === "en"
    ? "Kasetsart University class schedule imported by KU Schedule"
    : "ตารางเรียน มหาวิทยาลัยเกษตรศาสตร์ นำเข้าโดย KU Schedule";

  const createRes = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST",
    headers,
    body: JSON.stringify({
      summary: title,
      description: desc,
      timeZone: "Asia/Bangkok",
    }),
  });

  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(`Failed to create calendar: ${createRes.status} ${errBody}`);
  }

  const newCal = await createRes.json();

  // กำหนดสีของปฏิทินย่อยใน calendarList ด้วย Google Calendar colorId (1-24)
  const calendarColorId = resolveCalendarColorId(selectedColor);
  if (calendarColorId) {
    try {
      const colorRes = await fetch(`https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(newCal.id)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          colorId: calendarColorId,
        }),
      });
      if (!colorRes.ok) {
        console.warn("Could not patch calendarList color:", colorRes.status, await colorRes.text());
      }
    } catch (colorErr) {
      console.warn("Could not patch calendarList color:", colorErr);
    }
  }

  return newCal.id;
}

// สร้างกิจกรรมรายวิชาใน Google Calendar
async function insertCalendarEvent(token, calendarId, eventData) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(eventData),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to insert event: ${res.status} ${errText}`);
  }

  return await res.json();
}

// สลับไปยังแท็บ Google Calendar หรือสร้างแท็บใหม่ (ไปยังหน้าปฏิทินหลักเสมอ)
async function openGoogleCalendarView() {
  const defaultUrl = "https://calendar.google.com/calendar/r";
  try {
    if (typeof chrome !== "undefined" && chrome?.tabs?.query) {
      const gcalTabs = await chrome.tabs.query({ url: "https://calendar.google.com/*" });
      if (gcalTabs && gcalTabs.length > 0) {
        const targetTab = gcalTabs[0];

        // ตรวจสอบ account index (เช่น /u/0/, /u/1/) เพื่อคง Google account เดิม
        const userMatch = targetTab.url ? targetTab.url.match(/\/calendar\/u\/(\d+)\//) : null;
        const mainUrl = userMatch
          ? `https://calendar.google.com/calendar/u/${userMatch[1]}/r`
          : defaultUrl;

        // บังคับเปลี่ยน URL ไปหน้าปฏิทินหลักเสมอ หากแท็บเดิมไม่ได้อยู่ที่หน้าหลัก (เช่น อยู่หน้า settings/export)
        const isMainView = targetTab.url && (
          targetTab.url.endsWith("/calendar/r") ||
          targetTab.url.endsWith("/calendar/r/") ||
          /\/calendar\/u\/\d+\/r\/?$/.test(targetTab.url)
        );

        const updateInfo = { active: true };
        if (!isMainView) {
          updateInfo.url = mainUrl;
        }

        await chrome.tabs.update(targetTab.id, updateInfo);

        // หากเปิดหน้า Google Calendar อยู่แล้ว ให้ reload หน้าเว็บเพื่อดึงข้อมูลปฏิทินและกิจกรรมใหม่ทันที
        if (isMainView && chrome.tabs?.reload) {
          try {
            await chrome.tabs.reload(targetTab.id);
          } catch (reloadErr) {
            console.warn("Could not reload Google Calendar tab:", reloadErr);
          }
        }

        if (targetTab.windowId && chrome.windows?.update) {
          await chrome.windows.update(targetTab.windowId, { focused: true });
        }
        return;
      }
      await chrome.tabs.create({ url: defaultUrl });
      return;
    }
  } catch (e) { }
  window.open(defaultUrl, "_blank");
}

// ซิงค์ตารางเรียนทั้งหมดเข้าสู่ Google Calendar โดยตรง
async function syncScheduleToGoogleCalendar({
  courses,
  studentInfo,
  lang = "th",
  titleFormat = "name_room",
  selectedColor = null,
  onProgress = () => { },
}) {
  if (!courses || courses.length === 0) {
    throw new Error("NO_COURSES");
  }

  // 1. ดึง OAuth Token
  onProgress(lang === "en" ? "Connecting to Google Account..." : "กำลังเชื่อมต่อกับ Google Account...");
  let token;
  try {
    token = await getGoogleAuthToken(true);
  } catch (err) {
    throw err;
  }

  // 2. เตรียมชื่อปฏิทินตามปีและภาคการศึกษา
  const semKey = (studentInfo?.semester !== "" && studentInfo?.semester != null) ? String(studentInfo.semester) : "1";
  const semText = formatSemester(semKey, lang);
  const yearText = studentInfo?.academicYear || "";
  const calTitle = lang === "en"
    ? `KU Schedule (${yearText}/${semText})`
    : `ตารางเรียน มก. (${yearText} ${semText})`;

  onProgress(lang === "en" ? "Setting up calendar..." : "กำลังจัดเตรียมปฏิทิน...");
  let calendarId;
  try {
    calendarId = await getOrCreateSecondaryCalendar(token, calTitle, lang, selectedColor);
  } catch (err) {
    // หาก Token หมดอายุ หรือสิทธิ์ไม่พอ (401/403) ลองเคลียร์แคชและขอ Token ใหม่ 1 ครั้ง
    if (String(err).includes("401") || String(err).includes("403")) {
      await removeCachedAuthToken(token);
      token = await getGoogleAuthToken(true);
      calendarId = await getOrCreateSecondaryCalendar(token, calTitle, lang, selectedColor);
    } else {
      throw err;
    }
  }

  // 3. วนลูปสร้างกิจกรรมสำหรับแต่ละวิชา
  let insertedCount = 0;
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    const timing = getCourseEventTiming(c);
    if (!timing) continue;

    const summary = formatCourseTitle(c, titleFormat, lang);

    const progressMsg = lang === "en"
      ? `Adding (${i + 1}/${courses.length}): ${summary}...`
      : `กำลังเพิ่ม (${i + 1}/${courses.length}): ${summary}...`;
    onProgress(progressMsg);

    const eventPayload = {
      summary,
      start: {
        dateTime: timing.startIso,
        timeZone: "Asia/Bangkok",
      },
      end: {
        dateTime: timing.endIso,
        timeZone: "Asia/Bangkok",
      },
      recurrence: [`RRULE:FREQ=WEEKLY;UNTIL=${timing.untilStr}`],
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 30 }],
      },
    };

    await insertCalendarEvent(token, calendarId, eventPayload);
    insertedCount++;
  }

  // 4. เปิดแท็บ Google Calendar เมื่อเสร็จสิ้น
  await openGoogleCalendarView();

  return { success: true, count: insertedCount, calendarTitle: calTitle };
}
