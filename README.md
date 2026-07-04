# ESP32 Smart Home - Priority Sync Final

This version reduces glitching by changing the sync architecture.

## Main Fix

The website does not directly write actual device state anymore.

Website command path:

```text
SmartHome/commands/<device>
```

ESP32 confirms real state here:

```text
SmartHome/devices/<device>
```

So ESP32 is the authority for the actual relay state.

## Control Priority

- Google Home / RainMaker app: direct to ESP32 and fastest.
- Physical switch: direct to ESP32 and fast.
- Website: sends command to Firebase, then ESP32 applies it.

Whichever command happens latest becomes the real state.

## Manual Switch Wiring

```text
GPIO pin ---- physical switch ---- GND
```

Open circuit = HIGH. Closed to GND = LOW.

Any stable physical switch movement toggles the current relay state. This supports bidirectional control even if website/Google state and switch physical position are different.

## Pins

| Device | Relay GPIO | Switch GPIO |
|---|---:|---:|
| Fan | GPIO12 | GPIO32 |
| Light 1 | GPIO14 | GPIO33 |
| Socket | GPIO27 | GPIO25 |
| Light 2 | GPIO26 | GPIO13 |

DHT11:

```text
VCC  -> 3.3V
DATA -> GPIO4
GND  -> GND
```

## Arduino IDE Settings

```text
Board: ESP32 Dev Module
Flash Size: 4MB
Partition Scheme: RainMaker 4MB No OTA
Core Debug Level: None
Serial Monitor: 115200
```

## Libraries

Install:

```text
ArduinoJson
DHT sensor library by Adafruit
Adafruit Unified Sensor
```

## Upload

Upload these to GitHub:

```text
index.html
style.css
script.js
README.md
```

Open:

```text
https://arunkumarkathiravan.github.io/ESP-HOME-AUTOMATION/?v=priorityfinal1
```

Then press `Ctrl + Shift + R`.

Upload this to ESP32:

```text
SmartHome_Priority_Sync_Final.ino
```
