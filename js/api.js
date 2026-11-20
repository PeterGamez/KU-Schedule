// จัดการการดึงข้อมูลจาก My KU API

// แปลงข้อมูลผลลัพธ์จาก API getEnrollYear ให้เป็น Array ของปี พ.ศ. (เรียงจากปีล่าสุดลงมา)
function parseEnrollYears(data) {
  if (!data?.enrollYear || !Array.isArray(data.enrollYear)) return [];
  return data.enrollYear
    .map((item) => parseInt(item.year, 10))
    .filter((y) => !isNaN(y))
    .sort((a, b) => b - a);
}

// Helper ยิงคำขอดึงข้อมูลผ่านแท็บ my.ku.th กรณี fetch ตรงจาก extension ล้มเหลว
async function tabFetch(targetTab, url, options = {}) {
  if (!targetTab?.id) return null;
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: async (fetchUrl, fetchOpts) => {
        try {
          const resp = await fetch(fetchUrl, { ...fetchOpts, credentials: "include" });
          let data = null;
          try { data = await resp.json(); } catch (e) {}
          return { ok: resp.ok, status: resp.status, data };
        } catch (err) {
          return { ok: false, status: 0, data: null };
        }
      },
      args: [url, options],
    });
    return res?.[0]?.result || null;
  } catch (err) {
    return null;
  }
}

// ดึงรายการปีการศึกษาที่ลงทะเบียนจาก POST https://my.ku.th/myku/api/enroll/getEnrollYear
async function fetchEnrollYears(stdId, reqHeaders, targetTab) {
  const url = "https://my.ku.th/myku/api/enroll/getEnrollYear";
  const fetchOpts = {
    method: "POST",
    headers: { ...reqHeaders, "content-type": "application/json" },
    body: JSON.stringify({ stdId }),
  };

  try {
    const res = await fetch(url, { ...fetchOpts, credentials: "include" });
    if (res.ok) return parseEnrollYears(await res.json());
  } catch (e) {}

  const tabRes = await tabFetch(targetTab, url, fetchOpts);
  return parseEnrollYears(tabRes?.data);
}

// ส่ง PublicCBP ก่อนดึงตารางเรียน
async function sendPublicCBP(stdId, headers, targetTab) {
  const url = "https://my.ku.th/myku/api/common/publicCBP";
  const fetchOpts = {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ keys: [["gcd", stdId]] }),
  };

  try {
    await fetch(url, { ...fetchOpts, credentials: "include" });
  } catch (e) {
    await tabFetch(targetTab, url, fetchOpts);
  }
}

// ดึงตารางเรียนจาก GET https://my.ku.th/myku/api/std-profile/getGroupCourse
async function fetchGroupCourse(targetYear, targetSemester, stdId, headers, targetTab) {
  const url = `https://my.ku.th/myku/api/std-profile/getGroupCourse?academicYear=${encodeURIComponent(targetYear)}&semester=${encodeURIComponent(targetSemester)}&stdId=${encodeURIComponent(stdId)}`;
  const fetchOpts = { method: "GET", headers };

  try {
    const res = await fetch(url, { ...fetchOpts, credentials: "include" });
    let scheduleData = null;
    try { scheduleData = await res.json(); } catch (e) {}
    return { status: res.status, scheduleData };
  } catch (e) {}

  const tabRes = await tabFetch(targetTab, url, fetchOpts);
  return { status: tabRes?.status || 0, scheduleData: tabRes?.data || null };
}
