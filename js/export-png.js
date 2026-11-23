// ส่งออกตารางเรียนเป็นไฟล์รูปภาพ PNG ด้วย html2canvas

// ตัดข้อความที่ยาวเกินความกว้างที่กำหนดและต่อท้ายด้วย "..." โดยไม่ตัดวรรณยุกต์/สระไทยขาด
function fitTextWithEllipsis(text, maxWidth, font, ctx, currentLang = "th") {
  if (!text || maxWidth <= 0) return text;

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

  const segmenter = new Intl.Segmenter(currentLang === "en" ? "en" : "th", { granularity: "grapheme" });
  const graphemes = Array.from(segmenter.segment(text), (s) => s.segment);

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

async function handleExportPNG({
  currentCourses,
  currentStudentInfo,
  currentLang,
  currentExportDays,
  showAlertKey,
  hideAlert,
  setExportLoading,
  exportBtnText,
}) {
  if (!currentCourses || currentCourses.length === 0) {
    showAlertKey("EXPORT_NO_COURSES");
    return;
  }

  hideAlert();
  setExportLoading(true);

  try {
    await document.fonts.ready;

    const exportTerm = document.getElementById("exportTerm");
    const exportTimestamp = document.getElementById("exportTimestamp");

    const semLabel = formatSemester(currentStudentInfo.semester, currentLang);
    exportTerm.textContent = I18N[currentLang].exportTerm(currentStudentInfo.academicYear, semLabel);

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
    const isDarkMode = document.documentElement.getAttribute("data-theme") === "dark";

    const canvas = await html2canvas(captureTarget, {
      scale: 2,
      useCORS: true,
      backgroundColor: isDarkMode ? "#0b1120" : "#ffffff",
      logging: false,
      windowWidth: 1400,
      onclone: (clonedDoc) => {
        if (isDarkMode) {
          clonedDoc.documentElement.setAttribute("data-theme", "dark");
        }
        const clonedArea = clonedDoc.getElementById("scheduleCaptureArea");
        if (clonedArea) {
          clonedArea.classList.add("is-exporting");
          clonedArea.style.width = "1400px";
          clonedArea.style.maxWidth = "1400px";
          clonedArea.style.minWidth = "1400px";
          clonedArea.style.padding = "20px";
          clonedArea.style.backgroundColor = isDarkMode ? "#0b1120" : "#ffffff";
          clonedArea.style.borderRadius = "8px";
          clonedArea.style.boxShadow = "none";
        }

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

        // ตรวจสอบการเปิด/ปิดวันเสาร์และวันอาทิตย์สำหรับ Export PNG (เฉพาะวันที่ไม่มีวิชาเรียน)
        const courses = Array.isArray(currentCourses) ? currentCourses : [];
        const hasSatCourses = courses.some((c) => normalizeDay(c.day_w) === "SAT");
        const hasSunCourses = courses.some((c) => normalizeDay(c.day_w) === "SUN");

        const satInput = document.querySelector('.day-toggle-input[data-day="SAT"]');
        const sunInput = document.querySelector('.day-toggle-input[data-day="SUN"]');
        const includeSat = hasSatCourses || (currentExportDays ? currentExportDays.SAT !== false : (satInput ? satInput.checked : true));
        const includeSun = hasSunCourses || (currentExportDays ? currentExportDays.SUN !== false : (sunInput ? sunInput.checked : true));

        if (!includeSat) {
          const satRow = clonedDoc.querySelector(".day-sat");
          if (satRow) satRow.remove();
        }
        if (!includeSun) {
          const sunRow = clonedDoc.querySelector(".day-sun");
          if (sunRow) sunRow.remove();
        }

        // ปรับแถวสุดท้ายของตารางใน clonedDoc ให้ไม่มี border-bottom
        const remainingRows = clonedDoc.querySelectorAll(".day-row");
        if (remainingRows.length > 0) {
          remainingRows[remainingRows.length - 1].style.borderBottom = "none";
        }

        const measurer = document.createElement("canvas").getContext("2d");

        const formatExportText = (el, font, padOffset) => {
          const block = el.closest(".course-block");
          const blockWidth = block ? block.getBoundingClientRect().width : 0;
          const availW = Math.max(20, (blockWidth || el.clientWidth || 180) - padOffset);
          const fullText = el.getAttribute("title") || el.textContent;

          el.textContent = fitTextWithEllipsis(fullText, availW, font, measurer, currentLang);
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

    canvas.toBlob((blob) => {
      if (!blob) {
        showAlertKey("EXPORT_ERROR");
        setExportLoading(false);
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const fileName = getExportFileName(currentStudentInfo, "png");

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
