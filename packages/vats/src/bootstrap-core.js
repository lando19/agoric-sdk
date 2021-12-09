// @ts-check
import { E, Far } from '@agoric/far';

/**
 * @typedef { import('@agoric/eventual-send').EProxy } EProxy
 * @typedef { ReturnType<typeof
 *   import('@agoric/swingset-vat/src/devices/mailbox-src.js').buildRootDeviceNode> } MailboxDevice
 * @typedef { ReturnType<typeof
 *   import('@agoric/swingset-vat/src/vats/vat-tp.js').buildRootObject> } VattpVat
 */

/**
 * Build root object of the bootstrap vat.
 *
 * @param {{
 *   D: EProxy // approximately
 * }} vatPowers
 * @param {Record<string, unknown>} _vatParameters
 */
export function buildRootObject(vatPowers, _vatParameters) {
  const { D } = vatPowers;

  return Far('bootstrap', {
    /**
     * Bootstrap vats and devices.
     *
     * Introduce vattp and mailbox to each other.
     *
     * @param {{vattp: VattpVat }} vats
     * @param {{mailbox: MailboxDevice}} devices
     */
    bootstrap: async (vats, devices) => {
      D(devices.mailbox).registerInboundHandler(vats.vattp);
      await E(vats.vattp).registerMailboxDevice(devices.mailbox);
    },
  });
}
