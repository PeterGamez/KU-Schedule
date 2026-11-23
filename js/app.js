// KU Schedule - Main Controller
const ICS_FORMAT_KEYS = [
  "name_room",
  "name_room_brackets",
  "name_only",
  "name_sec_room",
  "name_room_sec",
  "name_type_room",
  "name_type_sec_room",
  "code_name_room",
  "code_name_type_room",
  "code_name_sec_room",
];

initSchedule();

async function initSchedule() {
  // DOM Elements
  const fetchBtn = document.getElementById("fetchBtn");
  const fetchBtnText = document.getElementById("fetchBtnText");
  const spinIcon = document.querySelector("#fetchBtn .spin-icon");

  const exportBtn = document.getElementById("exportBtn");
  const exportBtnText = document.getElementById("exportBtnText");
  const spinIconExport = document.querySelector(".spin-icon-export");
  const exportDefaultIcon = document.querySelector(".export-default-icon");

  const exportIcsBtn = document.getElementById("exportIcsBtn");
  const exportIcsBtnText = document.getElementById("exportIcsBtnText");
  const spinIconExportIcs = document.querySelector(".spin-icon-export-ics");
  const exportIcsDefaultIcon = document.querySelector(".export-ics-default-icon");

  const icsModal = document.getElementById("icsModal");
  const icsModalTitle = document.getElementById("icsModalTitle");
  const icsModalSubtitle = document.getElementById("icsModalSubtitle");
  const icsFormatLabel = document.getElementById("icsFormatLabel");
  const icsFormatSelect = document.getElementById("icsFormatSelect");
  const icsPreviewLabel = document.getElementById("icsPreviewLabel");
  const icsPreviewText = document.getElementById("icsPreviewText");
  const icsModalCloseBtn = document.getElementById("icsModalCloseBtn");
  const icsModalCancelBtn = document.getElementById("icsModalCancelBtn");
  const icsModalDownloadBtn = document.getElementById("icsModalDownloadBtn");
  const icsModalDownloadBtnText = document.getElementById("icsModalDownloadBtnText");
  const icsModalSyncBtn = document.getElementById("icsModalSyncBtn");
  const icsModalSyncBtnText = document.getElementById("icsModalSyncBtnText");
  const modalSyncProgress = document.getElementById("modalSyncProgress");
  const modalSyncProgressText = document.getElementById("modalSyncProgressText");
  const syncSpinIcon = icsModalSyncBtn?.querySelector(".sync-spin-icon");
  const gcalIcon = icsModalSyncBtn?.querySelector(".gcal-icon");

  const yearSelect = document.getElementById("yearSelect");
  const semesterSelect = document.getElementById("semesterSelect");
  const yearLabel = document.getElementById("yearLabel");
  const semesterLabel = document.getElementById("semesterLabel");

  const langThBtn = document.getElementById("langThBtn");
  const langEnBtn = document.getElementById("langEnBtn");

  const themeSwitch = document.getElementById("themeSwitch");
  const themeLightBtn = document.getElementById("themeLightBtn");
  const themeDarkBtn = document.getElementById("themeDarkBtn");

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
  let isSyncingGoogleCalendar = false;
  let currentAlertKey = null;
  let currentLang = "th";
  let currentTheme = "light";
  let currentIcsFormat = "name_room";

  // เริ่มต้นสร้างหัวตาราง โหลดปีการศึกษา และภาษา
  initGridHeader(hoursTrack);
  updateExportButtonsState();

  try {
    const stored = await chrome.storage.local.get(["ku_schedule_lang", "ku_schedule_ics_format", "ku_schedule_theme"]);
    if (stored?.ku_schedule_lang) {
      currentLang = stored.ku_schedule_lang;
    }
    if (stored?.ku_schedule_ics_format) {
      currentIcsFormat = stored.ku_schedule_ics_format;
    }
    if (stored?.ku_schedule_theme) {
      currentTheme = stored.ku_schedule_theme;
    }
  } catch (e) { }
  setTheme(currentTheme);
  setLanguage(currentLang);

  // โหลดแคชเดิม (ถ้ามี)
  const cached = await loadCachedSchedule();
  if (cached && cached.courses && cached.studentInfo) {
    currentCourses = cached.courses;
    currentStudentInfo = cached.studentInfo;
    cachedEnrolledYears = cached.enrolledYears || null;
    initYearOptions(cached.studentInfo.academicYear, cachedEnrolledYears);
    if (cached.studentInfo.semester != null && semesterSelect) {
      semesterSelect.value = cached.studentInfo.semester;
    }
    renderScheduleGrid(cached.courses, daysBody, currentLang);
    updateExportButtonsState();
  } else {
    initYearOptions();
    handleFetch();
  }

  // ผูก Event Listeners
  if (alertLink) {
    alertLink.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: "https://my.ku.th" });
    });
  }

  if (fetchBtn) {
    fetchBtn.addEventListener("click", () => handleFetch());
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      if (!currentCourses || currentCourses.length === 0) return;
      handleExportPNG({
        currentCourses,
        currentStudentInfo,
        currentLang,
        showAlertKey,
        hideAlert,
        setExportLoading,
        exportBtnText,
      });
    });
  }

  function initIcsFormatOptions(lang) {
    if (!icsFormatSelect) return;
    const curVal = icsFormatSelect.value || currentIcsFormat || "name_room";
    icsFormatSelect.innerHTML = "";
    const t = I18N[lang];

    ICS_FORMAT_KEYS.forEach((key) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = (t.icsFormats && t.icsFormats[key]) || key;
      icsFormatSelect.appendChild(opt);
    });

    icsFormatSelect.value = ICS_FORMAT_KEYS.includes(curVal) ? curVal : "name_room";
    currentIcsFormat = icsFormatSelect.value;
    updateIcsPreview();
  }

  function updateIcsPreview() {
    if (!icsPreviewText || !currentCourses || currentCourses.length === 0) return;
    icsPreviewText.textContent = formatCourseTitle(currentCourses[0], currentIcsFormat, currentLang);
  }

  function openIcsModal() {
    if (!icsModal) return;
    initIcsFormatOptions(currentLang);
    icsModal.classList.remove("hidden");
  }

  function closeIcsModal() {
    if (!icsModal) return;
    icsModal.classList.add("hidden");
  }

  if (exportIcsBtn) {
    exportIcsBtn.addEventListener("click", () => {
      if (!currentCourses || currentCourses.length === 0) return;
      openIcsModal();
    });
  }

  if (icsModalCloseBtn) {
    icsModalCloseBtn.addEventListener("click", closeIcsModal);
  }

  if (icsModalCancelBtn) {
    icsModalCancelBtn.addEventListener("click", closeIcsModal);
  }

  if (icsModal) {
    icsModal.addEventListener("click", (e) => {
      if (e.target === icsModal) closeIcsModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && icsModal && !icsModal.classList.contains("hidden")) {
      closeIcsModal();
    }
  });

  if (icsFormatSelect) {
    icsFormatSelect.addEventListener("change", () => {
      currentIcsFormat = icsFormatSelect.value;
      updateIcsPreview();
      try {
        chrome.storage.local.set({ ku_schedule_ics_format: currentIcsFormat });
      } catch (e) { }
    });
  }

  // ดาวน์โหลดเป็นไฟล์ .ics
  if (icsModalDownloadBtn) {
    icsModalDownloadBtn.addEventListener("click", () => {
      closeIcsModal();
      handleExportICS({
        currentCourses,
        currentStudentInfo,
        currentLang,
        titleFormat: currentIcsFormat,
        showAlertKey,
        hideAlert,
        setExportIcsLoading,
        exportIcsBtnText,
      });
    });
  }

  // ซิงค์เข้า Google Calendar โดยตรงผ่าน API
  if (icsModalSyncBtn) {
    icsModalSyncBtn.addEventListener("click", async () => {
      if (isSyncingGoogleCalendar) return;
      if (!currentCourses || currentCourses.length === 0) return;

      isSyncingGoogleCalendar = true;
      if (modalSyncProgress) modalSyncProgress.classList.remove("hidden");
      if (syncSpinIcon) syncSpinIcon.classList.remove("hidden");
      if (gcalIcon) gcalIcon.classList.add("hidden");
      if (icsModalSyncBtn) icsModalSyncBtn.disabled = true;
      if (icsModalDownloadBtn) icsModalDownloadBtn.disabled = true;
      if (icsModalCancelBtn) icsModalCancelBtn.disabled = true;

      const t = I18N[currentLang];
      if (icsModalSyncBtnText) icsModalSyncBtnText.textContent = t.icsModalSyncing;

      try {
        await syncScheduleToGoogleCalendar({
          courses: currentCourses,
          studentInfo: currentStudentInfo,
          lang: currentLang,
          titleFormat: currentIcsFormat,
          onProgress: (msg) => {
            if (modalSyncProgressText) modalSyncProgressText.textContent = msg;
          },
        });

        closeIcsModal();
        showAlertKey("SYNC_GCAL_SUCCESS", true);
      } catch (err) {
        console.error("Google Calendar Sync Error:", err);
        const errMsg = String(err?.message || err).toLowerCase();
        if (
          errMsg.includes("cancel") ||
          errMsg.includes("turned down") ||
          errMsg.includes("not approve") ||
          errMsg.includes("denied")
        ) {
          showAlertKey("SYNC_GCAL_CANCELLED");
        } else {
          showAlertKey("SYNC_GCAL_ERROR");
        }
      } finally {
        isSyncingGoogleCalendar = false;
        if (modalSyncProgress) modalSyncProgress.classList.add("hidden");
        if (syncSpinIcon) syncSpinIcon.classList.add("hidden");
        if (gcalIcon) gcalIcon.classList.remove("hidden");
        if (icsModalSyncBtn) icsModalSyncBtn.disabled = false;
        if (icsModalDownloadBtn) icsModalDownloadBtn.disabled = false;
        if (icsModalCancelBtn) icsModalCancelBtn.disabled = false;
        if (icsModalSyncBtnText) icsModalSyncBtnText.textContent = t.icsModalSyncBtn;
      }
    });
  }

  if (langThBtn) {
    langThBtn.addEventListener("click", () => setLanguage("th"));
  }
  if (langEnBtn) {
    langEnBtn.addEventListener("click", () => setLanguage("en"));
  }

  if (themeLightBtn) {
    themeLightBtn.addEventListener("click", () => setTheme("light"));
  }
  if (themeDarkBtn) {
    themeDarkBtn.addEventListener("click", () => setTheme("dark"));
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

  // ฟังก์ชันสลับธีม สว่าง (ขาว) / มืด (ดำ)
  function setTheme(theme) {
    currentTheme = theme === "dark" ? "dark" : "light";
    try {
      chrome.storage.local.set({ ku_schedule_theme: currentTheme });
    } catch (e) { }

    if (currentTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    if (themeLightBtn) themeLightBtn.classList.toggle("active", currentTheme === "light");
    if (themeDarkBtn) themeDarkBtn.classList.toggle("active", currentTheme === "dark");
  }

  // ฟังก์ชันสลับภาษาไทย / อังกฤษ
  function setLanguage(lang) {
    currentLang = lang === "en" ? "en" : "th";
    try {
      chrome.storage.local.set({ ku_schedule_lang: currentLang });
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

    if (themeSwitch) themeSwitch.title = t.themeSwitchTitle;
    if (themeLightBtn) themeLightBtn.title = t.themeLightTitle;
    if (themeDarkBtn) themeDarkBtn.title = t.themeDarkTitle;

    if (yearSelect) yearSelect.title = t.yearTitle;
    if (semesterSelect) semesterSelect.title = t.semesterTitle;
    if (fetchBtn) fetchBtn.title = t.fetchTitle;
    if (exportBtn) exportBtn.title = t.exportTitle;
    if (exportIcsBtn) exportIcsBtn.title = t.exportIcsTitle;

    if (icsModalTitle) icsModalTitle.textContent = t.icsModalTitle;
    if (icsModalSubtitle) icsModalSubtitle.textContent = t.icsModalSubtitle;
    if (icsFormatLabel) icsFormatLabel.textContent = t.icsFormatLabel;
    if (icsPreviewLabel) icsPreviewLabel.textContent = t.icsPreviewLabel;
    if (icsModalCancelBtn) icsModalCancelBtn.textContent = t.icsCancelBtn;
    if (icsModalDownloadBtnText) icsModalDownloadBtnText.textContent = t.icsModalDownloadBtn;
    if (icsModalSyncBtnText) {
      icsModalSyncBtnText.textContent = isSyncingGoogleCalendar ? t.icsModalSyncing : t.icsModalSyncBtn;
    }
    initIcsFormatOptions(currentLang);

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
    const currentMonth = now.getMonth();
    const defaultBuddhistYear = now.getFullYear() + 543 - (currentMonth < 5 ? 1 : 0);

    const yearsSet = new Set(yearList || []);
    if (defaultYear) {
      yearsSet.add(Number(defaultYear));
    }
    if (yearsSet.size === 0) {
      yearsSet.add(defaultBuddhistYear);
    }

    const years = Array.from(yearsSet).sort((a, b) => b - a);
    const currentVal = yearSelect.value;
    yearSelect.innerHTML = "";

    years.forEach((y) => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    });

    const targetYear = Number(defaultYear) || Number(currentVal);
    if (targetYear && years.includes(targetYear)) {
      yearSelect.value = targetYear;
    } else {
      yearSelect.value = years[0];
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

      const activeTab = tabs.find((t) => t.active);
      const targetTab = activeTab || tabs[0];

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

      const userInfo = parsed.user || {};
      const idCode = userInfo.idCode;
      const stdId = userInfo.stdId;
      const academicYear = userInfo.academicYear;
      const semester = userInfo.semester;
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
      } else if (!userHasSelectedTerm && !currentStudentInfo && academicYear) {
        initYearOptions(academicYear);
      }

      if (!userHasSelectedTerm && !currentStudentInfo && semesterSelect) {
        semesterSelect.value = semester;
      }

      const targetYear = (yearSelect && yearSelect.value) || academicYear;
      const targetSemester = (semesterSelect && semesterSelect.value) || semester;

      if (!targetYear || !targetSemester) {
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

      const msg = scheduleData?.message?.toLowerCase() || "";
      if (msg.includes("not found")) {
        currentCourses = [];
        renderScheduleGrid([], daysBody, currentLang);
        showAlertKey("NOT_FOUND");
        return;
      }

      const courses = scheduleData?.results?.[0]?.course;
      if (!Array.isArray(courses)) {
        showAlertKey("FETCH_FAILED");
        return;
      }

      currentCourses = courses;
      await saveCachedSchedule(studentData, courses, cachedEnrolledYears);
      renderScheduleGrid(courses, daysBody, currentLang);

    } catch (err) {
      console.error(err);
      showAlertKey("FETCH_ERROR");
    } finally {
      isFetching = false;
      setLoading(false);
      updateExportButtonsState();
    }
  }

  // UI Alerts & Loading State Helpers
  function showAlertKey(key, isSuccess = false) {
    currentAlertKey = key;
    const langDict = I18N[currentLang];
    const msg = (langDict && langDict.alerts[key]) || key;
    const showLink = key === "LOGIN_REQUIRED" || key === "SESSION_EXPIRED";

    if (alertMessage) alertMessage.textContent = msg;
    if (alertLink) alertLink.classList.toggle("hidden", !showLink);
    if (alertBox) {
      alertBox.classList.remove("hidden");
      alertBox.classList.toggle("alert-success", isSuccess || key === "SYNC_GCAL_SUCCESS");
    }
  }

  function hideAlert() {
    currentAlertKey = null;
    if (alertBox) {
      alertBox.classList.add("hidden");
      alertBox.classList.remove("alert-success");
    }
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

  function updateExportButtonsState() {
    const hasCourses = Boolean(currentCourses && currentCourses.length > 0);
    if (exportBtn) {
      exportBtn.disabled = !hasCourses || isExporting;
    }
    if (exportIcsBtn) {
      exportIcsBtn.disabled = !hasCourses || isExportingIcs;
    }
  }

  function setExportLoading(loading) {
    isExporting = loading;
    updateExportButtonsState();
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
    updateExportButtonsState();
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
