# MirrorWell V3 Demo Runbook

> **Purpose:** a 12-minute Zoom demonstration of the local, offline-capable exercise-support flow.
>
> **Locked decisions:** run the live flow first; keep the exact same flow recorded in the adjacent tab as fallback. During the live session, the presenter’s Zoom camera is OFF because MirrorWell owns the webcam.

## Setup checklist

### Before joining Zoom

- [ ] Use the wired network for the live call; keep the laptop connected to power.
- [ ] Set up good, even front lighting. Keep the face and shoulders in the camera frame.
- [ ] Open the seeded HomeScreen with two months of history from V2 Task 8.
- [ ] Confirm the assigned exercise and calibration are ready before sharing.
- [ ] Open the recorded fallback in the **adjacent browser tab**, paused at `0:00`. It must show the exact same flow and final UI.
- [ ] Record or refresh the fallback only after V3 Tasks 1–2 land.

### Zoom share settings

- [ ] Share the **browser window**, not the full screen.
- [ ] Turn **Share sound ON**.
- [ ] Turn **Optimize for video clip OFF** so UI text stays sharp.
- [ ] Turn the presenter’s **Zoom camera OFF** for the live session segment. The app owns the webcam; most cameras cannot serve Zoom and MirrorWell at the same time.
- [ ] Confirm the shared window is legible on the Zoom preview before starting.

## 12-minute live flow

| Time | Segment | Action and narration |
|---|---|---|
| 0:00–0:45 | Cold open | Show the seeded HomeScreen. “This is MirrorWell: a local exercise-support tool that gives visual feedback during a clinician-assigned exercise. The history stays on this device.” |
| 0:45–1:45 | Story | “The goal is steady, gentle practice. The app measures visible movement against this person’s own calibration; it does not diagnose, grade, or predict anything.” |
| 1:45–2:30 | Enter session | Open the calibrated exercise and briefly show the exercise name and calibration state. Keep the presenter’s Zoom camera OFF. |
| 2:30–6:30 | Live session | Perform the exercise. “The green band is the target, up, hold, release, that’s a rep.” Let one rep trigger the ease-off cue on purpose. “That one didn’t count; the effort cue says ease off.” If the frame quality dips: “That one didn’t count; the light dipped.” |
| 6:30–7:30 | Summary | Finish the session and show the SummaryScreen gentleness stat. “This is a session summary for this person’s own practice; it is not a clinical measure.” |
| 7:30–8:45 | Trends | Show the TrendsScreen drift chart. “This chart shows stored, derived practice metrics above the device’s measured noise floor. It is not a comparison with other people.” |
| 8:45–9:45 | Phone clip | Show the 15-second recording from V2 Task 9’s installed PWA on the phone. Keep the clip short and return to the shared browser window. |
| 9:45–10:45 | Offline moment | Open DevTools, enable offline, and reload or navigate. “The app keeps working because the data and runtime are local.” Disable offline afterward if needed for the remaining rehearsal state. |
| 10:45–12:00 | Close | Return to HomeScreen. “MirrorWell is a practice aid, not a diagnosis or substitute for professional care. If the app and the clinician ever disagree, the clinician wins.” Stop sharing and take questions. |

## Recorded fallback

- [ ] Keep a screen recording of the exact same 12-minute flow open in the **adjacent browser tab**, paused at `0:00`.
- [ ] Do not use a different build, different copy, or a different sequence in the recording.
- [ ] If any live glitch is not recovered within 10 seconds, say: **“Let me show you this morning’s run.”**
- [ ] Press `Ctrl+Tab`, press play, and continue the narration from the matching point.
- [ ] Practice the switch until it takes under 5 seconds.
- [ ] If the live camera quality drops, do not guess or describe an unverified metric; use the fallback or say: **“That one didn’t count; the light dipped.”**

## Rehearsal gate

The demo is not ready until all three checks pass:

- [ ] Complete two full dry runs over a real Zoom call to a second device.
- [ ] On each run, verify browser-window share, Share sound ON, Optimize for video clip OFF, presenter Zoom camera OFF during the live session, and the adjacent-tab switch.
- [ ] On one dry run, throttle the browser with Chrome DevTools **Slow 4G**. Confirm the gauge and all narration remain legible after Zoom compression.
- [ ] Confirm the fallback switch takes under 5 seconds and the recorded flow matches the current UI.
- [ ] Confirm the offline toggle moment works without a network request or loss of local data.

## Phone install acceptance record

| Field | Value |
|---|---|
| Test date | _(fill in)_ |
| Device | _(e.g., Pixel 8 / Android 15 / Chrome 128)_ |
| Airplane-mode relaunch | ☐ Pass / ☐ Fail |
| PWA installed from home screen | ☐ Pass / ☐ Fail |
| Demo mode visible | ☐ Pass / ☐ Fail |
| 15-second clip filename | `proof/phone-install-____-__-__.mp4` |
| Clip committed | ☐ Yes / ☐ No |

## Production checks

| Variable | Value | Purpose |
|---|---|---|
| `VITE_CONSENT_VERSION` | `1` | Forces re-onboarding when the consent version changes |
| `VITE_DEMO_MODE_ENABLED` | `true` | Shows the demo entry for evaluators without attesting |
| `VITE_ENABLE_DEBUG_HUD` | `false` | Keeps the debug HUD out of the production demo |

Before the demo, run the repository’s documented offline and no-injection checks after the final deployment. Do not add analytics, telemetry, or third-party scripts.
