// ระบบปรับแต่งสีตารางเรียน (KU Schedule Color Customizer)

// อ่านสีเริ่มต้นของแต่ละวันจากตัวแปร CSS ใน grid.css ตามธีมปัจจุบัน
function getThemeDefaultDayColors(dayKey, rootStyles = null) {
  const styles = rootStyles || getComputedStyle(document.documentElement);
  const k = String(dayKey).toLowerCase();
  const readVar = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return {
    dayBg: readVar(`--day-${k}-bg`, "#ffffff"),
    courseBg: readVar(`--course-${k}-bg`, "#ffffff"),
    courseBorder: readVar(`--course-${k}-border`, "#000000"),
  };
}

// ฟังก์ชันแปลงโครงสร้าง customColors ให้มีทั้ง light และ dark เสมอ
function normalizeCustomColors(raw) {
  if (!raw || typeof raw !== "object") {
    return { light: {}, dark: {} };
  }
  if (raw.light || raw.dark) {
    return {
      light: raw.light && typeof raw.light === "object" ? { ...raw.light } : {},
      dark: raw.dark && typeof raw.dark === "object" ? { ...raw.dark } : {},
    };
  }
  const dayKeys = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const hasDayKeys = dayKeys.some((k) => k in raw);
  if (hasDayKeys) {
    return {
      light: { ...raw },
      dark: {},
    };
  }
  return { light: {}, dark: {} };
}

// คำนวณสีข้อความ (ขาว/ดำ) ตามความสว่างของสีพื้นหลัง เพื่อให้อ่านง่ายเสมอ
// ในธีมมืด หากพื้นหลังสว่างจะใช้สีดำสนิท #000000 เพื่อไม่ให้เกิดปัญหาสีกรม
function getContrastTextColor(hexColor, isDarkTheme = false) {
  if (!hexColor || hexColor.length < 6) return isDarkTheme ? "#ffffff" : "#0f172a";
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? (isDarkTheme ? "#000000" : "#0f172a") : "#ffffff";
}

