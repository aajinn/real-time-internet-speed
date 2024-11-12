let latestSpeed = "--"; // Store the latest speed globally

async function getInternetSpeed() {
  const imageUrl = "https://i.ibb.co/7JJvSKS/converted-2-asd.jpg"; // Small image URL
  const imageSizeBytes = 14300; // 14.3 KB in bytes
  const numSamples = 3; // Number of samples to average
  let totalSpeed = 0;

  for (let i = 0; i < numSamples; i++) {
    const startTime = performance.now();

    try {
      await fetch(imageUrl, { cache: "no-store" });
    } catch (error) {
      console.error("Error fetching image for speed test:", error);
      latestSpeed = "Err"; // Update global latestSpeed on error
      chrome.action.setBadgeText({ text: "Err" });
      return; // Exit if there's a failure
    }

    const endTime = performance.now();
    const duration = endTime - startTime;
    const speedMbps = (imageSizeBytes * 8) / duration / 1000;
    totalSpeed += speedMbps;
  }

  // Calculate and update the latest speed globally
  const averageSpeed = totalSpeed / numSamples;
  latestSpeed =
    averageSpeed < 10 ? averageSpeed.toFixed(1) : averageSpeed.toFixed(0);

  // Set badge text with the updated speed
  chrome.action.setBadgeText({ text: latestSpeed });
}

// Run the speed test every 5 seconds (5000 ms)
setInterval(() => getInternetSpeed(), 5000);

// Listen for requests from popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getSpeed") {
    sendResponse({ speed: latestSpeed });
  }
});
