// ส่งออกตารางเรียนเป็นไฟล์ iCalendar (.ics) สำหรับ Google Calendar / Apple Calendar

// รายการ 24 สีมาตรฐานของ Google Calendar (สำหรับปฏิทิน)
const GOOGLE_CALENDAR_COLORS = [
  // แถวที่ 1 (12 สี)
  { id: "radicchio", name: "Radicchio", hex: "#ad1457", calendarColorId: "21" },
  { id: "cherry_blossom", name: "Cherry Blossom", hex: "#d81b60", calendarColorId: "22" },
  { id: "flamingo", name: "Flamingo", hex: "#e67c73", calendarColorId: "2" },
  { id: "tomato", name: "Tomato", hex: "#d50000", calendarColorId: "3" },
  { id: "tangerine", name: "Tangerine", hex: "#f4511e", calendarColorId: "4" },
  { id: "pumpkin", name: "Pumpkin", hex: "#ef6c00", calendarColorId: "5" },
  { id: "mango", name: "Mango", hex: "#f09300", calendarColorId: "6" },
  { id: "banana", name: "Banana", hex: "#f6bf26", calendarColorId: "12" },
  { id: "citron", name: "Citron", hex: "#e4c441", calendarColorId: "11" },
  { id: "avocado", name: "Avocado", hex: "#c0ca33", calendarColorId: "10" },
  { id: "pistachio", name: "Pistachio", hex: "#7cb342", calendarColorId: "9" },
  { id: "basil", name: "Basil", hex: "#0b8043", calendarColorId: "8" },

  // แถวที่ 2 (12 สี)
  { id: "eucalyptus", name: "Eucalyptus", hex: "#009688", calendarColorId: "7" },
  { id: "sage", name: "Sage", hex: "#33b679", calendarColorId: "13" },
  { id: "peacock", name: "Peacock", hex: "#039be5", calendarColorId: "14" },
  { id: "cobalt", name: "Cobalt", hex: "#4285f4", calendarColorId: "15" },
  { id: "blueberry", name: "Blueberry", hex: "#3f51b5", calendarColorId: "16" },
  { id: "lavender", name: "Lavender", hex: "#7986cb", calendarColorId: "17" },
  { id: "wisteria", name: "Wisteria", hex: "#b39ddb", calendarColorId: "18" },
  { id: "amethyst", name: "Amethyst", hex: "#9e69af", calendarColorId: "24" },
  { id: "grape", name: "Grape", hex: "#8e24aa", calendarColorId: "23" },
  { id: "cocoa", name: "Cocoa", hex: "#795548", calendarColorId: "1" },
  { id: "graphite", name: "Graphite", hex: "#616161", calendarColorId: "19" },
  { id: "birch", name: "Birch", hex: "#a79b8e", calendarColorId: "20" },
];

// ค้นหา Calendar Color ID (1 - 24) ที่ใกล้เคียงกับสี HEX ที่กำหนดมากที่สุด
function getClosestCalendarColorId(hex) {
  if (!hex) return null;
  let clean = String(hex).trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(clean)) {
    clean = clean.split("").map((ch) => ch + ch).join("");
  }
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;

  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);

  let bestId = null;
  let minDist = Infinity;

  GOOGLE_CALENDAR_COLORS.forEach((col) => {
    const tClean = col.hex.replace("#", "");
    const tr = parseInt(tClean.substring(0, 2), 16);
    const tg = parseInt(tClean.substring(2, 4), 16);
    const tb = parseInt(tClean.substring(4, 6), 16);
    const dist = Math.pow(r - tr, 2) + Math.pow(g - tg, 2) + Math.pow(b - tb, 2);
    if (dist < minDist) {
      minDist = dist;
      bestId = col.calendarColorId;
    }
  });

  return bestId;
}

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

// สร้างเนื้อหาไฟล์ iCalendar (RFC 5545 / RFC 7986) จากรายการวิชาเรียน
function generateICSContent(courses, lang, titleFormat = "name_room", selectedColor = null) {
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
  ];

  // กำหนดสีของปฏิทินในระดับ VCALENDAR (รองรับ Apple Calendar, Outlook และ RFC 7986)
  if (selectedColor && selectedColor.hex) {
    icsLines.push(
      `X-APPLE-CALENDAR-COLOR:${selectedColor.hex}`,
      `X-OUTLOOK-COLOR:${selectedColor.hex}`,
      `COLOR:${selectedColor.hex}`
    );
  }

  icsLines.push(
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Bangkok",
    "X-LIC-LOCATION:Asia/Bangkok",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0700",
    "TZOFFSETTO:+0700",
    "TZNAME:ICT",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE"
  );

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

    const safeSectionId = String(c.section_id ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    const uid = `ku-${safeSectionId}-${timing.year}${timing.month}${timing.day}@kuschedule`;

    icsLines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${nowUtc}`,
      `SUMMARY:${escapeIcs(summary)}`,
      `DTSTART;TZID=Asia/Bangkok:${timing.dtStart}`,
      `DTEND;TZID=Asia/Bangkok:${timing.dtEnd}`,
      `RRULE:FREQ=WEEKLY;UNTIL=${timing.untilStr}`,
      "STATUS:CONFIRMED"
    );

    // กำหนดสีของกิจกรรมรายวิชา (RFC 7986)
    if (selectedColor && selectedColor.hex) {
      icsLines.push(`COLOR:${selectedColor.hex}`);
    }

    icsLines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
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
  selectedColor = null,
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
    const icsString = generateICSContent(currentCourses, currentLang, titleFormat, selectedColor);
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
