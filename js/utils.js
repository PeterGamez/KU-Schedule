// ฟังก์ชันยูทิลิตี้ทั่วไปสำหรับ KU Schedule

// แปลงค่าวันจาก API ให้เป็นรหัสวันมาตรฐาน (MON, TUE, ...)
function normalizeDay(dayRaw) {
  return dayRaw ? String(dayRaw).trim().toUpperCase() : null;
}

// คำนวณเวลาเริ่มและสิ้นสุดของวิชาเรียนในหน่วยนาทีนับจาก 00:00 น.
function getCourseMinutes(c) {
  const startMin = parseTime(c.time_from) ?? (typeof c.time_start === "number" ? c.time_start : null);
  const endMin = parseTime(c.time_to) ?? (startMin !== null ? startMin + 60 : null);
  return { startMin, endMin };
}

// แปลงข้อความแสดงเวลา (เช่น "09:00", "9:00") เป็นนาที
function parseTime(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).trim().split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

// แปลงรหัสภาคเรียนเป็นข้อความแสดงผล (0 = ภาคฤดูร้อน, 1 = ภาคต้น, 2 = ภาคปลาย)
function formatSemester(sem, lang) {
  if (sem === null || sem === undefined) return "";
  const s = sem.toString().trim();
  return I18N[lang]?.semesters?.[s];
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
