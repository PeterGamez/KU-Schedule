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
  const [h, m] = timeStr.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
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
