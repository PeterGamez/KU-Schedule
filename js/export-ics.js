// ส่งออกตารางเรียนเป็นไฟล์ iCalendar (.ics) สำหรับ Google Calendar / Apple Calendar

// สร้างเนื้อหาไฟล์ iCalendar (RFC 5545) จากรายการวิชาเรียน
function generateICSContent(courses, lang) {
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

  courses.forEach((c, idx) => {
    const dayKey = normalizeDay(c.day_w);
    const targetWeekday = dayMap[dayKey];
    if (targetWeekday === undefined) return;

    // วันเริ่มต้นและสิ้นสุดภาคเรียน (คำนวณตามเวลาท้องถิ่นประเทศไทย UTC+7)
    const wsMs = c.weekstartday ? new Date(c.weekstartday).getTime() : NaN;
    const weMs = c.weekendday ? new Date(c.weekendday).getTime() : NaN;
    if (isNaN(wsMs) || isNaN(weMs)) return;

    const wsDate = new Date(wsMs + 7 * 3600 * 1000);
    const weDate = new Date(weMs + 7 * 3600 * 1000);

    // คำนวณวันแรกที่วิชานี้เริ่มเรียน (นับจากวันเริ่มภาคเรียน)
    const wsWeekday = (wsDate.getUTCDay() + 6) % 7;
    const daysAhead = (targetWeekday - wsWeekday + 7) % 7;
    const firstClassDate = new Date(wsDate.getTime() + daysAhead * 86400000);

    // คำนวณเวลาเริ่มและสิ้นสุดของวิชาเรียน
    const { startMin, endMin } = getCourseMinutes(c);
    const sH = startMin !== null ? Math.floor(startMin / 60) : 8;
    const sM = startMin !== null ? startMin % 60 : 0;
    const eH = endMin !== null ? Math.floor(endMin / 60) : (sH + 1);
    const eM = endMin !== null ? endMin % 60 : 0;

    const y = firstClassDate.getUTCFullYear();
    const m = pad(firstClassDate.getUTCMonth() + 1);
    const d = pad(firstClassDate.getUTCDate());

    const dtStart = `${y}${m}${d}T${pad(sH)}${pad(sM)}00`;
    const dtEnd = `${y}${m}${d}T${pad(eH)}${pad(eM)}00`;

    // วันสิ้นสุดการทำซ้ำ (UNTIL): สิ้นสุดเวลา 23:59:59 น. เวลาไทย (UTC+7) -> แปลงเป็น UTC = 16:59:59Z
    const weY = weDate.getUTCFullYear();
    const weM = pad(weDate.getUTCMonth() + 1);
    const weD = pad(weDate.getUTCDate());
    const untilStr = `${weY}${weM}${weD}T165959Z`;

    // จัดเตรียมข้อมูลวิชา
    const subjName = lang === "en" ? (c.subject_name_en || c.subject_name_th) : (c.subject_name_th || c.subject_name_en);
    const room = lang === "en" ? (c.room_name_en || c.room_name_th) : (c.room_name_th || c.room_name_en);

    // ตั้งชื่อหัวข้อ Event: "ชื่อวิชา - ห้องเรียน" (ถ้ามีห้องเรียนหรือให้ติดต่อผู้สอน ก็ต่อท้ายได้เลย)
    const roomSuffix = room ? ` - ${room}` : "";
    const summary = `${subjName}${roomSuffix}`.trim();

    const escapeIcs = (str) =>
      String(str || "")
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");

    const uid = `ku-${c.section_id || idx}-${y}${m}${d}@kuschedule`;
    const reminderDesc = lang === "en" ? "Class reminder: 30 minutes before" : "แจ้งเตือนก่อนเริ่มเรียน 30 นาที";

    icsLines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${nowUtc}`,
      `SUMMARY:${escapeIcs(summary)}`,
      `DTSTART;TZID=Asia/Bangkok:${dtStart}`,
      `DTEND;TZID=Asia/Bangkok:${dtEnd}`,
      `RRULE:FREQ=WEEKLY;UNTIL=${untilStr}`,
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

async function handleExportICS({
  currentCourses,
  currentStudentInfo,
  yearSelect,
  semesterSelect,
  currentLang,
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
    const icsString = generateICSContent(currentCourses, currentLang);
    const blob = new Blob([icsString], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    const year = currentStudentInfo?.academicYear || yearSelect?.value || "";
    const sem = (currentStudentInfo?.semester != null && currentStudentInfo.semester !== "")
      ? currentStudentInfo.semester
      : (semesterSelect?.value || "");
    const semStr = sem !== "" ? `sem${sem}` : "";
    const fileName = ["KU_Schedule", year, semStr].filter(Boolean).join("_") + ".ics";

    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    if (exportIcsBtnText) exportIcsBtnText.textContent = I18N[currentLang].exportIcsBtnSuccess;
    setTimeout(() => {
      setExportIcsLoading(false);
    }, 1800);
  } catch (err) {
    console.error("Export ICS Error:", err);
    showAlertKey("EXPORT_ICS_ERROR");
    setExportIcsLoading(false);
  }
}