// แทรกหรืออัปเดต <style id="ku-custom-colors-style"> ลงใน <head>
function applyCustomScheduleStyles(customColors) {
  let styleEl = document.getElementById("ku-custom-colors-style");

  if (!customColors) {
    if (styleEl) styleEl.remove();
    return;
  }

  const normalized = normalizeCustomColors(customColors);
  const lightColors = normalized.light;
  const darkColors = normalized.dark;

  const hasLight = Object.keys(lightColors).length > 0;
  const hasDark = Object.keys(darkColors).length > 0;

  if (!hasLight && !hasDark) {
    if (styleEl) styleEl.remove();
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "ku-custom-colors-style";
    document.head.appendChild(styleEl);
  }

  let css = "";

  // 1. สไตล์ปรับแต่งสำหรับธีมสว่าง (เมื่อไม่มี data-theme="dark")
  DAYS.forEach((dayDef) => {
    const key = dayDef.key;
    const colors = lightColors[key];
    if (!colors) return;

    const dayClass = dayDef.class;
    const courseClass = `course-${key.toLowerCase()}`;

    if (colors.dayBg) {
      const dayText = getContrastTextColor(colors.dayBg, false);
      css += `
        :root:not([data-theme="dark"]) .${dayClass} .day-label {
          background-color: ${colors.dayBg} !important;
          color: ${dayText} !important;
        }
      `;
    }

    if (colors.courseBg || colors.courseBorder) {
      const courseText = colors.courseBg ? getContrastTextColor(colors.courseBg, false) : "#0f172a";
      css += `
        :root:not([data-theme="dark"]) .${courseClass} {
          ${colors.courseBg ? `background-color: ${colors.courseBg} !important;` : ""}
          ${colors.courseBorder ? `border-left-color: ${colors.courseBorder} !important;` : ""}
          color: ${courseText} !important;
        }
        :root:not([data-theme="dark"]) .${courseClass} .course-code,
        :root:not([data-theme="dark"]) .${courseClass} .course-name,
        :root:not([data-theme="dark"]) .${courseClass} .course-meta {
          color: ${courseText} !important;
        }
      `;
    }
  });

  // 2. สไตล์ปรับแต่งสำหรับธีมมืด (เมื่อมี [data-theme="dark"])
  DAYS.forEach((dayDef) => {
    const key = dayDef.key;
    const colors = darkColors[key];
    if (!colors) return;

    const dayClass = dayDef.class;
    const courseClass = `course-${key.toLowerCase()}`;

    if (colors.dayBg) {
      const dayText = getContrastTextColor(colors.dayBg, true);
      css += `
        [data-theme="dark"] .${dayClass} .day-label {
          background-color: ${colors.dayBg} !important;
          color: ${dayText} !important;
        }
      `;
    }

    if (colors.courseBg || colors.courseBorder) {
      const courseText = colors.courseBg ? getContrastTextColor(colors.courseBg, true) : "#ffffff";
      css += `
        [data-theme="dark"] .${courseClass} {
          ${colors.courseBg ? `background-color: ${colors.courseBg} !important;` : ""}
          ${colors.courseBorder ? `border-left-color: ${colors.courseBorder} !important;` : ""}
          color: ${courseText} !important;
        }
        [data-theme="dark"] .${courseClass} .course-code,
        [data-theme="dark"] .${courseClass} .course-name,
        [data-theme="dark"] .${courseClass} .course-meta {
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
  currentTheme = "light",
  customColors,
  onColorChange,
  onResetDay,
  onResetAll,
}) {
  if (!gridContainer) return;
  gridContainer.innerHTML = "";

  const t = I18N[currentLang];
  const isDark = currentTheme === "dark";
  const rootStyles = getComputedStyle(document.documentElement);

  if (!customColors || typeof customColors !== "object") {
    customColors = { light: {}, dark: {} };
  } else if (!customColors.light && !customColors.dark) {
    const norm = normalizeCustomColors(customColors);
    customColors.light = norm.light;
    customColors.dark = norm.dark;
  }
  if (!customColors.light) customColors.light = {};
  if (!customColors.dark) customColors.dark = {};

  const activeThemeColors = isDark ? customColors.dark : customColors.light;

  DAYS.forEach((dayDef) => {
    const key = dayDef.key;
    const defaults = getThemeDefaultDayColors(key, rootStyles);
    const userColors = activeThemeColors[key];
    const current = userColors ? { ...defaults, ...userColors } : { ...defaults };

    const card = document.createElement("div");
    card.className = "customizer-day-card";
    card.dataset.day = key;

    const dayText = getContrastTextColor(current.dayBg, isDark);
    const courseText = getContrastTextColor(current.courseBg, isDark);

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

        if (!activeThemeColors[key]) {
          activeThemeColors[key] = { ...defaults };
        }
        activeThemeColors[key][field] = val;

        // อัปเดตการแสดงผลใน Preview ของ Card ทันที
        const badge = card.querySelector(".day-badge-header");
        const preview = card.querySelector(".customizer-preview-box");

        if (field === "dayBg" && badge) {
          badge.style.backgroundColor = val;
          badge.style.color = getContrastTextColor(val, isDark);
        } else if (field === "courseBg" && preview) {
          preview.style.backgroundColor = val;
          preview.style.color = getContrastTextColor(val, isDark);
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
        delete activeThemeColors[key];
        const defaultCol = defaults;

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
          badge.style.color = getContrastTextColor(defaultCol.dayBg, isDark);
        }
        if (preview) {
          preview.style.backgroundColor = defaultCol.courseBg;
          preview.style.borderLeftColor = defaultCol.courseBorder;
          preview.style.color = getContrastTextColor(defaultCol.courseBg, isDark);
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
      }
    };
  }
}
