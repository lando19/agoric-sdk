// @ts-check
import { E, Far } from '@agoric/far';
import {
  feeIssuerConfig,
  meteringConfig,
  zoeFeesConfig,
} from './bootstrap-zoe-config';

/**
 * @typedef { import('@agoric/eventual-send').EProxy } EProxy
 * @typedef { ERef<ReturnType<typeof
 *   import('@agoric/swingset-vat/src/devices/mailbox-src.js').buildRootDeviceNode>> } MailboxDevice
 * @typedef { ERef<ReturnType<typeof
 *   import('@agoric/swingset-vat/src/vats/vat-tp.js').buildRootObject>> } VattpVat
 * @typedef { ERef<ReturnType<typeof
 *   import('@agoric/swingset-vat/src/kernel/vatAdmin/vatAdminWrapper.js').buildRootObject>> } VatAdminVat
 * @typedef { ERef<ReturnType<typeof
 *   import('@agoric/swingset-vat/src/vats/vat-timerWrapper.js').buildRootObject>> } TimerVat
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

  /**
   * @param {VattpVat} vattp
   * @param {MailboxDevice} mailbox
   */
  const connectVattpWithMailbox = async (vattp, mailbox) => {
    D(mailbox).registerInboundHandler(vattp);
    await E(vattp).registerMailboxDevice(mailbox);
  };

  return Far('bootstrap', {
    /**
     * Bootstrap vats and devices.
     *
     * @param {{
     *   vattp: VattpVat,
     *   timer: TimerVat,
     *   vatAdmin: VatAdminVat,
     *   zoe: ReturnType<import('./vat-zoe').buildRootObject>,
     * }} vats
     * @param {{
     *   mailbox: MailboxDevice,
     *   vatAdmin: unknown,
     *   timer: unknown,
     * }} devices
     */
    bootstrap: async (vats, devices) => {
      await connectVattpWithMailbox(vats.vattp, devices.mailbox);

      const chainTimerServiceP = E(vats.timer).createTimerService(
        devices.timer,
      );
      const vatAdminSvcP = E(vats.vatAdmin).createVatAdminService(
        devices.vatAdmin,
      );

      const {
        zoeService: _zoe,
        feeMintAccess: _2,
        feeCollectionPurse: _3,
      } = await E(vats.zoe).buildZoe(
        vatAdminSvcP,
        feeIssuerConfig,
        zoeFeesConfig(chainTimerServiceP),
        meteringConfig,
      );
    },
  });
}
