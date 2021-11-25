// @ts-check

import { Far } from '@agoric/marshal';
import { sameStructure } from '@agoric/same-structure';

const { details: X, quote: q } = assert;

/**
 * Helper for the 90% of contracts that will have only a single set of
 * parameters. In order to support managed parameters, a contract only has to
 *   * define the parameter template, which includes name, type and value
 *   * call handleParamGovernance() to get makePublicFacet and makeCreatorFacet
 *   * add any methods needed in the public and creator facets.
 *
 *  @type {HandleParamGovernance}
 */
const handleParamGovernance = (zcf, paramManager) => {
  const terms = zcf.getTerms();
  /** @type {ParamDescriptions} */
  const governedParams = terms.main;
  const { electionManager } = terms;

  assert(
    sameStructure(governedParams, paramManager.getParamList()),
    X`Terms must include ${q(paramManager.getParamList())}, but were ${q(
      governedParams,
    )}`,
  );

  const typedAccessors = {
    getAmount: name => paramManager.getAmount(name),
    getBrand: name => paramManager.getBrand(name),
    getInstance: name => paramManager.getInstance(name),
    getInstallation: name => paramManager.getInstallation(name),
    getInvitationAmount: name => paramManager.getInvitationAmount(name),
    getNat: name => paramManager.getNat(name),
    getRatio: name => paramManager.getRatio(name),
    getString: name => paramManager.getString(name),
    getUnknown: name => paramManager.getUnknown(name),
  };

  const makePublicFacet = (originalPublicFacet = {}) => {
    return Far('publicFacet', {
      ...originalPublicFacet,
      getSubscription: () => paramManager.getSubscription(),
      getContractGovernor: () => electionManager,
      getGovernedParams: () => {
        return paramManager.getParams();
      },
      ...typedAccessors,
    });
  };

  /** @type {LimitedCreatorFacet} */
  const limitedCreatorFacet = Far('governedContract creator facet', {
    getContractGovernor: () => electionManager,
  });

  const makeCreatorFacet = (originalCreatorFacet = Far('creatorFacet', {})) => {
    return Far('creatorFacet', {
      getParamMgrRetriever: () => {
        return Far('paramRetriever', { get: () => paramManager });
      },
      getInternalCreatorFacet: () => originalCreatorFacet,
      getLimitedCreatorFacet: () => limitedCreatorFacet,
    });
  };

  return harden({
    makePublicFacet,
    makeCreatorFacet,
    ...typedAccessors,
  });
};
harden(handleParamGovernance);
export { handleParamGovernance };
