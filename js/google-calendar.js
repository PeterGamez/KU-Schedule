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
  try {
    const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", { headers });
    if (listRes.ok) {
      const data = await listRes.json();
      const existing = (data.items || []).find((cal) => cal.summary === title);
      if (existing) {
        return existing.id;
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
  const dayMap = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6 };
  const pad = (n) => String(n).padStart(2, "0");

  let insertedCount = 0;
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    const targetWeekday = dayMap[normalizeDay(c.day_w)];
    if (targetWeekday === undefined) continue;

    const wsMs = new Date(c.weekstartday).getTime();
    const weMs = new Date(c.weekendday).getTime();
    if (isNaN(wsMs) || isNaN(weMs)) continue;

    const wsDate = new Date(wsMs + 7 * 3600 * 1000);
    const weDate = new Date(weMs + 7 * 3600 * 1000);

    const wsWeekday = (wsDate.getUTCDay() + 6) % 7;
    const daysAhead = (targetWeekday - wsWeekday + 7) % 7;
    const firstClassDate = new Date(wsDate.getTime() + daysAhead * 86400000);

    const { startMin, endMin } = getCourseMinutes(c);
    if (startMin === null || endMin === null) continue;

    const startHour = Math.floor(startMin / 60);
    const startMinute = startMin % 60;
    const endHour = Math.floor(endMin / 60);
    const endMinute = endMin % 60;

    const y = firstClassDate.getUTCFullYear();
    const m = pad(firstClassDate.getUTCMonth() + 1);
    const d = pad(firstClassDate.getUTCDate());

    const startDateTime = `${y}-${m}-${d}T${pad(startHour)}:${pad(startMinute)}:00+07:00`;
    const endDateTime = `${y}-${m}-${d}T${pad(endHour)}:${pad(endMinute)}:00+07:00`;

    const weY = weDate.getUTCFullYear();
    const weM = pad(weDate.getUTCMonth() + 1);
    const weD = pad(weDate.getUTCDate());
    const untilStr = `${weY}${weM}${weD}T165959Z`;

    const summary = formatCourseTitle(c, titleFormat, lang);
    const rawRoom = getCourseRoom(c, lang);
    const room = rawRoom && rawRoom.trim() !== "-" ? rawRoom.trim() : "";

    // รายละเอียดใน Description
    const descParts = [];
    if (c.subject_code) descParts.push(`${lang === "en" ? "Course Code" : "รหัสวิชา"}: ${c.subject_code}`);
    if (c.section_code) descParts.push(`${lang === "en" ? "Section" : "หมู่เรียน"}: ${c.section_code}`);
    const typeLabel = getCourseType(c, lang);
    if (typeLabel) descParts.push(`${lang === "en" ? "Type" : "ประเภท"}: ${typeLabel}`);
    if (room) descParts.push(`${lang === "en" ? "Room" : "ห้องเรียน"}: ${room}`);
    const teacher = lang === "en" ? (c.teacher_name_en || c.teacher_name) : (c.teacher_name || c.teacher_name_en);
    if (teacher) descParts.push(`${lang === "en" ? "Instructor" : "อาจารย์ผู้สอน"}: ${teacher}`);

    const progressMsg = lang === "en"
      ? `Adding (${i + 1}/${courses.length}): ${summary}...`
      : `กำลังเพิ่ม (${i + 1}/${courses.length}): ${summary}...`;
    onProgress(progressMsg);

    const eventPayload = {
      summary,
      location: room || undefined,
      description: descParts.join("\n"),
      start: {
        dateTime: startDateTime,
        timeZone: "Asia/Bangkok",
      },
      end: {
        dateTime: endDateTime,
        timeZone: "Asia/Bangkok",
      },
      recurrence: [`RRULE:FREQ=WEEKLY;UNTIL=${untilStr}`],
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
