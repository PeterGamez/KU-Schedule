// ดักจับเหตุการณ์เมื่อผู้ใช้คลิกที่ไอคอน Extension บนเบราว์เซอร์
chrome.action.onClicked.addListener(async () => {
  const scheduleUrl = chrome.runtime.getURL("index.html");

  // หากเปิดหน้า index.html ไว้อยู่แล้ว ให้สลับไปยังแท็บเดิม
  const tabs = await chrome.tabs.query({ url: scheduleUrl + "*" });
  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId) {
      await chrome.windows.update(tabs[0].windowId, { focused: true });
    }
  } else {
    // หากยังไม่ได้เปิด ให้สร้างแท็บใหม่
    await chrome.tabs.create({ url: scheduleUrl });
  }
});
