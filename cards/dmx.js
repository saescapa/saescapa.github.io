(() => {
  'use strict';

  const FIXTURE_COUNT = 8;
  const CHANNELS_PER_FIXTURE = 4;
  const dmx = new Uint8Array(FIXTURE_COUNT * CHANNELS_PER_FIXTURE);

  const subscribers = new Set();

  function commit() {
    subscribers.forEach((callback) => callback(dmx));
  }

  function clearDMX() {
    dmx.fill(0);
    commit();
  }

  function subscribe(callback) {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  }

  window.site = window.site || {};
  window.site.dmx = { dmx, FIXTURE_COUNT, CHANNELS_PER_FIXTURE, commit, clearDMX, subscribe };
})();
