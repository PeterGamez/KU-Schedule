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

  courses.forEach((c) => {
    const targetWeekday = dayMap[normalizeDay(c.day_w)];
    if (targetWeekday === undefined) return;

    // วันเริ่มต้นและสิ้นสุดภาคเรียน (คำนวณตามเวลาท้องถิ่นประเทศไทย UTC+7)
    const wsMs = new Date(c.weekstartday).getTime();
    const weMs = new Date(c.weekendday).getTime();
    if (isNaN(wsMs) || isNaN(weMs)) return;

    const wsDate = new Date(wsMs + 7 * 3600 * 1000);
    const weDate = new Date(weMs + 7 * 3600 * 1000);

    // คำนวณวันแรกที่วิชานี้เริ่มเรียน (นับจากวันเริ่มภาคเรียน)
    const wsWeekday = (wsDate.getUTCDay() + 6) % 7;
    const daysAhead = (targetWeekday - wsWeekday + 7) % 7;
    const firstClassDate = new Date(wsDate.getTime() + daysAhead * 86400000);

    // คำนวณเวลาเริ่มและสิ้นสุดของวิชาเรียน
    const { startMin, endMin } = getCourseMinutes(c);
    if (startMin === null || endMin === null) return;

    const startHour = Math.floor(startMin / 60);
    const startMinute = startMin % 60;
    const endHour = Math.floor(endMin / 60);
    const endMinute = endMin % 60;

    const y = firstClassDate.getUTCFullYear();
    const m = pad(firstClassDate.getUTCMonth() + 1);
    const d = pad(firstClassDate.getUTCDate());

    const dtStart = `${y}${m}${d}T${pad(startHour)}${pad(startMinute)}00`;
    const dtEnd = `${y}${m}${d}T${pad(endHour)}${pad(endMinute)}00`;

    // วันสิ้นสุดการทำซ้ำ (UNTIL): สิ้นสุดเวลา 23:59:59 น. เวลาไทย (UTC+7) -> แปลงเป็น UTC = 16:59:59Z
    const weY = weDate.getUTCFullYear();
    const weM = pad(weDate.getUTCMonth() + 1);
    const weD = pad(weDate.getUTCDate());
    const untilStr = `${weY}${weM}${weD}T165959Z`;

    // จัดเตรียมข้อมูลวิชา
    const subjName = getCourseName(c, lang);
    const room = getCourseRoom(c, lang);
    const summary = room ? `${subjName} - ${room}` : subjName;

    const escapeIcs = (str) =>
      String(str)
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");

    const uid = `ku-${c.section_id}-${y}${m}${d}@kuschedule`;
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

    const fileName = getExportFileName(currentStudentInfo, "ics");

    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

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
