// ฟังก์ชันยูทิลิตี้ทั่วไปสำหรับ KU Schedule

// แปลงค่าวันจาก API ให้เป็นรหัสวันมาตรฐาน (MON, TUE, ...)
function normalizeDay(dayRaw) {
  return dayRaw ? dayRaw.trim().toUpperCase() : null;
}

// คำนวณเวลาเริ่มและสิ้นสุดของวิชาเรียนในหน่วยนาทีนับจาก 00:00 น.
function getCourseMinutes(c) {
  return {
    startMin: parseTime(c.time_from),
    endMin: parseTime(c.time_to),
  };
}

// แปลงข้อความแสดงเวลา (เช่น "09:00", "9:00") เป็นนาที
function parseTime(timeStr) {
  if (!timeStr) return null;
  const [hStr, mStr] = String(timeStr).split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// แปลงรหัสภาคเรียนเป็นข้อความแสดงผล (0 = ภาคฤดูร้อน, 1 = ภาคต้น, 2 = ภาคปลาย)
function formatSemester(sem, lang) {
  return I18N[lang].semesters[sem] || "";
}

// ดึงชื่อวิชาตามภาษาที่เลือก
function getCourseName(course, lang) {
  return lang === "en"
    ? (course.subject_name_en || course.subject_name_th)
    : (course.subject_name_th || course.subject_name_en);
}

// ดึงชื่อห้องเรียนตามภาษาที่เลือก
function getCourseRoom(course, lang) {
  return lang === "en"
    ? (course.room_name_en || course.room_name_th)
    : (course.room_name_th || course.room_name_en);
}

// สร้างชื่อไฟล์สำหรับส่งออก (ICS, PNG)
function getExportFileName(info, ext) {
  return `KU_Schedule_${info.academicYear}_sem${info.semester}.${ext}`;
}

// คำนวณวันและเวลาสำหรับกิจกรรมในปฏิทิน (ICS และ Google Calendar)
function getCourseEventTiming(course) {
  const dayMap = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6 };
  const pad = (n) => String(n).padStart(2, "0");

  const targetWeekday = dayMap[normalizeDay(course.day_w)];
  if (targetWeekday === undefined) return null;

  const wsMs = new Date(course.weekstartday).getTime();
  const weMs = new Date(course.weekendday).getTime();
  if (isNaN(wsMs) || isNaN(weMs)) return null;

  const wsDate = new Date(wsMs + 7 * 3600 * 1000);
  const weDate = new Date(weMs + 7 * 3600 * 1000);

  const wsWeekday = (wsDate.getUTCDay() + 6) % 7;
  const daysAhead = (targetWeekday - wsWeekday + 7) % 7;
  const firstClassDate = new Date(wsDate.getTime() + daysAhead * 86400000);

  const { startMin, endMin } = getCourseMinutes(course);
  if (startMin === null || endMin === null) return null;

  const startHour = Math.floor(startMin / 60);
  const startMinute = startMin % 60;
  const endHour = Math.floor(endMin / 60);
  const endMinute = endMin % 60;

  const y = firstClassDate.getUTCFullYear();
  const m = pad(firstClassDate.getUTCMonth() + 1);
  const d = pad(firstClassDate.getUTCDate());

  const weY = weDate.getUTCFullYear();
  const weM = pad(weDate.getUTCMonth() + 1);
  const weD = pad(weDate.getUTCDate());
  const untilStr = `${weY}${weM}${weD}T165959Z`;

  return {
    year: y,
    month: m,
    day: d,
    startHour,
    startMinute,
    endHour,
    endMinute,
    dtStart: `${y}${m}${d}T${pad(startHour)}${pad(startMinute)}00`,
    dtEnd: `${y}${m}${d}T${pad(endHour)}${pad(endMinute)}00`,
    startIso: `${y}-${m}-${d}T${pad(startHour)}:${pad(startMinute)}:00+07:00`,
    endIso: `${y}-${m}-${d}T${pad(endHour)}:${pad(endMinute)}:00+07:00`,
    untilStr,
  };
}

// ป้องกัน XSS จากข้อความที่นำไปแทรกใน HTML
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
