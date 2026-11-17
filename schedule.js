// รอให้ DOM โหลดสมบูรณ์ก่อนเริ่มต้นการทำงาน
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSchedule);
} else {
  initSchedule();
}

async function initSchedule() {
  const fetchBtn = document.getElementById("fetchBtn");
  const fetchBtnText = document.getElementById("fetchBtnText");
  const spinIcon = fetchBtn ? fetchBtn.querySelector(".spin-icon") : null;

  const exportBtn = document.getElementById("exportBtn");
  const exportBtnText = document.getElementById("exportBtnText");
  const spinIconExport = document.querySelector(".spin-icon-export");
  const exportDefaultIcon = document.querySelector(".export-default-icon");

  const yearSelect = document.getElementById("yearSelect");
  const semesterSelect = document.getElementById("semesterSelect");
  const yearLabel = document.getElementById("yearLabel");
  const semesterLabel = document.getElementById("semesterLabel");

  const langThBtn = document.getElementById("langThBtn");
  const langEnBtn = document.getElementById("langEnBtn");

  const alertBox = document.getElementById("alertBox");
  const alertMessage = document.getElementById("alertMessage");
  const alertLink = document.getElementById("alertLink");

  const hoursTrack = document.getElementById("hoursTrack");
  const daysBody = document.getElementById("daysBody");
  const dayCorner = document.getElementById("dayCorner");
  const exportCredit = document.getElementById("exportCredit");

  let currentCourses = null;
  let currentStudentInfo = null;
  let cachedEnrolledYears = null;
  let userHasSelectedTerm = false;
  let isFetching = false;
  let isExporting = false;
  let currentAlertKey = null;
  let currentLang = localStorage.getItem("ku_schedule_lang") || "th";

  // กำหนดช่วงเวลาที่แสดงผลบนตาราง (08:00 - 20:00 น.)
  const START_HOUR = 8;
  const END_HOUR = 20;
  const TOTAL_HOURS = END_HOUR - START_HOUR;
  const TOTAL_MINUTES = TOTAL_HOURS * 60;

  // ข้อมูลวันและโทนสีประจำวันสำหรับกล่องวิชาเรียน
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

  // เริ่มต้นสร้างหัวตาราง โหลดการตั้งค่าภาษา และโหลดข้อมูลแคชเดิม (ถ้ามี)
  initGridHeader();
  initYearOptions();

  // ดึงภาษาที่บันทึกไว้ใน chrome.storage.local (ถ้ามี)
  if (chrome.storage && chrome.storage.local) {
    try {
      const stored = await chrome.storage.local.get(["ku_schedule_lang"]);
      if (stored && stored.ku_schedule_lang) {
        currentLang = stored.ku_schedule_lang;
      }
    } catch (e) { }
  }
  setLanguage(currentLang);

  const hasCache = await loadCachedSchedule();
  if (!hasCache) {
    handleFetch();
  }

  if (alertLink) {
    alertLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (typeof chrome !== "undefined" && chrome.tabs?.create) {
        chrome.tabs.create({ url: "https://my.ku.th" });
      } else {
        window.open("https://my.ku.th", "_blank");
      }
    });
  }

  if (fetchBtn) fetchBtn.addEventListener("click", () => handleFetch());
  if (exportBtn) exportBtn.addEventListener("click", handleExportPNG);

  if (langThBtn) {
    langThBtn.addEventListener("click", () => setLanguage("th"));
  }
  if (langEnBtn) {
    langEnBtn.addEventListener("click", () => setLanguage("en"));
  }

  if (yearSelect) {
    yearSelect.addEventListener("change", () => {
      userHasSelectedTerm = true;
      handleFetch();
    });
  }
  if (semesterSelect) {
    semesterSelect.addEventListener("change", () => {
      userHasSelectedTerm = true;
      handleFetch();
    });
  }

  // ฟังก์ชันสลับภาษาไทย / อังกฤษ
  function setLanguage(lang) {
    currentLang = lang === "en" ? "en" : "th";
    try {
      localStorage.setItem("ku_schedule_lang", currentLang);
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ ku_schedule_lang: currentLang });
      }
    } catch (e) { }

    document.documentElement.lang = currentLang;

    // สลับคลาส active ของปุ่มเปลี่ยนภาษา
    if (langThBtn) langThBtn.classList.toggle("active", currentLang === "th");
    if (langEnBtn) langEnBtn.classList.toggle("active", currentLang === "en");

    const t = I18N[currentLang];

    // ข้อความ Label บนหน้าเว็บ
    if (yearLabel) yearLabel.textContent = t.yearLabel;
    if (semesterLabel) semesterLabel.textContent = t.semesterLabel;
    if (dayCorner) dayCorner.textContent = t.dayCorner;
    if (exportCredit) exportCredit.textContent = t.exportCredit;
    if (alertLink) alertLink.textContent = t.alertLink;

    // Tooltip
    if (yearSelect) yearSelect.title = t.yearTitle;
    if (semesterSelect) semesterSelect.title = t.semesterTitle;
    if (fetchBtn) fetchBtn.title = t.fetchTitle;
    if (exportBtn) exportBtn.title = t.exportTitle;

    // ข้อความปุ่ม
    if (fetchBtnText) {
      fetchBtnText.textContent = isFetching ? t.fetchBtnLoading : t.fetchBtn;
    }
    if (exportBtnText) {
      exportBtnText.textContent = isExporting ? t.exportBtnLoading : t.exportBtn;
    }

    // ตัวเลือกใน Dropdown ภาคเรียน
    if (semesterSelect) {
      const curVal = semesterSelect.value;
      semesterSelect.innerHTML = "";
      const sems = [
        { val: "1", text: t.semesters["1"] },
        { val: "2", text: t.semesters["2"] },
        { val: "0", text: t.semesters["0"] },
      ];
      sems.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.val;
        opt.textContent = s.text;
        semesterSelect.appendChild(opt);
      });
      if (curVal !== undefined && curVal !== null && curVal !== "") {
        semesterSelect.value = curVal;
      }
    }

    // หากมีการแจ้งเตือนอยู่ ให้อัปเดตภาษาของข้อความแจ้งเตือน
    if (currentAlertKey && t.alerts[currentAlertKey]) {
      showAlertKey(currentAlertKey);
    }

    // วาดตารางใหม่ด้วยภาษาที่เลือก
    renderScheduleGrid(currentCourses || []);
  }

  // สร้างส่วนหัวตารางแสดงช่วงเวลาแต่ละชั่วโมง (เช่น 08:00 - 09:00)
  function initGridHeader() {
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

  // กำหนดตัวเลือกปีการศึกษาใน Dropdown จาก API getEnrollYear
  function initYearOptions(defaultYear, yearList = null) {
    if (!yearSelect) return;
    const now = new Date();
    const currentBuddhistYear = now.getFullYear() + 543 - (now.getMonth() < 5 ? 1 : 0);
    let years = [];

    if (Array.isArray(yearList) && yearList.length > 0) {
      years = [...yearList];
    }

    const defNum = defaultYear ? parseInt(defaultYear, 10) : null;
    if (defNum && !isNaN(defNum) && !years.includes(defNum)) {
      years.push(defNum);
    }

    // ถ้ายังไม่มีข้อมูลปีใดๆ ให้ใส่ปีการศึกษาปัจจุบันไว้ก่อน (ไม่ให้ dropdown ว่าง)
    if (years.length === 0) {
      years.push(currentBuddhistYear);
    }

    years.sort((a, b) => b - a);

    const currentVal = yearSelect.value;
    yearSelect.innerHTML = "";
    years.forEach((y) => {
      const opt = document.createElement("option");
      opt.value = y.toString();
      opt.textContent = y.toString();
      yearSelect.appendChild(opt);
    });

    if (defNum && !isNaN(defNum) && years.includes(defNum)) {
      yearSelect.value = defNum.toString();
    } else if (currentVal && years.includes(parseInt(currentVal, 10))) {
      yearSelect.value = currentVal;
    } else if (years.length > 0) {
      yearSelect.value = years[0].toString();
    }
  }

  // แปลงข้อมูลผลลัพธ์จาก API getEnrollYear ให้เป็น Array ของปี พ.ศ.
  function parseEnrollYears(data) {
    if (!data) return [];
    let list = [];
    if (Array.isArray(data)) {
      list = data;
    } else if (Array.isArray(data.results)) {
      list = data.results;
    } else if (Array.isArray(data.data)) {
      list = data.data;
    } else if (Array.isArray(data.years)) {
      list = data.years;
    } else if (Array.isArray(data.academicYears)) {
      list = data.academicYears;
    } else if (typeof data === "object") {
      for (const val of Object.values(data)) {
        if (Array.isArray(val) && val.length > 0) {
          list = val;
          break;
        }
      }
    }

    const extracted = [];
    for (const item of list) {
      if (typeof item === "number" || typeof item === "string") {
        const n = parseInt(item, 10);
        if (!isNaN(n)) extracted.push(n);
      } else if (item && typeof item === "object") {
        const candidate =
          item.academicYear ??
          item.enrollYear ??
          item.year ??
          item.academic_year ??
          item.acadYear ??
          Object.values(item)[0];
        const n = parseInt(candidate, 10);
        if (!isNaN(n)) extracted.push(n);
      }
    }

    const normalized = extracted
      .map((y) => {
        if (y < 2300 && y > 1900) return y + 543;
        return y;
      })
      .filter((y) => y >= 2500 && y <= 2700);

    return [...new Set(normalized)].sort((a, b) => b - a);
  }

  // ดึงรายการปีการศึกษาที่ลงทะเบียนจาก POST https://my.ku.th/myku/api/enroll/getEnrollYear
  async function fetchEnrollYears(stdId, reqHeaders, targetTab) {
    const enrollUrl = "https://my.ku.th/myku/api/enroll/getEnrollYear";
    const payload = { stdId: stdId };
    const fetchHeaders = {
      ...reqHeaders,
      "content-type": "application/json",
    };

    let data = null;

    // ลอง fetch โดยตรงจาก extension ก่อน
    try {
      const res = await fetch(enrollUrl, {
        method: "POST",
        headers: fetchHeaders,
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        data = await res.json();
      }
    } catch (e) { }

    // หากติด CORS ให้ยิงผ่านแท็บ my.ku.th แทน
    if (!data && targetTab?.id) {
      try {
        const tabExec = await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: async (url, headers, bodyData) => {
            try {
              const resp = await fetch(url, {
                method: "POST",
                headers: headers,
                credentials: "include",
                body: JSON.stringify(bodyData),
              });
              if (resp.ok) {
                return await resp.json();
              }
              return null;
            } catch (err) {
              return null;
            }
          },
          args: [enrollUrl, fetchHeaders, payload],
        });
        data = tabExec?.[0]?.result;
      } catch (err) { }
    }

    return parseEnrollYears(data);
  }

  // โหลดข้อมูลตารางเรียนจากแคช (chrome.storage.local หรือ fallback ไปยัง localStorage)
  async function loadCachedSchedule() {
    try {
      let cached = null;
      if (chrome.storage && chrome.storage.local) {
        const res = await chrome.storage.local.get(["ku_schedule_cache"]);
        cached = res?.ku_schedule_cache;
      }
      if (!cached) {
        const localStr = localStorage.getItem("ku_schedule_cache");
        if (localStr) cached = JSON.parse(localStr);
      }

      if (cached && cached.courses && cached.studentInfo) {
        currentCourses = cached.courses;
        currentStudentInfo = cached.studentInfo;
        if (Array.isArray(cached.enrolledYears) && cached.enrolledYears.length > 0) {
          cachedEnrolledYears = cached.enrolledYears;
          initYearOptions(cached.studentInfo.academicYear, cached.enrolledYears);
        } else if (cached.studentInfo.academicYear) {
          initYearOptions(cached.studentInfo.academicYear);
        } else {
          initYearOptions();
        }
        if (cached.studentInfo.semester != null && cached.studentInfo.semester !== "" && semesterSelect) {
          semesterSelect.value = cached.studentInfo.semester.toString();
        }
        renderScheduleGrid(cached.courses);
        return true;
      } else {
        initYearOptions();
        return false;
      }
    } catch (err) {
      console.warn("Error loading cached schedule:", err);
      initYearOptions();
      return false;
    }
  }

  // บันทึกข้อมูลตารางเรียนลงแคชเพื่อเปิดใช้งานได้ทันทีในครั้งถัดไป
  async function saveCachedSchedule(info, courses, enrolledYears = null) {
    currentStudentInfo = info;
    currentCourses = courses;
    if (Array.isArray(enrolledYears) && enrolledYears.length > 0) {
      cachedEnrolledYears = enrolledYears;
    }
    const payload = {
      studentInfo: info,
      courses: courses,
      enrolledYears: cachedEnrolledYears,
      savedAt: Date.now(),
    };
    try {
      if (chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ ku_schedule_cache: payload });
      }
      localStorage.setItem("ku_schedule_cache", JSON.stringify(payload));
    } catch (e) {
      console.warn("Error saving to cache:", e);
    }
  }

  // แปลงรหัสภาคเรียนเป็นข้อความแสดงผล (0 = ภาคฤดูร้อน, 1 = ภาคต้น, 2 = ภาคปลาย)
  function formatSemester(sem) {
    if (sem === null || sem === undefined) return "";
    const s = sem.toString().trim();
    const t = I18N[currentLang];
    if (t.semesters[s]) {
      return t.semesters[s];
    }
    return currentLang === "en" ? `Semester ${s}` : `ภาคเรียนที่ ${s}`;
  }

  // ดึงข้อมูลตารางเรียนจาก my.ku.th
  async function handleFetch() {
    if (isFetching) return;
    isFetching = true;
    hideAlert();
    setLoading(true);

    try {
      // 1. ตรวจสอบว่ามีแท็บ my.ku.th เปิดอยู่หรือไม่
      const tabs = await chrome.tabs.query({ url: "https://my.ku.th/*" });
      if (!tabs || tabs.length === 0) {
        showAlertKey("LOGIN_REQUIRED");
        return;
      }

      const targetTab = tabs.find((t) => t.active) || tabs[0];

      // 2. ดึง auth token และข้อมูลผู้ใช้จาก localStorage ของแท็บ my.ku.th
      const scriptRes = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: () => {
          try {
            return {
              user: localStorage.getItem("user"),
              accesstoken: localStorage.getItem("accesstoken"),
            };
          } catch (e) {
            return null;
          }
        },
      });

      const storageData = scriptRes?.[0]?.result;
      if (!storageData || !storageData.user || !storageData.accesstoken) {
        showAlertKey("LOGIN_REQUIRED");
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(storageData.user);
      } catch (e) {
        showAlertKey("LOGIN_REQUIRED");
        return;
      }

      const { idCode, stdId, academicYear, semester } = parsed.user || {};
      const accesstoken = storageData.accesstoken;

      if (!stdId) {
        showAlertKey("LOGIN_REQUIRED");
        return;
      }

      const headers = {
        "app-key": "txCR5732xYYWDGdd49M3R19o1OVwdRFc",
      };
      if (accesstoken) {
        headers["x-access-token"] = accesstoken;
      }

      // ดึงรายการปีการศึกษาของนิสิตจาก POST https://my.ku.th/myku/api/enroll/getEnrollYear
      const enrollYears = await fetchEnrollYears(stdId, headers, targetTab);
      if (enrollYears.length > 0) {
        cachedEnrolledYears = enrollYears;
        const curYear = yearSelect?.value || academicYear;
        initYearOptions(curYear, enrollYears);
      } else if (!userHasSelectedTerm && !currentStudentInfo) {
        if (academicYear) initYearOptions(academicYear);
      }

      // กำหนดค่าเริ่มต้นของภาคเรียนให้ตรงกับข้อมูลปัจจุบันใน My KU หากยังไม่มีการเลือก
      if (!userHasSelectedTerm && !currentStudentInfo) {
        if (semester != null && semester !== "" && semesterSelect) {
          semesterSelect.value = semester.toString();
        }
      }

      const targetYear = yearSelect?.value || academicYear;
      const targetSemester = (semesterSelect?.value != null && semesterSelect.value !== "")
        ? semesterSelect.value
        : (semester != null ? semester.toString() : "");

      if (!targetYear || targetSemester === "") {
        showAlertKey("LOGIN_REQUIRED");
        return;
      }

      const studentData = {
        idCode,
        stdId,
        academicYear: targetYear,
        semester: targetSemester,
      };

      // 3. ส่งคำขอ POST ไปยัง publicCBP ก่อนดึงตารางเรียน
      const cbpUrl = "https://my.ku.th/myku/api/common/publicCBP";
      const cbpPayload = { keys: [["gcd", stdId]] };
      const cbpHeaders = {
        ...headers,
        "content-type": "application/json",
      };

      try {
        await fetch(cbpUrl, {
          method: "POST",
          headers: cbpHeaders,
          credentials: "include",
          body: JSON.stringify(cbpPayload),
        });
      } catch (e) {
        // หากติด CORS ให้ยิงผ่านแท็บ my.ku.th แทน
        try {
          await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            func: async (url, reqHeaders, payload) => {
              try {
                await fetch(url, {
                  method: "POST",
                  headers: reqHeaders,
                  credentials: "include",
                  body: JSON.stringify(payload),
                });
              } catch (err) { }
            },
            args: [cbpUrl, cbpHeaders, cbpPayload],
          });
        } catch (err) { }
      }

      // 4. กำหนด endpoint สำหรับเรียก API ดึงตารางเรียนตามปีและภาคที่เลือก
      const apiUrl = `https://my.ku.th/myku/api/std-profile/getGroupCourse?academicYear=${encodeURIComponent(targetYear)}&semester=${encodeURIComponent(targetSemester)}&stdId=${encodeURIComponent(stdId)}`;

      let scheduleData = null;
      let status = 0;

      // ลอง fetch โดยตรงจากหน้า extension ก่อน
      try {
        const res = await fetch(apiUrl, {
          method: "GET",
          headers: headers,
          credentials: "include",
        });
        status = res.status;
        try {
          scheduleData = await res.json();
        } catch (e) { }
      } catch (e) { }

      // หาก fetch ตรงไม่ได้ (เช่น ติด CORS หรือไม่ได้ข้อมูล) ให้รัน fetch ภายในบริบทของแท็บ my.ku.th แทน
      if (!scheduleData || status === 0) {
        const tabExec = await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: async (url, reqHeaders) => {
            try {
              const resp = await fetch(url, {
                method: "GET",
                headers: reqHeaders,
                credentials: "include",
              });
              const status = resp.status;
              let data = null;
              try {
                data = await resp.json();
              } catch (e) { }
              return { status, data };
            } catch (err) {
              return { status: 0, data: null };
            }
          },
          args: [apiUrl, headers],
        });

        const r = tabExec?.[0]?.result;
        if (r) {
          status = r.status || status;
          if (r.data) scheduleData = r.data;
        }
      }

      // 5. จัดการกรณี Session หมดอายุ หรือไม่มีข้อมูลตารางเรียน
      if (status === 401) {
        showAlertKey("SESSION_EXPIRED");
        return;
      }

      const isDataNotFound = scheduleData?.message?.trim().toLowerCase().includes("not found");

      if (isDataNotFound) {
        currentCourses = [];
        renderScheduleGrid([]);
        showAlertKey("NOT_FOUND");
        return;
      }

      if (!scheduleData || !scheduleData.results || !scheduleData.results[0]?.course) {
        showAlertKey("FETCH_FAILED");
        return;
      }

      // 6. บันทึกลงแคชและวาดตารางเรียน
      const courses = scheduleData.results[0].course;
      await saveCachedSchedule(studentData, courses, cachedEnrolledYears);
      renderScheduleGrid(courses);

    } catch (err) {
      console.error(err);
      showAlertKey("FETCH_ERROR");
    } finally {
      isFetching = false;
      setLoading(false);
    }
  }

  // วาดตารางเรียนและกล่องวิชาเรียนลงบนหน้าเว็บ
  function renderScheduleGrid(courses) {
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

  // ตัดข้อความที่ยาวเกินความกว้างที่กำหนดและต่อท้ายด้วย "..." โดยไม่ตัดวรรณยุกต์/สระไทยขาด
  function fitTextWithEllipsis(text, maxWidth, font, ctx) {
    if (!text || maxWidth <= 0) return text || "";

    if (!ctx) {
      const canvas = document.createElement("canvas");
      ctx = canvas.getContext("2d");
    }
    ctx.font = font;

    if (ctx.measureText(text).width <= maxWidth) {
      return text;
    }

    const ellipsis = "...";
    const ellipsisWidth = ctx.measureText(ellipsis).width;
    const targetWidth = maxWidth - ellipsisWidth;
    if (targetWidth <= 0) return ellipsis;

    // แยกเป็น Grapheme Cluster เพื่อไม่ให้สระหรือวรรณยุกต์ไทยขาดจากพยัญชนะ
    let graphemes;
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter(currentLang === "en" ? "en" : "th", { granularity: "grapheme" });
      graphemes = Array.from(segmenter.segment(text), (s) => s.segment);
    } else {
      graphemes = Array.from(text);
    }

    let low = 0;
    let high = graphemes.length;
    let best = "";

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const sub = graphemes.slice(0, mid).join("").trimEnd();
      if (ctx.measureText(sub).width <= targetWidth) {
        best = sub;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return best ? best + ellipsis : ellipsis;
  }

  // บันทึกตารางเรียนเป็นไฟล์รูปภาพ PNG ด้วย html2canvas
  async function handleExportPNG() {
    if (!currentCourses || currentCourses.length === 0) {
      showAlertKey("EXPORT_NO_COURSES");
      return;
    }

    if (typeof html2canvas === "undefined") {
      showAlertKey("EXPORT_LIB_MISSING");
      return;
    }

    hideAlert();
    setExportLoading(true);

    try {
      if (document.fonts) {
        await document.fonts.ready;
      }

      const exportTerm = document.getElementById("exportTerm");
      const exportTimestamp = document.getElementById("exportTimestamp");

      const expYear = currentStudentInfo?.academicYear || yearSelect?.value || "";
      const expSem = (currentStudentInfo?.semester != null && currentStudentInfo.semester !== "")
        ? currentStudentInfo.semester
        : (semesterSelect?.value || "");
      if (expYear && expSem !== "") {
        exportTerm.textContent = I18N[currentLang].exportTerm(expYear, formatSemester(expSem));
      } else {
        exportTerm.textContent = "";
      }

      const now = new Date();
      const locale = currentLang === "en" ? "en-US" : "th-TH";
      const dateStr = now.toLocaleDateString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const timeStr = now.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: currentLang === "en",
      });
      exportTimestamp.textContent = I18N[currentLang].exportTimestamp(dateStr, timeStr);

      const captureTarget = document.getElementById("scheduleCaptureArea");

      // จับภาพ element พร้อมปรับขนาดและสไตล์ของ clone ให้เหมาะสมสำหรับรูปภาพที่ export
      const canvas = await html2canvas(captureTarget, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 1400,
        onclone: (clonedDoc) => {
          const clonedArea = clonedDoc.getElementById("scheduleCaptureArea");
          if (clonedArea) {
            clonedArea.classList.add("is-exporting");
            clonedArea.style.width = "1400px";
            clonedArea.style.maxWidth = "1400px";
            clonedArea.style.minWidth = "1400px";
            clonedArea.style.padding = "20px";
            clonedArea.style.backgroundColor = "#ffffff";
            clonedArea.style.borderRadius = "8px";
            clonedArea.style.boxShadow = "none";
          }

          // แสดง Header และ Footer สำหรับภาพบันทึก
          const expH = clonedDoc.getElementById("exportHeader");
          if (expH) {
            expH.style.display = "flex";
            expH.style.borderRadius = "8px 8px 0 0";
          }
          const schedTbl = clonedDoc.getElementById("scheduleTable");
          if (schedTbl) {
            schedTbl.style.borderRadius = "0";
            schedTbl.style.borderTop = "none";
          }
          const expF = clonedDoc.getElementById("exportFooter");
          if (expF) {
            expF.style.display = "flex";
            expF.style.borderRadius = "0 0 8px 8px";
          }
          const expC = clonedDoc.getElementById("exportCredit");
          if (expC) {
            expC.textContent = I18N[currentLang].exportCredit;
          }

          // ปรับข้อความที่ยาวเกินให้แสดง "..." และป้องกันการถูกตัดสระบน-ล่าง
          const measurer = document.createElement("canvas").getContext("2d");

          const formatExportText = (el, font, padOffset) => {
            const block = el.closest(".course-block");
            const blockW = block
              ? (block.getBoundingClientRect().width || block.offsetWidth || block.clientWidth)
              : 0;
            const availW = Math.max(20, (blockW || el.clientWidth || 180) - padOffset);
            const fullText = el.getAttribute("title") || el.textContent || "";

            el.textContent = fitTextWithEllipsis(fullText, availW, font, measurer);
            el.style.overflow = "visible";
            el.style.textOverflow = "clip";
            el.style.whiteSpace = "nowrap";
          };

          const courseNames = clonedDoc.querySelectorAll(".course-name");
          courseNames.forEach((el) => {
            formatExportText(el, '600 14px "Sarabun", sans-serif', 34);
          });

          const courseMetas = clonedDoc.querySelectorAll(".course-meta");
          courseMetas.forEach((el) => {
            formatExportText(el, '600 13px "Sarabun", sans-serif', 28);
          });

          const courseCodes = clonedDoc.querySelectorAll(".course-code");
          courseCodes.forEach((el) => {
            el.style.overflow = "visible";
            el.style.textOverflow = "clip";
          });
        },
      });

      // แปลง Canvas เป็น Blob แล้วสั่งดาวน์โหลดไฟล์ PNG
      canvas.toBlob((blob) => {
        if (!blob) {
          showAlertKey("EXPORT_ERROR");
          setExportLoading(false);
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const year = currentStudentInfo?.academicYear || yearSelect?.value || "";
        const sem = (currentStudentInfo?.semester != null && currentStudentInfo.semester !== "")
          ? currentStudentInfo.semester
          : (semesterSelect?.value || "");
        const semStr = sem !== "" ? `sem${sem}` : "";
        const fileName = `KU_Schedule_${year}_${semStr}.png`.replace(/__+/g, "_");

        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        exportBtnText.textContent = I18N[currentLang].exportBtnSuccess;
        setTimeout(() => {
          setExportLoading(false);
        }, 1800);
      }, "image/png");

    } catch (err) {
      console.error("Export PNG Error:", err);
      showAlertKey("EXPORT_ERROR");
      setExportLoading(false);
    }
  }

  // แปลงค่าวันจาก API (ทั้งภาษาไทยและอังกฤษ) ให้เป็นรหัสวันมาตรฐาน (MON, TUE, ...)
  function normalizeDay(dayRaw) {
    if (!dayRaw) return null;
    const d = String(dayRaw).trim().toUpperCase();
    if (d.startsWith("MO") || d.includes("จันทร์")) return "MON";
    if (d.startsWith("TU") || d.includes("อังคาร")) return "TUE";
    if (d.startsWith("WE") || d.includes("พุธ")) return "WED";
    if (d.startsWith("TH") || d.includes("พฤหัส")) return "THU";
    if (d.startsWith("FR") || d.includes("ศุกร์")) return "FRI";
    if (d.startsWith("SA") || d.includes("เสาร์")) return "SAT";
    if (d.startsWith("SU") || d.includes("อาทิตย์")) return "SUN";
    return d;
  }

  // คำนวณเวลาเริ่มและสิ้นสุดของวิชาเรียนในหน่วยนาทีนับจาก 00:00 น.
  function getCourseMinutes(c) {
    let startMin = null;
    let endMin = null;

    if (c.time_from) {
      startMin = parseTime(c.time_from);
    } else if (typeof c.time_start === "number") {
      startMin = c.time_start > 100 ? c.time_start : c.time_start * 60;
    }

    if (c.time_to) {
      endMin = parseTime(c.time_to);
    } else if (typeof c.time_end === "number") {
      endMin = c.time_end > 100 ? c.time_end : c.time_end * 60;
    }

    // กรณีไม่มีเวลาสิ้นสุด กำหนดความยาวเริ่มต้นเป็น 1 ชั่วโมง (60 นาที)
    if (startMin !== null && endMin === null) {
      endMin = startMin + 60;
    }

    return { startMin, endMin };
  }

  // แปลงข้อความแสดงเวลา (เช่น "09:00", "9.30 น.") เป็นนาที
  function parseTime(timeStr) {
    if (!timeStr) return null;
    const str = String(timeStr)
      .replace(/น\.?/g, "")
      .trim()
      .replace(".", ":");
    const parts = str.split(":");
    if (parts.length < 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  // แสดง/ซ่อนกล่องข้อความแจ้งเตือน
  function showAlertKey(key) {
    currentAlertKey = key;
    const msg = I18N[currentLang]?.alerts[key] || key;
    showAlertMessage(msg, key === "LOGIN_REQUIRED" || key === "SESSION_EXPIRED");
  }

  function showAlert(msg) {
    for (const [k, v] of Object.entries(I18N.th.alerts)) {
      if (v === msg) {
        showAlertKey(k);
        return;
      }
    }
    for (const [k, v] of Object.entries(I18N.en.alerts)) {
      if (v === msg) {
        showAlertKey(k);
        return;
      }
    }
    currentAlertKey = null;
    showAlertMessage(msg, msg.includes("ล็อกอิน") || msg.toLowerCase().includes("log in"));
  }

  function showAlertMessage(msg, showLink) {
    if (alertMessage) alertMessage.textContent = msg;
    if (alertLink) {
      if (showLink) {
        alertLink.classList.remove("hidden");
      } else {
        alertLink.classList.add("hidden");
      }
    }
    if (alertBox) alertBox.classList.remove("hidden");
  }

  function hideAlert() {
    currentAlertKey = null;
    if (alertBox) alertBox.classList.add("hidden");
  }

  // อัปเดตสถานะปุ่มดึงข้อมูลตารางเรียน (Loading state)
  function setLoading(loading) {
    isFetching = loading;
    if (fetchBtn) fetchBtn.disabled = loading;
    const t = I18N[currentLang];
    if (fetchBtnText) {
      fetchBtnText.textContent = loading ? t.fetchBtnLoading : t.fetchBtn;
    }
    if (spinIcon) {
      if (loading) spinIcon.classList.add("spinning");
      else spinIcon.classList.remove("spinning");
    }
  }

  // อัปเดตสถานะปุ่มบันทึกรูปภาพ (Export loading state)
  function setExportLoading(loading) {
    isExporting = loading;
    if (exportBtn) exportBtn.disabled = loading;
    const t = I18N[currentLang];
    if (loading) {
      if (exportBtnText) exportBtnText.textContent = t.exportBtnLoading;
      if (spinIconExport) {
        spinIconExport.classList.remove("hidden");
        spinIconExport.classList.add("spinning");
      }
      if (exportDefaultIcon) exportDefaultIcon.classList.add("hidden");
    } else {
      if (exportBtnText) exportBtnText.textContent = t.exportBtn;
      if (spinIconExport) {
        spinIconExport.classList.add("hidden");
        spinIconExport.classList.remove("spinning");
      }
      if (exportDefaultIcon) exportDefaultIcon.classList.remove("hidden");
    }
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
}
