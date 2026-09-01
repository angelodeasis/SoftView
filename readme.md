# SoftView

> **A privacy-first media viewer that helps soften potentially intense audio and visual moments.**

SoftView is an accessibility-focused media application designed to help users identify and soften potentially intense sensory events in audio and video.

The application analyzes selected media locally and can use the results to provide an **Assisted Viewing** experience.

## Why SoftView?

Some media contains moments that can be unexpectedly intense, such as:

* Sudden loud audio
* Sustained high-volume sections
* Rapid brightness changes
* Potential flashing sequences

SoftView is designed to give users more awareness and control over these moments while keeping their media private.

The project is also an exploration of local browser-based media processing, accessibility-focused UX, and privacy-conscious application architecture.

---

# How It Works

The intended experience is simple:

```text
Select Media
     ↓
Analyze Media
     ↓
Review Detected Events
     ↓
Assisted Viewing
```

### 1. Select Media

The user selects an MP4 or MP3 file from their device.

The media does not need to be uploaded to a SoftView server.

### 2. Analyze Media

SoftView analyzes the media locally.

The analysis looks for potentially intense:

* Audio events
* Visual events

The application produces timestamped analysis results.

### 3. Review Results

Users can review the detected events before starting Assisted Viewing.

Example:

```text
Analysis Complete

Potential sensory events detected: 7

🔊 Audio events: 5
💡 Visual events: 2

00:14  Potential loud audio
01:32  Potential flashing
02:48  Potential loud audio
04:17  Potential loud audio
05:03  Potential flashing
```

### 4. Assisted Viewing

During Assisted Viewing, SoftView uses the analysis results to soften detected events.

Potential behavior includes:

* Gradually reducing audio during potentially intense audio events.
* Gradually darkening or obscuring video during potentially intense visual events.
* Gradually restoring normal playback after the event.

The user remains in control of the experience.

---

# Privacy

Privacy is one of SoftView's core design principles.

SoftView is designed so that media can be processed entirely on the user's device.

### SoftView does not require:

* Media uploads
* Cloud storage
* Firebase
* A database
* User accounts
* Server-side media processing
* External media-analysis APIs

The intended architecture is:

```text
Your Device

   Original Media
        ↓
   Local Analysis
        ↓
   Detected Events
        ↓
   Assisted Viewing
```

The original media does not need to leave the user's device.

---

# Large Media Files

SoftView does not need to store large media files on a server simply because they are large.

However, large media can still require substantial processing resources on the user's device.

Processing difficulty can depend on:

* File size
* Duration
* Resolution
* Frame rate
* Codec
* Device performance

SoftView should therefore avoid unnecessarily loading an entire large media file into memory.

Where technically feasible, analysis should process media incrementally.

Very large or high-resolution files may take significantly longer to analyze.

---

# Assisted Media Export

A future version of SoftView may allow users to create a downloadable copy of their media with the detected mitigations permanently applied.

For example:

```text
original.mp4
     ↓
Local Processing
     ↓
softview-assisted.mp4
     ↓
Download to user's device
```

This would allow users to keep an assisted version for playback outside of SoftView.

The export would ideally happen entirely locally, meaning the original media would still not need to be uploaded to a server.

This feature is planned for a later stage because generating a new encoded video is considerably more technically demanding than modifying playback in real time.

---

# Detection Limitations

SoftView's analysis is heuristic.

It cannot perfectly understand human sensory sensitivity or guarantee that every potentially intense moment will be detected.

Possible outcomes include:

* False positives
* False negatives
* Missed events
* Events incorrectly identified as potentially intense

SoftView therefore uses terms such as **Potential Sensory Event** rather than claiming that an event is definitively dangerous.

SoftView does **not** claim that analyzed media is safe.

SoftView is not a medical device and is not intended to replace professional medical advice or individualized accessibility accommodations.

---

# MVP

The initial MVP focuses on the core experience.

### Media

* [ ] Local MP4 selection
* [ ] Local MP3 selection
* [ ] Basic media playback

### Audio Analysis

* [ ] Analyze audio locally
* [ ] Measure audio intensity over time
* [ ] Detect potentially intense audio sections
* [ ] Generate timestamps

### Visual Analysis

* [ ] Sample video frames locally
* [ ] Analyze brightness changes
* [ ] Detect potential flashing/rapid visual changes
* [ ] Generate timestamps

### Analysis Results

* [ ] Unified sensory-event model
* [ ] Event timeline
* [ ] Event list
* [ ] Analysis progress
* [ ] Clear limitations/disclaimer

### Assisted Viewing

* [ ] Audio mitigation
* [ ] Visual mitigation
* [ ] Gradual transitions
* [ ] Seeking support
* [ ] Playback during detected events

### Accessibility

* [ ] Keyboard navigation
* [ ] Accessible controls
* [ ] Clear status messages
* [ ] High-clarity interface
* [ ] Avoid unnecessary flashing UI

### Testing

* [ ] Audio analyzer tests
* [ ] Visual analyzer tests
* [ ] Event-processing tests
* [ ] Playback behavior tests
* [ ] Large-file testing
* [ ] Error handling tests

---

# Future Possibilities

Potential future features include:

* Local export of assisted media
* More supported media formats
* More sophisticated audio analysis
* Improved visual-event detection
* Custom sensitivity profiles
* More detailed event explanations
* Improved performance for long/high-resolution videos
* Additional accessibility options

Future features should continue to respect SoftView's privacy-first architecture.

---

# Technology

The initial technology direction is:

* **React**
* **Vite**
* **JavaScript**
* **Web Audio API**
* **HTML5 Media APIs**
* **Canvas APIs**
* **File / Blob APIs**

Additional technologies may be introduced when they provide a clear technical benefit.

For example, browser-based FFmpeg/WebAssembly may eventually be evaluated for local media export if browser-native APIs are insufficient.

---

# Architecture

SoftView separates the user interface from media analysis and playback behavior.

```text
React UI
    |
    v
Application State
    |
    +--------------------+
    |                    |
    v                    v
Audio Analyzer      Visual Analyzer
    |                    |
    +---------+----------+
              |
              v
       Detected Events
              |
              v
       Assisted Viewing
```

This separation makes the analysis engine easier to test and prevents the React UI from becoming responsible for detection logic.

---

# Project Philosophy

SoftView is being developed around several principles:

### Privacy First

User media should remain on the user's device.

### Accessibility First

The application should help users maintain control over their media experience.

### Honest Detection

Detection is probabilistic and imperfect. The application should communicate uncertainty rather than make guarantees.

### Incremental Development

Features should be implemented, tested, and validated individually.

### Simple Architecture

Avoid unnecessary servers, databases, accounts, and infrastructure.

### User Control

Users should decide when to analyze media and whether to use Assisted Viewing.

---

# Status

SoftView is currently in active development.

The project is being built incrementally, starting with the local media experience and gradually adding analysis and Assisted Viewing capabilities.

---

# License

## License

SoftView is proprietary software. All rights reserved.

The source code is publicly available for portfolio and
educational review. Viewing the source code does not grant
permission to copy, modify, redistribute, or commercially use
the software.
