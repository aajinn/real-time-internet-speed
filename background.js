let latestSpeed = "--"; // Store the latest speed

async function getInternetSpeed() {
  const imageUrl = "https://i.ibb.co/M96xmYX/Screenshot-2024-09-29-091606.png"; // Small image URL (size 35.4 KB)
  const startTime = performance.now();

  try {
    await fetch(imageUrl, { cache: "no-store" });
    const endTime = performance.now();
    const duration = endTime - startTime; // Time in milliseconds
    const imageSizeBytes = 35400; // 35.4 KB in bytes
    let speedMbps = (imageSizeBytes * 8) / duration / 1000; // Speed in Mbps

    // Format the speed display
    latestSpeed = speedMbps < 10 ? speedMbps.toFixed(1) : speedMbps.toFixed(0);
    chrome.action.setBadgeText({ text: latestSpeed });
  } catch (error) {
    console.error("Error fetching image for speed test:", error);
    latestSpeed = "Err"; // Display "Err" on error
  }
}

// Recalculate speed every 5 seconds
setInterval(getInternetSpeed, 5000);

// Listen for requests from popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getSpeed") {
    sendResponse({ speed: latestSpeed });
  }
});
