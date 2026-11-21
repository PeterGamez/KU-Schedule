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

// ค้นหาหรือสร้างปฏิทินย่อยสำหรับเทอมนั้นๆ เพื่อความสะดวกในการเปิด/ปิด หรือลบทั้งเทอม
async function getOrCreateSecondaryCalendar(token, title, lang = "th") {
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

// สลับไปยังแท็บ Google Calendar หรือสร้างแท็บใหม่
async function openGoogleCalendarView() {
  const defaultUrl = "https://calendar.google.com/calendar/r";
  try {
    if (typeof chrome !== "undefined" && chrome?.tabs?.query) {
      const gcalTabs = await chrome.tabs.query({ url: "https://calendar.google.com/*" });
      if (gcalTabs && gcalTabs.length > 0) {
        const targetTab = gcalTabs[0];
        await chrome.tabs.update(targetTab.id, { active: true });
        if (targetTab.windowId) {
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
  const semText = formatSemester(studentInfo?.semester || "1", lang);
  const yearText = studentInfo?.academicYear || "";
  const calTitle = lang === "en"
    ? `KU Schedule (${yearText}/${semText})`
    : `ตารางเรียน มก. (${yearText} ${semText})`;

  onProgress(lang === "en" ? "Setting up calendar..." : "กำลังจัดเตรียมปฏิทิน...");
  let calendarId;
  try {
    calendarId = await getOrCreateSecondaryCalendar(token, calTitle, lang);
  } catch (err) {
    // หาก Token หมดอายุ ลองเคลียร์แคชและขอใหม่ 1 ครั้ง
    if (String(err).includes("401")) {
      await removeCachedAuthToken(token);
      token = await getGoogleAuthToken(true);
      calendarId = await getOrCreateSecondaryCalendar(token, calTitle, lang);
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
    const rawRoom = getCourseRoom(c, lang);
    const room = rawRoom && rawRoom.trim() !== "-" ? rawRoom.trim() : "";

    const progressMsg = lang === "en"
      ? `Adding (${i + 1}/${courses.length}): ${summary}...`
      : `กำลังเพิ่ม (${i + 1}/${courses.length}): ${summary}...`;
    onProgress(progressMsg);

    const eventPayload = {
      summary,
      location: room || undefined,
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
