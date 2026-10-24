// secrets.h for the Wokwi build. Wokwi's virtual Wi-Fi reaches the internet, so it needs a broker
// that is reachable from the internet (EMQX Cloud, or a public test broker for a first smoke test).
#pragma once
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASS ""
#define MQTT_HOST "broker.emqx.io"      // public TEST broker: anyone can read it — no real data
#define MQTT_PORT 1883
#define MQTT_USE_TLS 0
#define MQTT_USER ""
#define MQTT_PASS ""
#define DEVICE_ID "cb-wokwi-7f3a"       // unique-ish id so topics don't collide on a public broker
static const char MQTT_CA_CERT[] = "";
