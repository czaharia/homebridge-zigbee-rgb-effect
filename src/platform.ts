import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import * as mqtt from 'mqtt';
import { PLATFORM_NAME, PLUGIN_NAME, PlatformConfig as PluginConfig, AccessoryConfig } from './settings.js';

export class ZigbeeRgbEffectPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];

  private mqttClient: mqtt.MqttClient | undefined;
  private readonly pluginConfig: PluginConfig;

  // Map deviceId -> current known state
  private readonly deviceState: Map<string, boolean> = new Map();

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    this.pluginConfig = config as unknown as PluginConfig;

    this.log.debug('Initialising Zigbee RGB Effect platform');

    this.api.on('didFinishLaunching', () => {
      this.connectMqtt();
      this.discoverDevices();
    });

    this.api.on('shutdown', () => {
      if (this.mqttClient) {
        this.mqttClient.end();
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading cached accessory:', accessory.displayName);
    this.accessories.push(accessory);
  }

  private connectMqtt() {
    const { mqttBroker, mqttUsername, mqttPassword } = this.pluginConfig;

    const opts: mqtt.IClientOptions = {};
    if (mqttUsername) {
      opts.username = mqttUsername;
    }
    if (mqttPassword) {
      opts.password = mqttPassword;
    }

    this.log.info(`Connecting to MQTT broker: ${mqttBroker}`);
    this.mqttClient = mqtt.connect(mqttBroker, opts);

    this.mqttClient.on('connect', () => {
      this.log.info('MQTT connected');
      // Subscribe to state topics for all configured accessories
      const accessories = this.pluginConfig.accessories || [];
      for (const acc of accessories) {
        const stateTopic = `zigbee2mqtt/${acc.zigbeeFriendlyName}`;
        this.mqttClient!.subscribe(stateTopic, (err) => {
          if (err) {
            this.log.error(`Failed to subscribe to ${stateTopic}: ${err.message}`);
          } else {
            this.log.debug(`Subscribed to ${stateTopic}`);
          }
        });
      }
    });

    this.mqttClient.on('message', (topic: string, payload: Buffer) => {
      this.handleMqttMessage(topic, payload.toString());
    });

    this.mqttClient.on('error', (err: Error) => {
      this.log.error('MQTT error:', err.message);
    });

    this.mqttClient.on('reconnect', () => {
      this.log.debug('MQTT reconnecting...');
    });

    this.mqttClient.on('offline', () => {
      this.log.warn('MQTT client went offline');
    });
  }

  private handleMqttMessage(topic: string, payload: string) {
    try {
      const msg = JSON.parse(payload);
      const accessories = this.pluginConfig.accessories || [];

      for (const accConfig of accessories) {
        const stateTopic = `zigbee2mqtt/${accConfig.zigbeeFriendlyName}`;
        if (topic !== stateTopic) {
          continue;
        }

        const isOn = typeof msg.state === 'string' && msg.state.toUpperCase() === 'ON';
        const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${accConfig.zigbeeFriendlyName}`);
        const platformAccessory = this.accessories.find(a => a.UUID === uuid);

        if (!platformAccessory) {
          continue;
        }

        const service = platformAccessory.getService(this.Service.Switch);
        if (!service) {
          continue;
        }

        const previousState = this.deviceState.get(accConfig.zigbeeFriendlyName);
        if (previousState !== isOn) {
          this.log.debug(`State update for "${accConfig.name}": ${isOn ? 'ON' : 'OFF'}`);
          this.deviceState.set(accConfig.zigbeeFriendlyName, isOn);
          service.updateCharacteristic(this.Characteristic.On, isOn);
        }
      }
    } catch {
      // Ignore non-JSON messages
    }
  }

  private discoverDevices() {
    const accessories = this.pluginConfig.accessories || [];

    for (const accConfig of accessories) {
      const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${accConfig.zigbeeFriendlyName}`);
      const existing = this.accessories.find(a => a.UUID === uuid);

      if (existing) {
        this.log.info(`Restoring cached accessory: ${accConfig.name}`);
        existing.context.config = accConfig;
        this.api.updatePlatformAccessories([existing]);
        this.setupAccessory(existing, accConfig);
      } else {
        this.log.info(`Adding new accessory: ${accConfig.name}`);
        const accessory = new this.api.platformAccessory(accConfig.name, uuid);
        accessory.context.config = accConfig;
        this.setupAccessory(accessory, accConfig);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.push(accessory);
      }
    }

    // Remove stale accessories that are no longer in config
    const configuredUUIDs = accessories.map(a =>
      this.api.hap.uuid.generate(`${PLUGIN_NAME}:${a.zigbeeFriendlyName}`)
    );
    const stale = this.accessories.filter(a => !configuredUUIDs.includes(a.UUID));
    if (stale.length > 0) {
      this.log.info(`Removing ${stale.length} stale accessory(ies)`);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    }
  }

  private setupAccessory(accessory: PlatformAccessory, accConfig: AccessoryConfig) {
    // Set accessory information
    const infoService = accessory.getService(this.Service.AccessoryInformation)
      || accessory.addService(this.Service.AccessoryInformation);

    infoService
      .setCharacteristic(this.Characteristic.Manufacturer, 'Tuya / Zigbee2MQTT')
      .setCharacteristic(this.Characteristic.Model, 'TS0503B RGB LED')
      .setCharacteristic(this.Characteristic.SerialNumber, accConfig.zigbeeFriendlyName);

    // Get or create switch service
    const switchService = accessory.getService(this.Service.Switch)
      || accessory.addService(this.Service.Switch);

    switchService.setCharacteristic(this.Characteristic.Name, accConfig.name);

    // Handle GET — return last known state
    switchService.getCharacteristic(this.Characteristic.On)
      .onGet(() => {
        const state = this.deviceState.get(accConfig.zigbeeFriendlyName) ?? false;
        this.log.debug(`GET "${accConfig.name}" -> ${state}`);
        return state;
      });

    // Handle SET — publish to MQTT
    switchService.getCharacteristic(this.Characteristic.On)
      .onSet((value) => {
        const isOn = value as boolean;
        this.log.info(`SET "${accConfig.name}" -> ${isOn ? 'ON' : 'OFF'}`);
        this.publishCommand(accConfig, isOn);
      });
  }

  private publishCommand(accConfig: AccessoryConfig, isOn: boolean) {
    if (!this.mqttClient || !this.mqttClient.connected) {
      this.log.error('MQTT client not connected, cannot publish command');
      return;
    }

    const setTopic = `zigbee2mqtt/${accConfig.zigbeeFriendlyName}/set`;

    if (isOn) {
      // Step 1: Turn on (optionally with brightness)
      const onPayload: Record<string, unknown> = { state: 'ON' };
      if (accConfig.brightness !== undefined) {
        onPayload.brightness = accConfig.brightness;
      }
      this.mqttClient.publish(setTopic, JSON.stringify(onPayload), { retain: false }, (err) => {
        if (err) {
          this.log.error(`Failed to publish ON to ${setTopic}: ${err.message}`);
          return;
        }
        this.log.debug(`Published ON to ${setTopic}`);

        // Step 2: Apply effect after a short delay (device needs to be ON first)
        setTimeout(() => {
          const effectPayload = { effect: accConfig.effect };
          this.mqttClient!.publish(setTopic, JSON.stringify(effectPayload), { retain: false }, (err2) => {
            if (err2) {
              this.log.error(`Failed to publish effect to ${setTopic}: ${err2.message}`);
            } else {
              this.log.debug(`Published effect "${accConfig.effect}" to ${setTopic}`);
            }
          });
        }, 300);
      });
    } else {
      // Turn off and stop any running effect
      const offPayload = { state: 'OFF', effect: 'stop_effect' };
      this.mqttClient.publish(setTopic, JSON.stringify(offPayload), { retain: false }, (err) => {
        if (err) {
          this.log.error(`Failed to publish OFF to ${setTopic}: ${err.message}`);
        } else {
          this.log.debug(`Published OFF to ${setTopic}`);
        }
      });
    }
  }
}
