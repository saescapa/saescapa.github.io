export const FIXTURE_COUNT = 8;
export const CHANNELS_PER_FIXTURE = 4;
export const dmx = new Uint8Array(FIXTURE_COUNT * CHANNELS_PER_FIXTURE);

const subscribers = new Set();

export function commit() {
  subscribers.forEach((callback) => callback(dmx));
}

export function clearDMX() {
  dmx.fill(0);
  commit();
}

export function subscribe(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}
