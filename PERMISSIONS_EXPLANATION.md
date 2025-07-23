# Chrome Extension Permissions Explanation

## Host Permissions Required

### 1. `https://httpbin.org/*`
**Justification**: Primary speed testing service
- **Specific Use**: Downloads test files of known sizes (100KB-2MB) to measure internet speed accurately
- **Why Essential**: HTTPBin is an open-source HTTP testing service that provides reliable, unthrottled downloads with precise file sizes necessary for accurate bandwidth calculations
- **Data Handling**: No personal data transmitted; only standard HTTP requests for file downloads
- **User Benefit**: Enables accurate, real-time internet speed measurements

### 2. `https://www.google.com/*`
**Justification**: Fallback speed testing source
- **Specific Use**: Downloads Google logo image (13KB) when primary service is unavailable
- **Why Essential**: Ensures extension continues functioning during HTTPBin outages or network restrictions
- **Limited Scope**: Only accesses specific logo image, not search, Gmail, or other Google services
- **Data Handling**: Standard image download request with no personal data collection
- **User Benefit**: Provides service reliability and consistent functionality

### 3. `https://upload.wikimedia.org/*`
**Justification**: Secondary fallback testing source
- **Specific Use**: Downloads small image file (15KB) as final backup option for speed testing
- **Why Essential**: Ensures service availability across different network conditions and geographic regions
- **Limited Scope**: Only accesses specific public domain image files
- **Data Handling**: Standard HTTP image requests with no user tracking
- **User Benefit**: Guarantees extension works reliably worldwide

## Standard Permissions

### `activeTab`
- **Use**: Allows extension to function when popup is opened
- **Scope**: Only active when user opens extension popup
- **No Data Access**: Does not access tab content or browsing data

### `background`
- **Use**: Enables background speed testing and badge updates
- **Scope**: Runs speed tests periodically and updates extension badge
- **No Data Access**: Only performs network speed measurements

## Privacy Commitment

- **No Personal Data Collection**: Extension does not collect, store, or transmit any personally identifiable information
- **Local Processing Only**: All speed calculations performed locally on user's device
- **No User Tracking**: No analytics, tracking scripts, or behavioral monitoring
- **Transparent Operation**: All network requests are solely for speed testing purposes
- **Data Retention**: Only stores last 10 speed measurements locally in browser

## Chrome Web Store Compliance

This extension fully complies with Chrome Web Store policies:
- **Single Purpose**: Exclusively measures internet connection speed
- **Limited Data Use**: Only requests data necessary for core functionality
- **Transparent Permissions**: All permissions directly related to speed testing
- **User Value**: Provides clear utility without hidden data collection
- **No Deceptive Practices**: Honest, straightforward functionality description

## Technical Implementation

- **Speed Testing Method**: Downloads test files, measures transfer time, calculates bandwidth
- **Fallback System**: Multiple sources ensure consistent service availability
- **Error Handling**: Graceful degradation when services are unavailable
- **Resource Efficiency**: Adaptive testing to minimize network usage
- **User Control**: Manual testing option with automatic background monitoring