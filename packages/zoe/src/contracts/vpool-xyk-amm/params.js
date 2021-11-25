// @ts-check

import { makeParamManagerBuilder } from '@agoric/governance/src/paramGovernance/paramManager.js';

export const POOL_FEE_KEY = 'PoolFee';
export const PROTOCOL_FEE_KEY = 'ProtocolFee';

/** @type {(poolFeeBP: bigint, protocolFeeBP: bigint) => ParamManagerFull} */
export const makeParamManager = (poolFeeBP, protocolFeeBP) => {
  return makeParamManagerBuilder()
    .addNat(POOL_FEE_KEY, poolFeeBP)
    .addNat(PROTOCOL_FEE_KEY, protocolFeeBP)
    .build();
};
