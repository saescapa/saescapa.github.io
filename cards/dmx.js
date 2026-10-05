export const dmx = new Uint8Array(4);

const subscribers = new Set();

export function setDMX(values) {
  const count = Math.min(values.length, dmx.length);
  for (let channel = 0; channel < count; channel++) {
    dmx[channel] = Math.max(0, Math.min(255, Math.round(values[channel])));
  }
  subscribers.forEach((callback) => callback(dmx));
}

export function subscribe(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}
