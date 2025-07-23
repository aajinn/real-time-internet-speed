# Privacy Policy - Real-Time Internet Speed Monitor

**Last Updated: January 2024**

## Overview
Real-Time Internet Speed Monitor is committed to protecting your privacy. This extension measures your internet connection speed locally and does not collect, store, or transmit any personal information.

## Data Collection and Usage

### What We DON'T Collect
- **No Personal Information**: We do not collect names, email addresses, or any personally identifiable information
- **No Browsing History**: We do not track, monitor, or store your browsing activities
- **No Location Data**: We do not access or store your geographical location
- **No User Analytics**: We do not use tracking scripts or analytics services
- **No Data Transmission**: Speed test results are processed locally and never sent to external servers

### What We DO
- **Local Speed Testing**: Measure your internet speed by downloading test files from public services
- **Local Storage Only**: Store speed history locally in your browser (last 10 measurements only)
- **Real-Time Processing**: All calculations are performed locally on your device

## Host Permissions Explained

### Why We Need These Permissions

#### 1. `https://httpbin.org/*`
**Purpose**: Primary speed testing service
**What it does**: 
- Downloads test files of known sizes (100KB to 2MB) to measure your download speed
- Provides accurate, unthrottled bandwidth measurements
- Uses a service specifically designed for HTTP testing

**Why this specific service**:
- Open-source and transparent
- Provides reliable, consistent test files
- No user tracking or data collection
- Industry-standard testing service

#### 2. `https://www.google.com/*`
**Purpose**: Fallback speed testing (backup service)
**What it does**:
- Downloads Google's logo image (13KB) when primary service is unavailable
- Ensures the extension continues working during service outages
- Provides basic connectivity testing

**Limited Access**:
- Only accesses the specific logo image file
- No access to search data, Gmail, or other Google services
- Used only for speed measurement, not data collection

#### 3. `https://upload.wikimedia.org/*`
**Purpose**: Secondary fallback testing source
**What it does**:
- Downloads a small image file (15KB) as a final backup option
- Ensures service reliability across different network conditions
- Provides redundancy for consistent speed measurements

**Why Wikimedia**:
- Reliable, globally distributed content delivery network
- Public domain images with stable URLs
- No user tracking or data collection

## How Speed Testing Works

1. **File Download**: The extension downloads small test files from public servers
2. **Time Measurement**: Measures how long the download takes
3. **Speed Calculation**: Calculates speed based on file size and download time
4. **Local Processing**: All calculations happen locally on your device
5. **Local Storage**: Results are stored only in your browser's local storage

## Data Retention

- **Speed History**: Last 10 speed measurements stored locally
- **User Preferences**: Rating dialog preferences stored locally
- **No Cloud Storage**: No data is ever sent to external servers or cloud services
- **Browser Deletion**: All data is deleted when you uninstall the extension

## Third-Party Services

### Services We Use (For Testing Only)
- **HTTPBin.org**: Open-source HTTP testing service
- **Google CDN**: For fallback image downloads
- **Wikimedia CDN**: For secondary fallback testing

### What These Services Know
- **Only Network Requests**: They see standard HTTP requests for file downloads
- **No Personal Data**: No personally identifiable information is transmitted
- **Standard Web Traffic**: Indistinguishable from normal web browsing
- **No Extension Identification**: Requests don't identify our extension specifically

## Your Rights and Controls

### You Can
- **View Speed History**: See your last 10 speed measurements locally
- **Clear Data**: Remove all stored data by uninstalling the extension
- **Control Testing**: Manually trigger speed tests or let them run automatically
- **Disable Features**: Use browser settings to limit extension permissions

### We Cannot
- **Access Your Data**: View your personal files, browsing history, or other apps
- **Track You**: Monitor your online activities or behavior
- **Share Data**: We have no data to share with third parties
- **Identify You**: Connect speed measurements to your identity

## Security Measures

- **Local Processing**: All data processing happens on your device
- **No Authentication**: No login required, no accounts created
- **Minimal Permissions**: Only requests necessary permissions for speed testing
- **Open Source Transparency**: Core functionality can be reviewed in the code

## Chrome Web Store Compliance

This extension complies with Chrome Web Store policies by:
- **Limited Data Use**: Only collecting data necessary for functionality
- **Transparent Permissions**: Clearly explaining why each permission is needed
- **No Deceptive Practices**: Honest description of features and data usage
- **User Benefit**: Providing clear value without hidden data collection

## Updates to Privacy Policy

We may update this privacy policy to reflect changes in:
- Extension functionality
- Third-party services used
- Chrome Web Store requirements
- User feedback and requests

Significant changes will be communicated through extension updates.

## Contact Information

For privacy-related questions or concerns:
- **Developer**: Ared
- **Website**: https://ared.dev
- **Chrome Web Store**: [Extension Listing](https://chromewebstore.google.com/detail/real-time-internet-speed/baffnjfijbgpjchgdmbnpkloeccnhenl)

## Summary

**In Plain English**: This extension only measures your internet speed by downloading test files. It doesn't spy on you, doesn't collect your personal information, and doesn't share any data with anyone. All speed measurements stay on your device. The permissions are only used to download test files from reliable public services to accurately measure your connection speed.