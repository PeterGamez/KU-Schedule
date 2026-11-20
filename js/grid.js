// วาดตารางเรียนและกล่องวิชาเรียน (Schedule Grid)

const START_HOUR = 8;
const END_HOUR = 20;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const TOTAL_MINUTES = TOTAL_HOURS * 60;

const DAYS = [
  { key: "MON", class: "day-mon" },
  { key: "TUE", class: "day-tue" },
  { key: "WED", class: "day-wed" },
  { key: "THU", class: "day-thu" },
  { key: "FRI", class: "day-fri" },
  { key: "SAT", class: "day-sat" },
  { key: "SUN", class: "day-sun" },
];

const DAY_THEMES = {
  MON: { bg: "#FEF08A", border: "#CA8A04" },
  TUE: { bg: "#FBCFE8", border: "#DB2777" },
  WED: { bg: "#BBF7D0", border: "#16A34A" },
  THU: { bg: "#FED7AA", border: "#EA580C" },
  FRI: { bg: "#BAE6FD", border: "#0284C7" },
  SAT: { bg: "#E9D5FF", border: "#9333EA" },
  SUN: { bg: "#FECACA", border: "#DC2626" },
};

// สร้างส่วนหัวตารางแสดงช่วงเวลาแต่ละชั่วโมง (เช่น 08:00 - 09:00)
function initGridHeader(hoursTrack) {
  if (!hoursTrack) return;
  hoursTrack.innerHTML = "";
  for (let h = START_HOUR; h < END_HOUR; h++) {
    const col = document.createElement("div");
    col.className = "hour-cell";
    const startStr = `${h.toString().padStart(2, "0")}:00`;
    const endStr = `${(h + 1).toString().padStart(2, "0")}:00`;

    col.innerHTML = `
      <span class="period-range">${startStr} - ${endStr}</span>
    `;
    hoursTrack.appendChild(col);
  }
}

// วาดตารางเรียนและกล่องวิชาเรียนลงบนหน้าเว็บ
function renderScheduleGrid(courses, daysBody, currentLang) {
  if (!daysBody) return;
  daysBody.innerHTML = "";
  const courseList = Array.isArray(courses) ? courses : [];

  DAYS.forEach((dayDef) => {
    // แถวของแต่ละวัน
    const dayRow = document.createElement("div");
    dayRow.className = `day-row ${dayDef.class}`;

    const dayLabel = document.createElement("div");
    dayLabel.className = "day-label";
    dayLabel.textContent = I18N[currentLang]?.days?.[dayDef.key] || dayDef.key;
    dayRow.appendChild(dayLabel);

    const trackArea = document.createElement("div");
    trackArea.className = "day-track";

    // เส้นแบ่งช่องชั่วโมงพื้นหลัง
    const bgGrid = document.createElement("div");
    bgGrid.className = "day-track-bg";
    for (let i = 0; i < TOTAL_HOURS; i++) {
      const col = document.createElement("div");
      col.className = "day-track-col";
      bgGrid.appendChild(col);
    }
    trackArea.appendChild(bgGrid);

    // กรองเฉพาะวิชาของวันนั้นๆ
    const dayCourses = courseList.filter((c) => normalizeDay(c.day_w) === dayDef.key);

    dayCourses.forEach((c) => {
      const { startMin, endMin } = getCourseMinutes(c);
      if (startMin === null || endMin === null) return;

      // คำนวณตำแหน่งเริ่มต้น (left) และความกว้าง (width) ในรูปแบบเปอร์เซ็นต์ (อิงจาก 08:00 = 480 นาที)
      const left = ((startMin - 480) / TOTAL_MINUTES) * 100;
      const width = ((endMin - startMin) / TOTAL_MINUTES) * 100;

      const color = DAY_THEMES[dayDef.key] || DAY_THEMES["MON"];

      const block = document.createElement("div");
      block.className = "course-block";
      block.style.left = `calc(${Math.max(0, left)}% + 3px)`;
      block.style.width = `calc(${Math.min(100 - left, width)}% - 6px)`;
      block.style.backgroundColor = color.bg;
      block.style.borderLeftColor = color.border;

      const subjectName = (currentLang === "en"
        ? (c.subject_name_en || c.subject_name_th)
        : (c.subject_name_th || c.subject_name_en)) || "";

      const roomText = (currentLang === "en"
        ? (c.room_name_en || c.room_name_th)
        : (c.room_name_th || c.room_name_en)) || "-";

      const secText = c.section_code ? `Sec ${c.section_code}` : "";
      const metaLine = secText ? `${roomText} | ${secText}` : roomText;

      block.innerHTML = `
        <div class="course-code">${escapeHtml(c.subject_code || "")}</div>
        <div class="course-name" title="${escapeHtml(subjectName)}">${escapeHtml(subjectName)}</div>
        <div class="course-meta">${escapeHtml(metaLine)}</div>
      `;

      trackArea.appendChild(block);
    });

    dayRow.appendChild(trackArea);
    daysBody.appendChild(dayRow);
  });
}
