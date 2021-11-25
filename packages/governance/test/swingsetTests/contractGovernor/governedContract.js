// @ts-check

import { handleParamGovernance } from '../../../src/contractHelper.js';
import {
  ParamType,
  makeParamManagerBuilder,
} from '../../../src/paramGovernance/paramManager.js';

const MALLEABLE_NUMBER = 'MalleableNumber';

/** @type {ContractStartFn} */
const start = async zcf => {
  const {
    main: [{ name, type, value }],
  } = zcf.getTerms();
  assert(type === ParamType.NAT, `${name} Should be a Nat: ${type}`);

  const { makePublicFacet, makeCreatorFacet } = handleParamGovernance(
    zcf,
    makeParamManagerBuilder()
      .addNat(name, value)
      .build(),
  );

  return {
    publicFacet: makePublicFacet({}),
    creatorFacet: makeCreatorFacet({}),
  };
};

harden(start);
harden(MALLEABLE_NUMBER);

export { start, MALLEABLE_NUMBER };
