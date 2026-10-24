// config.h — pins and build switches for the Calm Band (ESP32 DevKit V1, 30-pin).
#pragma once

// ---- Pins (identical in Wokwi and the real build) ----
#define PIN_SDA 21          // MAX30102 + MPU6050 share this I2C bus
#define PIN_SCL 22
#define PIN_MOTOR 25        // vibration motor module IN (LED stand-in in Wokwi)
#define PIN_BUTTON 27       // local STOP; other leg to GND; internal pull-up
#define PIN_STATUS_LED 2    // on-board LED: solid = connected, blinking = not connected

// ---- Build switches ----
// SIM_PULSE 1: synthetic pulse waveform instead of the MAX30102 (Wokwi has no MAX30102).
// Windows are then labelled origin "replay". Set 0 for the real sensor.
#ifndef SIM_PULSE
#define SIM_PULSE 1
#endif
// FAST_WINDOWS 1: 5 s windows every 1 s, for simulation and integration tests. 0 = real 60 s / 15 s.
#ifndef FAST_WINDOWS
#define FAST_WINDOWS 0
#endif

// ENABLE_RECORD_BOOT 1: holding STOP at power-on selects RECORD mode. 0 for emulators that cannot
// model the button's pull-up (QEMU reads the pin as pressed).
#ifndef ENABLE_RECORD_BOOT
#define ENABLE_RECORD_BOOT 1
#endif

#define MPU6050_ADDR 0x68
#define I2C_HZ 100000      // 100 kHz: tolerant of the 30 cm sensor wires in the desk-hub layout
#define RECONNECT_EVERY_MS 5000
#define RAW_BATCH 25        // RECORD mode: samples per raw message (4 messages/s at 100 Hz)
