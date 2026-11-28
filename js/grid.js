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
function renderScheduleGrid(courses, daysBody, currentLang, exportDays = { SAT: true, SUN: true }, onToggleExportDay = null) {
  if (!daysBody) return;
  daysBody.innerHTML = "";
  const courseList = Array.isArray(courses) ? courses : [];

  DAYS.forEach((dayDef) => {
    // กรองเฉพาะวิชาของวันนั้นๆ
    const dayCourses = courseList.filter((c) => normalizeDay(c.day_w) === dayDef.key);
    const hasCourses = dayCourses.length > 0;

    // แถวของแต่ละวัน
    const dayRow = document.createElement("div");
    dayRow.className = `day-row ${dayDef.class}`;

    const dayLabel = document.createElement("div");
    dayLabel.className = "day-label";

    const dayNameSpan = document.createElement("span");
    dayNameSpan.className = "day-label-text";
    dayNameSpan.textContent = I18N[currentLang].days[dayDef.key];
    dayLabel.appendChild(dayNameSpan);

    // แสดงปุ่มเปิด/ปิดเฉพาะวันเสาร์-อาทิตย์ที่ไม่มีวิชาเรียน
    if ((dayDef.key === "SAT" || dayDef.key === "SUN") && !hasCourses) {
      const isChecked = exportDays ? exportDays[dayDef.key] !== false : true;
      const toggleWrap = document.createElement("label");
      toggleWrap.className = "day-toggle-wrap";
      toggleWrap.setAttribute(
        "title",
        isChecked
          ? (I18N[currentLang].dayExportToggleOn || "แสดงในรูป PNG (คลิกเพื่อปิด)")
          : (I18N[currentLang].dayExportToggleOff || "ซ่อนในรูป PNG (คลิกเพื่อเปิด)")
      );

      toggleWrap.innerHTML = `
        <span class="day-toggle-switch">
          <input type="checkbox" class="day-toggle-input" data-day="${dayDef.key}" ${isChecked ? "checked" : ""}>
          <span class="day-toggle-slider"></span>
        </span>
        <span class="day-toggle-badge ${isChecked ? "" : "off"}">PNG</span>
      `;

      const input = toggleWrap.querySelector(".day-toggle-input");
      if (input) {
        input.addEventListener("change", (e) => {
          const checked = e.target.checked;
          const badge = toggleWrap.querySelector(".day-toggle-badge");
          if (badge) badge.classList.toggle("off", !checked);
          toggleWrap.setAttribute(
            "title",
            checked
              ? (I18N[currentLang].dayExportToggleOn || "แสดงในรูป PNG (คลิกเพื่อปิด)")
              : (I18N[currentLang].dayExportToggleOff || "ซ่อนในรูป PNG (คลิกเพื่อเปิด)")
          );
          if (onToggleExportDay) {
            onToggleExportDay(dayDef.key, checked);
          }
        });
      }

      toggleWrap.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      dayLabel.appendChild(toggleWrap);
    }

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

    dayCourses.forEach((c) => {
      const { startMin, endMin } = getCourseMinutes(c);
      if (startMin === null || endMin === null) return;

      const minStart = START_HOUR * 60;
      const maxEnd = END_HOUR * 60;
      const clampedStart = Math.max(minStart, startMin);
      const clampedEnd = Math.min(maxEnd, endMin);
      if (clampedEnd <= clampedStart) return;

      // คำนวณตำแหน่งเริ่มต้น (left) และความกว้าง (width) ในรูปแบบเปอร์เซ็นต์
      const left = ((clampedStart - minStart) / TOTAL_MINUTES) * 100;
      const width = ((clampedEnd - clampedStart) / TOTAL_MINUTES) * 100;

      const block = document.createElement("div");
      block.className = `course-block course-${dayDef.key.toLowerCase()}`;
      block.style.left = `calc(${left}% + 3px)`;
      block.style.width = `calc(${width}% - 6px)`;

      const subjectName = getCourseName(c, currentLang);
      const room = getCourseRoom(c, currentLang);
      const roomText = room || "-";
      const metaLine = c.section_code ? `${roomText} | Sec ${c.section_code}` : roomText;

      block.innerHTML = `
        <div class="course-code">${escapeHtml(c.subject_code)}</div>
        <div class="course-name" title="${escapeHtml(subjectName)}">${escapeHtml(subjectName)}</div>
        <div class="course-meta">${escapeHtml(metaLine)}</div>
      `;

      trackArea.appendChild(block);
    });

    dayRow.appendChild(trackArea);
    daysBody.appendChild(dayRow);
  });
}
