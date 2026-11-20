// KU Schedule - Main Controller
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSchedule);
} else {
  initSchedule();
}

async function initSchedule() {
  // DOM Elements
  const fetchBtn = document.getElementById("fetchBtn");
  const fetchBtnText = document.getElementById("fetchBtnText");
  const spinIcon = fetchBtn ? fetchBtn.querySelector(".spin-icon") : null;

  const exportBtn = document.getElementById("exportBtn");
  const exportBtnText = document.getElementById("exportBtnText");
  const spinIconExport = document.querySelector(".spin-icon-export");
  const exportDefaultIcon = document.querySelector(".export-default-icon");

  const exportIcsBtn = document.getElementById("exportIcsBtn");
  const exportIcsBtnText = document.getElementById("exportIcsBtnText");
  const spinIconExportIcs = document.querySelector(".spin-icon-export-ics");
  const exportIcsDefaultIcon = document.querySelector(".export-ics-default-icon");

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

  // App State
  let currentCourses = null;
  let currentStudentInfo = null;
  let cachedEnrolledYears = null;
  let userHasSelectedTerm = false;
  let isFetching = false;
  let isExporting = false;
  let isExportingIcs = false;
  let currentAlertKey = null;
  let currentLang = "th";

  // เริ่มต้นสร้างหัวตาราง โหลดปีการศึกษา และภาษา
  initGridHeader(hoursTrack);

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(["ku_schedule_lang"]);
      if (stored?.ku_schedule_lang) {
        currentLang = stored.ku_schedule_lang;
      }
    } catch (e) { }
  }
  setLanguage(currentLang);

  // โหลดแคชเดิม (ถ้ามี)
  const cached = await loadCachedSchedule();
  if (cached?.courses && cached.studentInfo) {
    currentCourses = cached.courses;
    currentStudentInfo = cached.studentInfo;
    cachedEnrolledYears = cached.enrolledYears || null;
    initYearOptions(cached.studentInfo.academicYear, cachedEnrolledYears);
    if (cached.studentInfo.semester != null && cached.studentInfo.semester !== "" && semesterSelect) {
      semesterSelect.value = cached.studentInfo.semester.toString();
    }
    renderScheduleGrid(cached.courses, daysBody, currentLang);
  } else {
    initYearOptions();
    handleFetch();
  }

  // ผูก Event Listeners
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
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      handleExportPNG({
        currentCourses,
        currentStudentInfo,
        yearSelect,
        semesterSelect,
        currentLang,
        showAlertKey,
        hideAlert,
        setExportLoading,
        exportBtnText,
      });
    });
  }
  if (exportIcsBtn) {
    exportIcsBtn.addEventListener("click", () => {
      handleExportICS({
        currentCourses,
        currentStudentInfo,
        yearSelect,
        semesterSelect,
        currentLang,
        showAlertKey,
        hideAlert,
        setExportIcsLoading,
        exportIcsBtnText,
      });
    });
  }

  if (langThBtn) langThBtn.addEventListener("click", () => setLanguage("th"));
  if (langEnBtn) langEnBtn.addEventListener("click", () => setLanguage("en"));

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
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ ku_schedule_lang: currentLang });
      }
    } catch (e) { }

    document.documentElement.lang = currentLang;

    if (langThBtn) langThBtn.classList.toggle("active", currentLang === "th");
    if (langEnBtn) langEnBtn.classList.toggle("active", currentLang === "en");

    const t = I18N[currentLang];

    if (yearLabel) yearLabel.textContent = t.yearLabel;
    if (semesterLabel) semesterLabel.textContent = t.semesterLabel;
    if (dayCorner) dayCorner.textContent = t.dayCorner;
    if (exportCredit) exportCredit.textContent = t.exportCredit;
    if (alertLink) alertLink.textContent = t.alertLink;

    if (yearSelect) yearSelect.title = t.yearTitle;
    if (semesterSelect) semesterSelect.title = t.semesterTitle;
    if (fetchBtn) fetchBtn.title = t.fetchTitle;
    if (exportBtn) exportBtn.title = t.exportTitle;
    if (exportIcsBtn) exportIcsBtn.title = t.exportIcsTitle;

    if (fetchBtnText) {
      fetchBtnText.textContent = isFetching ? t.fetchBtnLoading : t.fetchBtn;
    }
    if (exportBtnText) {
      exportBtnText.textContent = isExporting ? t.exportBtnLoading : t.exportBtn;
    }
    if (exportIcsBtnText) {
      exportIcsBtnText.textContent = isExportingIcs ? t.exportIcsBtnLoading : t.exportIcsBtn;
    }

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

    if (currentAlertKey && t.alerts[currentAlertKey]) {
      showAlertKey(currentAlertKey);
    }

    renderScheduleGrid(currentCourses || [], daysBody, currentLang);
  }

  // กำหนดตัวเลือกปีการศึกษาใน Dropdown
  function initYearOptions(defaultYear, yearList = null) {
    if (!yearSelect) return;
    const now = new Date();
    const currentBuddhistYear = now.getFullYear() + 543 - (now.getMonth() < 5 ? 1 : 0);
    const yearsSet = new Set(Array.isArray(yearList) ? yearList : []);

    const defNum = defaultYear ? parseInt(defaultYear, 10) : null;
    if (defNum && !isNaN(defNum)) {
      yearsSet.add(defNum);
    }
    if (yearsSet.size === 0) {
      yearsSet.add(currentBuddhistYear);
    }

    const years = Array.from(yearsSet).sort((a, b) => b - a);
    const currentVal = yearSelect.value;
    yearSelect.innerHTML = "";
    years.forEach((y) => {
      const opt = document.createElement("option");
      opt.value = y.toString();
      opt.textContent = y.toString();
      yearSelect.appendChild(opt);
    });

    if (defNum && years.includes(defNum)) {
      yearSelect.value = defNum.toString();
    } else if (currentVal && years.includes(parseInt(currentVal, 10))) {
      yearSelect.value = currentVal;
    } else {
      yearSelect.value = years[0].toString();
    }
  }

  // ดึงข้อมูลตารางเรียนจาก my.ku.th
  async function handleFetch() {
    if (isFetching) return;
    isFetching = true;
    hideAlert();
    setLoading(true);

    try {
      const tabs = await chrome.tabs.query({ url: "https://my.ku.th/*" });
      if (!tabs || tabs.length === 0) {
        showAlertKey("LOGIN_REQUIRED");
        return;
      }

      const targetTab = tabs.find((t) => t.active) || tabs[0];

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

      const enrollYears = await fetchEnrollYears(stdId, headers, targetTab);
      if (enrollYears.length > 0) {
        cachedEnrolledYears = enrollYears;
        const curYear = yearSelect?.value || academicYear;
        initYearOptions(curYear, enrollYears);
      } else if (!userHasSelectedTerm && !currentStudentInfo) {
        if (academicYear) initYearOptions(academicYear);
      }

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

      currentStudentInfo = studentData;

      await sendPublicCBP(stdId, headers, targetTab);

      const { status, scheduleData } = await fetchGroupCourse(targetYear, targetSemester, stdId, headers, targetTab);

      if (status === 401) {
        showAlertKey("SESSION_EXPIRED");
        return;
      }

      const isDataNotFound = scheduleData?.message?.trim().toLowerCase().includes("not found");
      if (isDataNotFound) {
        currentCourses = [];
        renderScheduleGrid([], daysBody, currentLang);
        showAlertKey("NOT_FOUND");
        return;
      }

      if (!scheduleData || !scheduleData.results || !scheduleData.results[0]?.course) {
        showAlertKey("FETCH_FAILED");
        return;
      }

      const courses = scheduleData.results[0].course;
      currentCourses = courses;
      await saveCachedSchedule(studentData, courses, cachedEnrolledYears);
      renderScheduleGrid(courses, daysBody, currentLang);

    } catch (err) {
      console.error(err);
      showAlertKey("FETCH_ERROR");
    } finally {
      isFetching = false;
      setLoading(false);
    }
  }

  // UI Alerts & Loading State Helpers
  function showAlertKey(key) {
    currentAlertKey = key;
    const msg = I18N[currentLang]?.alerts[key] || key;
    const showLink = key === "LOGIN_REQUIRED" || key === "SESSION_EXPIRED";
    if (alertMessage) alertMessage.textContent = msg;
    if (alertLink) alertLink.classList.toggle("hidden", !showLink);
    if (alertBox) alertBox.classList.remove("hidden");
  }

  function hideAlert() {
    currentAlertKey = null;
    if (alertBox) alertBox.classList.add("hidden");
  }

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

  function setExportIcsLoading(loading) {
    isExportingIcs = loading;
    if (exportIcsBtn) exportIcsBtn.disabled = loading;
    const t = I18N[currentLang];
    if (loading) {
      if (exportIcsBtnText) exportIcsBtnText.textContent = t.exportIcsBtnLoading;
      if (spinIconExportIcs) {
        spinIconExportIcs.classList.remove("hidden");
        spinIconExportIcs.classList.add("spinning");
      }
      if (exportIcsDefaultIcon) exportIcsDefaultIcon.classList.add("hidden");
    } else {
      if (exportIcsBtnText) exportIcsBtnText.textContent = t.exportIcsBtn;
      if (spinIconExportIcs) {
        spinIconExportIcs.classList.add("hidden");
        spinIconExportIcs.classList.remove("spinning");
      }
      if (exportIcsDefaultIcon) exportIcsDefaultIcon.classList.remove("hidden");
    }
  }
}
