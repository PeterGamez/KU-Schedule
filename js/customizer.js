// ระบบปรับแต่งสีตารางเรียน (KU Schedule Color Customizer)

// สีเริ่มต้นของแต่ละวัน
const DEFAULT_DAY_COLORS = {
  MON: { dayBg: "#FACC15", courseBg: "#FEF08A", courseBorder: "#CA8A04" },
  TUE: { dayBg: "#F472B6", courseBg: "#FBCFE8", courseBorder: "#DB2777" },
  WED: { dayBg: "#4ADE80", courseBg: "#BBF7D0", courseBorder: "#16A34A" },
  THU: { dayBg: "#FB923C", courseBg: "#FED7AA", courseBorder: "#EA580C" },
  FRI: { dayBg: "#38BDF8", courseBg: "#BAE6FD", courseBorder: "#0284C7" },
  SAT: { dayBg: "#C084FC", courseBg: "#E9D5FF", courseBorder: "#9333EA" },
  SUN: { dayBg: "#F87171", courseBg: "#FECACA", courseBorder: "#DC2626" },
};

// คำนวณสีข้อความ (ขาว/ดำ) ตามความสว่างของสีพื้นหลัง เพื่อให้อ่านง่ายเสมอ
function getContrastTextColor(hexColor) {
  if (!hexColor || hexColor.length < 6) return "#0f172a";
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? "#0f172a" : "#ffffff";
}

// แทรกหรืออัปเดต <style id="ku-custom-colors-style"> ลงใน <head>
function applyCustomScheduleStyles(customColors) {
  let styleEl = document.getElementById("ku-custom-colors-style");

  if (!customColors || Object.keys(customColors).length === 0) {
    if (styleEl) styleEl.remove();
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "ku-custom-colors-style";
    document.head.appendChild(styleEl);
  }

  let css = "";
  DAYS.forEach((dayDef) => {
    const key = dayDef.key;
    const colors = customColors[key];
    if (!colors) return;

    const dayClass = dayDef.class;
    const courseClass = `course-${key.toLowerCase()}`;

    if (colors.dayBg) {
      const dayText = getContrastTextColor(colors.dayBg);
      css += `
        .${dayClass} .day-label, [data-theme="dark"] .${dayClass} .day-label {
          background-color: ${colors.dayBg} !important;
          color: ${dayText} !important;
        }
      `;
    }

    if (colors.courseBg || colors.courseBorder) {
      const courseText = colors.courseBg ? getContrastTextColor(colors.courseBg) : "#0f172a";
      css += `
        .${courseClass}, [data-theme="dark"] .${courseClass} {
          ${colors.courseBg ? `background-color: ${colors.courseBg} !important;` : ""}
          ${colors.courseBorder ? `border-left-color: ${colors.courseBorder} !important;` : ""}
          color: ${courseText} !important;
        }
        .${courseClass} .course-code, .${courseClass} .course-name, .${courseClass} .course-meta,
        [data-theme="dark"] .${courseClass} .course-code, [data-theme="dark"] .${courseClass} .course-name, [data-theme="dark"] .${courseClass} .course-meta {
          color: ${courseText} !important;
        }
      `;
    }
  });

  styleEl.textContent = css;
}

