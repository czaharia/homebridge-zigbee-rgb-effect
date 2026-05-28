# homebridge-zigbee-rgb-effect

A Homebridge plugin to control a Zigbee RGB LED (Tuya TS0503B or compatible) via **Zigbee2MQTT** as a HomeKit switch, with a configurable **effect** (colorloop, blink, breathe, etc.) applied automatically on turn-on.

## Features

- Exposes each LED as a **HomeKit Switch**
- Turning **ON** sends `{"state":"ON"}` then applies your chosen effect (e.g. `colorloop`)
- Turning **OFF** sends `{"state":"OFF","effect":"stop_effect"}` to stop the effect cleanly
- **State tracking** — subscribes to `zigbee2mqtt/<FriendlyName>` and reads `state` from device feedback
- Multiple LEDs supported, each with its own effect
- Optional brightness setting on turn-on

## Supported Effects (tested on TS0503B)

`colorloop`, `blink`, `breathe`, `okay`, `channel_change`, `stop_effect`, `stop_colorloop`

## Requirements

- [Homebridge](https://homebridge.io/) v1.8.0+
- [Zigbee2MQTT](https://www.zigbee2mqtt.io/) running and connected to your broker
- An MQTT broker (e.g. Mosquitto)

## Installation

Install via the Homebridge UI plugin search.

## Configuration

Add a platform entry to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "ZigbeeRgbEffect",
      "name": "Zigbee RGB Effect",
      "mqttBroker": "mqtt://127.0.0.1:1883",
      "mqttUsername": "homebridge",
      "mqttPassword": "yourpassword",
      "accessories": [
        {
          "name": "LED Piscina LOOP",
          "zigbeeFriendlyName": "LED Piscina",
          "effect": "colorloop",
          "brightness": 254
        }
      ]
    }
  ]
}
```

### Config options

| Field | Required | Description |
|---|---|---|
| `platform` | ✅ | Must be `ZigbeeRgbEffect` |
| `name` | ✅ | Platform display name |
| `mqttBroker` | ✅ | MQTT broker URL (e.g. `mqtt://127.0.0.1:1883`) |
| `mqttUsername` | ❌ | MQTT username (omit if not required) |
| `mqttPassword` | ❌ | MQTT password (omit if not required) |
| `accessories` | ✅ | Array of LED accessories |
| `accessories[].name` | ✅ | Name shown in HomeKit |
| `accessories[].zigbeeFriendlyName` | ✅ | Zigbee2MQTT friendly name |
| `accessories[].effect` | ✅ | Effect on turn-on (`colorloop`, `blink`, `breathe`, etc.) |
| `accessories[].brightness` | ❌ | Brightness (0–254) applied on turn-on |

## How it works

1. On **switch ON**: publishes `{"state":"ON"}` (+ optional `brightness`) then, after 300ms, publishes `{"effect":"<your_effect>"}` to `zigbee2mqtt/<FriendlyName>/set`
2. On **switch OFF**: publishes `{"state":"OFF","effect":"stop_effect"}` to stop the effect and turn off
3. **State feedback**: subscribes to `zigbee2mqtt/<FriendlyName>` and reads `.state` from JSON messages to keep HomeKit in sync

## License

Apache-2.0
