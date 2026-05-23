async function fetchJSON(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept": "application/json,text/plain,*/*",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
      "Referer": "https://www.twse.com.tw/"
    }
  });

  const text = await response.text();

  if (!response.ok) {
    console.error("HTTP error:", response.status, text.slice(0, 300));
    return null;
  }

  const trimmed = text.trim();

  if (
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.includes("FOR SECURITY REASONS") ||
    trimmed.includes("因安全性考量")
  ) {
    console.error("TWSE returned HTML security page instead of JSON:", text.slice(0, 500));
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("JSON parse error:", text.slice(0, 500));
    return null;
  }
}
