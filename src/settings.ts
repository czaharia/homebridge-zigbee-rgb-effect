export const PLATFORM_NAME = 'HomebridgeZigbeeRgbEffect';
export const PLUGIN_NAME = 'homebridge-zigbee-rgb-effect';

export type EffectType =
  | 'colorloop'
  | 'blink'
  | 'breathe'
  | 'okay'
  | 'channel_change'
  | 'stop_effect'
  | 'stop_colorloop';

export interface AccessoryConfig {
  name: string;
  zigbeeFriendlyName: string;
  effect: EffectType;
  brightness?: number;
}

export interface PlatformConfig {
  name: string;
  mqttBroker: string;
  mqttUsername?: string;
  mqttPassword?: string;
  accessories: AccessoryConfig[];
}
