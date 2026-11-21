// ส่งออกตารางเรียนเป็นไฟล์ iCalendar (.ics) สำหรับ Google Calendar / Apple Calendar

// ดึงประเภทคาบเรียน (Lec / Lab หรือ บรรยาย / ปฏิบัติ) จาก JSON ของ My KU
// หมายเหตุ: ใน JSON ของ My KU:
// - 'section_type_th' คือ "บรรยาย" หรือ "ปฏิบัติ"
// - 'section_type_en' คือ "Lecture" หรือ "Laboratory"
function getCourseType(course, lang = "th") {
  if (!course) return "";
  const typeTh = String(course.section_type_th || "").trim();
  const typeEn = String(course.section_type_en || "").trim();

  if (lang === "en") {
    const lower = typeEn.toLowerCase();
    if (lower.includes("lecture") || typeTh.includes("บรรยาย")) return "Lec";
    if (lower.includes("lab") || typeTh.includes("ปฏิบัติ")) return "Lab";
    return typeEn || typeTh;
  } else {
    if (typeTh.includes("บรรยาย") || typeEn.toLowerCase().includes("lecture")) return "บรรยาย";
    if (typeTh.includes("ปฏิบัติ") || typeEn.toLowerCase().includes("lab")) return "ปฏิบัติ";
    return typeTh || typeEn;
  }
}

// จัดรูปแบบชื่อวิชาสำหรับแสดงในปฏิทินตามรูปแบบที่เลือก
function formatCourseTitle(course, formatKey = "name_room", lang = "th") {
  const code = course?.subject_code ? String(course.subject_code).trim() : "";
  const name = getCourseName(course, lang) || "";
  const rawRoom = getCourseRoom(course, lang);
  const room = rawRoom && rawRoom.trim() !== "-" ? rawRoom.trim() : "";
  const type = getCourseType(course, lang);
  const sec = course?.section_code
    ? (lang === "en" ? `Sec ${course.section_code}` : `หมู่ ${course.section_code}`)
    : "";

  switch (formatKey) {
    // กลุ่มมาตรฐาน (เน้นอ่านง่าย กระชับ)
    case "name_room": {
      return room ? `${name} - ${room}` : name;
    }
    case "name_room_brackets": {
      return room ? `${name} (${room})` : name;
    }
    case "name_only": {
      return name;
    }

    // กลุ่มระบุหมู่เรียน (Section)
    case "name_sec_room": {
      const mid = sec ? ` (${sec})` : "";
      return room ? `${name}${mid} - ${room}` : `${name}${mid}`;
    }
    case "name_room_sec": {
      if (room && sec) return `${name} - ${room} (${sec})`;
      if (room) return `${name} - ${room}`;
      if (sec) return `${name} (${sec})`;
      return name;
    }

    // กลุ่มระบุประเภทคาบ (Type: Lec / Lab)
    case "name_type_room": {
      const typePart = type ? ` (${type})` : "";
      return room ? `${name}${typePart} - ${room}` : `${name}${typePart}`;
    }
    case "name_type_sec_room": {
      const typeSec = [type, sec].filter(Boolean).join(", ");
      const paren = typeSec ? ` (${typeSec})` : "";
      return room ? `${name}${paren} - ${room}` : `${name}${paren}`;
    }

    // กลุ่มแสดงรหัสวิชา (Code)
    case "code_name_room": {
      const prefix = code ? `[${code}] ` : "";
      return room ? `${prefix}${name} - ${room}` : `${prefix}${name}`;
    }
    case "code_name_type_room": {
      const prefix = code ? `[${code}] ` : "";
      const typePart = type ? ` (${type})` : "";
      return room ? `${prefix}${name}${typePart} - ${room}` : `${prefix}${name}${typePart}`;
    }
    case "code_name_sec_room": {
      const prefix = code ? `[${code}] ` : "";
      const secPart = sec ? ` (${sec})` : "";
      return room ? `${prefix}${name}${secPart} - ${room}` : `${prefix}${name}${secPart}`;
    }

    default: {
      return room ? `${name} - ${room}` : name;
    }
  }
}