// สร้าง DOM สำหรับเมนูเลือกสีแต่ละวัน
function initCustomizerUI({
  gridContainer,
  currentLang,
  customColors,
  onColorChange,
  onResetDay,
  onResetAll,
  onReset,
}) {
  if (!gridContainer) return;
  gridContainer.innerHTML = "";

  const t = I18N[currentLang];

  DAYS.forEach((dayDef) => {
    const key = dayDef.key;
    const current = (customColors && customColors[key])
      ? { ...DEFAULT_DAY_COLORS[key], ...customColors[key] }
      : { ...DEFAULT_DAY_COLORS[key] };

    const card = document.createElement("div");
    card.className = "customizer-day-card";
    card.dataset.day = key;

    const dayText = getContrastTextColor(current.dayBg);
    const courseText = getContrastTextColor(current.courseBg);

    card.innerHTML = `
      <div class="day-badge-header" style="background-color: ${current.dayBg}; color: ${dayText};">
        ${t.days[key]}
      </div>

      <div class="color-control-group">
        <label class="color-control-item" title="${t.customizerDayBg}">
          <span class="color-control-label">${t.customizerDayBg}</span>
          <span class="color-input-wrapper">
            <input type="color" class="color-picker-input" data-day="${key}" data-field="dayBg" value="${current.dayBg}">
          </span>
        </label>

        <label class="color-control-item" title="${t.customizerCourseBg}">
          <span class="color-control-label">${t.customizerCourseBg}</span>
          <span class="color-input-wrapper">
            <input type="color" class="color-picker-input" data-day="${key}" data-field="courseBg" value="${current.courseBg}">
          </span>
        </label>

        <label class="color-control-item" title="${t.customizerCourseBorder}">
          <span class="color-control-label">${t.customizerCourseBorder}</span>
          <span class="color-input-wrapper">
            <input type="color" class="color-picker-input" data-day="${key}" data-field="courseBorder" value="${current.courseBorder}">
          </span>
        </label>
      </div>

      <div class="customizer-preview-box" style="background-color: ${current.courseBg}; border-left-color: ${current.courseBorder}; color: ${courseText};">
        ${t.customizerPreviewSample}
      </div>

      <button type="button" class="btn-day-reset" data-day="${key}" title="${t.customizerResetDayTitle || 'รีเซ็ตสีเฉพาะวันนี้'}">
        <svg class="icon" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
        </svg>
        <span>${t.customizerResetDayBtn || 'รีเซ็ต'}</span>
      </button>
    `;

    // ผูก Event Listener เมื่อเปลี่ยนสี
    const inputs = card.querySelectorAll(".color-picker-input");
    inputs.forEach((input) => {
      const handler = (e) => {
        const field = e.target.dataset.field;
        const val = e.target.value;

        if (!customColors[key]) {
          customColors[key] = { ...DEFAULT_DAY_COLORS[key] };
        }
        customColors[key][field] = val;

        // อัปเดตการแสดงผลใน Preview ของ Card ทันที
        const badge = card.querySelector(".day-badge-header");
        const preview = card.querySelector(".customizer-preview-box");

        if (field === "dayBg" && badge) {
          badge.style.backgroundColor = val;
          badge.style.color = getContrastTextColor(val);
        } else if (field === "courseBg" && preview) {
          preview.style.backgroundColor = val;
          preview.style.color = getContrastTextColor(val);
        } else if (field === "courseBorder" && preview) {
          preview.style.borderLeftColor = val;
        }

        // นำสไตล์ไปใช้กับตารางจริง
        applyCustomScheduleStyles(customColors);

        if (onColorChange) {
          onColorChange(customColors);
        }
      };

      input.addEventListener("input", handler);
      input.addEventListener("change", handler);
    });

    // ผูก Event Listener เมื่อกดปุ่มรีเซ็ตเฉพาะวัน
    const dayResetBtn = card.querySelector(".btn-day-reset");
    if (dayResetBtn) {
      dayResetBtn.addEventListener("click", () => {
        delete customColors[key];
        const defaultCol = DEFAULT_DAY_COLORS[key];

        const dayBgInput = card.querySelector('.color-picker-input[data-field="dayBg"]');
        const courseBgInput = card.querySelector('.color-picker-input[data-field="courseBg"]');
        const courseBorderInput = card.querySelector('.color-picker-input[data-field="courseBorder"]');
        if (dayBgInput) dayBgInput.value = defaultCol.dayBg;
        if (courseBgInput) courseBgInput.value = defaultCol.courseBg;
        if (courseBorderInput) courseBorderInput.value = defaultCol.courseBorder;

        const badge = card.querySelector(".day-badge-header");
        const preview = card.querySelector(".customizer-preview-box");
        if (badge) {
          badge.style.backgroundColor = defaultCol.dayBg;
          badge.style.color = getContrastTextColor(defaultCol.dayBg);
        }
        if (preview) {
          preview.style.backgroundColor = defaultCol.courseBg;
          preview.style.borderLeftColor = defaultCol.courseBorder;
          preview.style.color = getContrastTextColor(defaultCol.courseBg);
        }

        applyCustomScheduleStyles(customColors);

        if (onResetDay) {
          onResetDay(key, customColors);
        }
      });
    }

    gridContainer.appendChild(card);
  });

  const resetBtn = document.getElementById("resetColorsBtn");
  if (resetBtn) {
    resetBtn.onclick = () => {
      if (onResetAll) {
        onResetAll();
      } else if (onReset) {
        onReset();
      }
    };
  }
}
