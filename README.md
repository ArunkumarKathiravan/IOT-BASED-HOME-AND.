# ESP32 Smart Home Automation V2

Final synchronized version for Arunkumar's ESP32 Smart Home project.

## What this package contains

| File | Purpose |
|---|---|
| `index.html` | Website structure with login, dashboard, device cards, DHT11 display, Google Home section |
| `style.css` | Same dark professional theme, slower fan animation, sync-pending indicator |
| `script.js` | Firebase website control, login system, DHT11/weather display, fast sync improvements |
| `SmartHome_RainMaker_Firebase_Final.ino` | ESP32 Arduino code for RainMaker + Firebase + DHT11 + manual switches |
| `README.md` | Setup and upload guide |

## Main features

- Website control through Firebase Realtime Database
- Google Home voice control through ESP RainMaker
- Manual wall-switch mutual control
- DHT11 temperature, humidity, and heat-index upload
- Website, Google Home, RainMaker, relays, and switches synchronized
- Email/password login with email verification
- Forgot password
- Face/camera demo page kept for future passkey/Face ID upgrade

## Important changes in this version

### Synchronization fix

The old system could glitch because Google Home/manual switch could change the relay, but the ESP32 could later read an older Firebase value and reverse the state.

This version adds:

- `commandId`
- `lastUpdated` timestamp
- stale command ignore logic in ESP32
- short guard time after manual/Google commands
- website sync-pending indicator
- faster Firebase polling

### Website voice section update

The website text now says Google Home is active.

Alexa support text and badge were removed.

### Fan animation update

Fan animation speed was reduced so the fan icon does not rotate too fast.

## Firebase database path

The project uses this structure:

```json
{
  "SmartHome": {
    "devices": {
      "fan": {
        "state": false,
        "source": "web",
        "commandId": "",
        "lastUpdated": 0
      },
      "light1": {
        "state": false,
        "source": "web",
        "commandId": "",
        "lastUpdated": 0
      },
      "socket": {
        "state": false,
        "source": "web",
        "commandId": "",
        "lastUpdated": 0
      },
      "light2": {
        "state": false,
        "source": "web",
        "commandId": "",
        "lastUpdated": 0
      }
    },
    "environment": {
      "temperature": 0,
      "humidity": 0,
      "heatIndex": 0,
      "status": "Online",
      "lastUpdated": 0
    },
    "system": {
      "espOnline": true,
      "wifiRSSI": 0,
      "uptime": 0,
      "firmwareVersion": "RainMaker-Firebase-FastSync-V2",
      "lastSeen": 0
    }
  }
}
```

## Firebase rules for project demo

Use open rules only for demo/testing:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

For public use, change to Firebase Auth protected rules later.

## Hardware pins

### Relay pins

| Device | ESP32 GPIO |
|---|---|
| Fan | GPIO12 |
| Light 1 | GPIO14 |
| Socket | GPIO27 |
| Light 2 | GPIO26 |

Relay board type: low-level trigger.

| Relay state | GPIO output |
|---|---|
| ON | LOW |
| OFF | HIGH |

### Manual switch pins

Wire each switch between GPIO and GND.

| Switch | ESP32 GPIO |
|---|---|
| Fan switch | GPIO32 |
| Light 1 switch | GPIO33 |
| Socket switch | GPIO25 |
| Light 2 switch | GPIO13 |

### DHT11 3-pin sensor

| DHT11 pin | ESP32 |
|---|---|
| VCC | 3.3V |
| DATA | GPIO4 |
| GND | GND |

## Arduino IDE settings

Use these settings:

```text
Board: ESP32 Dev Module
Flash Size: 4MB
Partition Scheme: RainMaker 4MB No OTA
Core Debug Level: None
Baud: 115200
```

## Arduino libraries needed

Install these from Arduino IDE Library Manager:

```text
ArduinoJson
DHT sensor library by Adafruit
Adafruit Unified Sensor
```

ESP RainMaker is included with the ESP32 board package by Espressif.

## Upload steps

1. Open Arduino IDE.
2. Open `SmartHome_RainMaker_Firebase_Final.ino`.
3. Select `ESP32 Dev Module`.
4. Select `RainMaker 4MB No OTA`.
5. Select your COM port.
6. Click Upload.
7. If upload is stuck at `Connecting...`, hold BOOT until upload starts.
8. Open Serial Monitor at `115200`.
9. Press EN/RESET once.

## If RainMaker app shows old device or offline

Do factory reset:

1. Hold ESP32 BOOT button for more than 10 seconds.
2. Release.
3. Press EN/RESET.
4. Add the device again in ESP RainMaker app.
5. Use POP: `12345678`.
6. Use 2.4 GHz Wi-Fi.

## Upload website to GitHub Pages

Upload or replace these files in your GitHub repository:

```text
index.html
style.css
script.js
README.md
```

Then open the website with a cache-buster:

```text
https://arunkumarkathiravan.github.io/ESP-HOME-AUTOMATION/?v=finalsync1
```

Press:

```text
Ctrl + Shift + R
```

## Test order

Test in this exact order:

1. Open Serial Monitor.
2. Open website.
3. Turn ON Fan from website.
4. Confirm ESP32 serial shows Firebase website command.
5. Confirm Google Home/RainMaker shows ON.
6. Say: `Hey Google, turn off Fan`.
7. Confirm website changes to OFF.
8. Flip manual switch.
9. Confirm website + Google Home change.
10. Check DHT11 values on website.

## Notes

- Do not connect 230V AC directly to ESP32.
- Manual switch pins are low-voltage only.
- Use relay COM/NO/NC contacts for AC load wiring, with proper safety.
- Use common GND for ESP32 and relay module control side.
- For your optocoupler relay board, use your previously working power wiring:
  - JD-VCC to external 5V
  - VCC to ESP32 3.3V
  - GND common