// สร้างเนื้อหาไฟล์ iCalendar (RFC 5545) จากรายการวิชาเรียน
function generateICSContent(courses, lang, titleFormat = "name_room") {
  const dayMap = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6 };
  const pad = (n) => String(n).padStart(2, "0");

  const now = new Date();
  const nowUtc = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const calTitle = lang === "en" ? "KU Schedule" : "ตารางเรียน KU";
  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KU Schedule Extension//TH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${calTitle}`,
    "X-WR-TIMEZONE:Asia/Bangkok",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Bangkok",
    "X-LIC-LOCATION:Asia/Bangkok",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0700",
    "TZOFFSETTO:+0700",
    "TZNAME:ICT",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  courses.forEach((c) => {
    const timing = getCourseEventTiming(c);
    if (!timing) return;

    // จัดเตรียมข้อมูลวิชา
    const summary = formatCourseTitle(c, titleFormat, lang);

    const escapeIcs = (str) =>
      String(str)
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");

    const uid = `ku-${c.section_id}-${timing.year}${timing.month}${timing.day}@kuschedule`;
    const reminderDesc = lang === "en" ? "Class reminder: 30 minutes before" : "แจ้งเตือนก่อนเริ่มเรียน 30 นาที";

    icsLines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${nowUtc}`,
      `SUMMARY:${escapeIcs(summary)}`,
      `DTSTART;TZID=Asia/Bangkok:${timing.dtStart}`,
      `DTEND;TZID=Asia/Bangkok:${timing.dtEnd}`,
      `RRULE:FREQ=WEEKLY;UNTIL=${timing.untilStr}`,
      "STATUS:CONFIRMED",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcs(reminderDesc)}`,
      "TRIGGER:-PT30M",
      "END:VALARM",
      "END:VEVENT"
    );
  });

  icsLines.push("END:VCALENDAR");
  return icsLines.join("\r\n");
}

// เปิดหรือสลับไปยังแท็บ Google Calendar Import (หากเปิดอยู่แล้วจะไม่เปิดแท็บซ้ำแต่จะสลับและเปลี่ยนหน้าแทน)
async function openGoogleCalendarImport() {
  const defaultUrl = "https://calendar.google.com/calendar/r/settings/export";

  try {
    if (typeof chrome !== "undefined" && chrome?.tabs?.query) {
      const gcalTabs = await chrome.tabs.query({ url: "https://calendar.google.com/*" });
      if (gcalTabs && gcalTabs.length > 0) {
        const targetTab = gcalTabs[0];

        // ตรวจสอบ account index (เช่น /u/0/, /u/1/) เพื่อคง Google account เดิมที่เปิดอยู่
        const userMatch = targetTab.url ? targetTab.url.match(/\/calendar\/u\/(\d+)\//) : null;
        const targetUrl = userMatch
          ? `https://calendar.google.com/calendar/u/${userMatch[1]}/r/settings/export`
          : defaultUrl;

        const isAlreadyExportPage = targetTab.url && targetTab.url.includes("/settings/export");
        const updateInfo = { active: true };
        if (!isAlreadyExportPage) {
          updateInfo.url = targetUrl;
        }

        await chrome.tabs.update(targetTab.id, updateInfo);
        if (targetTab.windowId && chrome.windows?.update) {
          await chrome.windows.update(targetTab.windowId, { focused: true });
        }
        return;
      }

      await chrome.tabs.create({ url: defaultUrl });
      return;
    }
  } catch (err) {
    console.error("Open Google Calendar Error:", err);
  }

  window.open(defaultUrl, "_blank");
}

async function handleExportICS({
  currentCourses,
  currentStudentInfo,
  currentLang,
  titleFormat = "name_room",
  showAlertKey,
  hideAlert,
  setExportIcsLoading,
  exportIcsBtnText,
}) {
  if (!currentCourses || currentCourses.length === 0) {
    showAlertKey("EXPORT_ICS_NO_COURSES");
    return;
  }

  hideAlert();
  setExportIcsLoading(true);

  try {
    const icsString = generateICSContent(currentCourses, currentLang, titleFormat);
    const blob = new Blob([icsString], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    const fileName = getExportFileName(currentStudentInfo, "ics");

    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    // สลับไปยังหน้า Google Calendar Import (หากเปิดอยู่แล้วจะไม่เปิดแท็บซ้ำแต่จะสลับและเปลี่ยนหน้าแทน)
    await openGoogleCalendarImport();

    if (exportIcsBtnText) {
      exportIcsBtnText.textContent = I18N[currentLang].exportIcsBtnSuccess;
    }
    setTimeout(() => {
      setExportIcsLoading(false);
    }, 1800);
  } catch (err) {
    console.error("Export ICS Error:", err);
    showAlertKey("EXPORT_ICS_ERROR");
    setExportIcsLoading(false);
  }
}
