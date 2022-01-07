import { addressesEqual, getFakeTokenSymbol, isTestNetwork, loadTokenData } from '../helpers';
import { calculateNewAccumulatedAmount, getFlowEventEntity, isFlowEqual } from './helpers';
import superTokenABI from '../abi/SuperToken.js';

const superTokenContracts = new Map();

export const handleFlowUpdated = async (state, event, app, settings) => {
  const { agentAddress } = state;
  const {
    _blockNumber,
    sender,
    receiver,
    token: tokenAddress,
    totalReceiverFlowRate,
    totalSenderFlowRate,
  } = event.returnValues;

  if (!isAgentSender(agentAddress, sender, receiver)) {
    return state;
  }

  const { timestamp } = await app.web3Eth('getBlock', _blockNumber).toPromise();

  const [newSuperTokens, newFlows] = await Promise.all([
    updateSuperTokens(
      state,
      app,
      settings,
      tokenAddress,
      timestamp,
      addressesEqual(agentAddress, sender) ? totalSenderFlowRate : totalReceiverFlowRate
    ),
    updateFlows(state, event, timestamp, settings.superfluid.cfa.contract),
  ]);

  return {
    ...state,
    superTokens: newSuperTokens,
    flows: newFlows,
  };
};

export const handleVaultEvent = async (state, event, app, settings) => {
  const { token: tokenAddress, _blockNumber } = event.returnValues;
  const { timestamp } = await app.web3Eth('getBlock', _blockNumber).toPromise();

  return {
    ...state,
    superTokens: await updateSuperTokens(state, app, settings, tokenAddress, timestamp),
  };
};

export const handleSetAgent = async (
  state,
  { returnValues: { agent: newAgentAddress } },
  settings
) => {
  console.log('Should unsubscribe from previous agent and subscribe to the new one');

  // TODO: Implement handler (cancel all old agent's subscriptions and subscribe to the new one)
};

const isAgentSender = (agentAddress, sender, receiver) => {
  return addressesEqual(agentAddress, sender) || addressesEqual(agentAddress, receiver);
};

const getSuperTokenContract = (tokenAddress, app) => {
  const tokenContract = superTokenContracts.has(tokenAddress)
    ? superTokenContracts.get(tokenAddress)
    : app.external(tokenAddress, superTokenABI);
  superTokenContracts.set(tokenAddress, tokenContract);

  return tokenContract;
};

const updateSuperTokens = async (
  { superTokens: oldSuperTokens, agentAddress },
  app,
  settings,
  tokenAddress,
  updateTimestamp,
  netFlow
) => {
  const tokenContract = getSuperTokenContract(tokenAddress, app);
  const newSuperTokens = [...oldSuperTokens];
  let superTokenIndex = oldSuperTokens.findIndex(({ address }) =>
    addressesEqual(tokenAddress, address)
  );
  let updatedToken;

  if (superTokenIndex === -1) {
    updatedToken = {
      ...(await newSuperToken(tokenContract, app, settings)),
    };
  } else {
    updatedToken = {
      ...oldSuperTokens[superTokenIndex],
    };
  }

  updatedToken.address = tokenAddress;
  updatedToken.lastUpdateTimestamp = updateTimestamp;
  updatedToken.balance = await tokenContract.balanceOf(agentAddress).toPromise();

  if (typeof netFlow !== 'undefined') {
    updatedToken.netFlow = netFlow;
  }

  if (superTokenIndex === -1) {
    newSuperTokens.push(updatedToken);
  } else {
    newSuperTokens[superTokenIndex] = updatedToken;
  }

  return newSuperTokens;
};

const updateFlows = async (state, event, updateTimestamp) => {
  const { agentAddress } = state;
  const { receiver, flowRate, token: tokenAddress } = event.returnValues;
  const newFlows = [...state.flows];

  const isIncoming = addressesEqual(receiver, agentAddress);
  const flowIndex = newFlows.findIndex(flow => isFlowEqual(flow, event));
  const flowExists = !!newFlows[flowIndex];

  // Create flow case
  if (!flowExists) {
    newFlows.push({
      isCancelled: false,
      isIncoming,
      entity: getFlowEventEntity(event, isIncoming),
      superTokenAddress: tokenAddress,
      accumulatedAmount: '0',
      creationTimestamp: updateTimestamp,
      lastTimestamp: updateTimestamp,
      flowRate,
    });
  }
  // Update flow case
  else if (flowExists && flowRate > 0) {
    newFlows[flowIndex] = {
      ...newFlows[flowIndex],
      accumulatedAmount: calculateNewAccumulatedAmount(state.flows[flowIndex], updateTimestamp),
      lastTimestamp: updateTimestamp,
      flowRate,
    };
  }
  // Delete flow case
  else {
    newFlows[flowIndex] = {
      ...newFlows[flowIndex],
      accumulatedAmount: calculateNewAccumulatedAmount(state.flows[flowIndex], updateTimestamp),
      lastTimestamp: updateTimestamp,
      isCancelled: true,
    };
  }

  return newFlows;
};

const newSuperToken = async (superTokenContract, app, settings) => {
  const [[decimals, name, symbol], underlyingTokenAddress] = await Promise.all([
    loadTokenData(superTokenContract, app),
    superTokenContract.getUnderlyingToken().toPromise(),
  ]);

  let mainnetTokenEquivalentAddress, logoURI, underlyingDecimals, underlyingName, underlyingSymbol;
  const tokenList = settings.tokenList;
  let token;

  /**
   * For test networks fetch the underlying token data directly from the contract as we're using a mainnet token list
   */
  if (isTestNetwork(settings.network)) {
    [underlyingDecimals, underlyingName, underlyingSymbol] = await loadTokenData(
      underlyingTokenAddress,
      app
    );

    const tokenSymbol = getFakeTokenSymbol(underlyingSymbol);
    token = tokenList.find(({ symbol }) => symbol === tokenSymbol);

    if (token) {
      logoURI = token.logoURI;
      mainnetTokenEquivalentAddress = token.address;
    }
  } else {
    token = tokenList.find(({ address }) => addressesEqual(address, underlyingTokenAddress));

    if (token) {
      logoURI = token.logoURI;
      underlyingDecimals = token.decimals;
      underlyingName = token.name;
      underlyingSymbol = token.symbol;
    } else {
      [underlyingDecimals, underlyingName, underlyingSymbol] = await loadTokenData(
        underlyingTokenAddress,
        app
      );
    }
  }

  return {
    decimals,
    name,
    symbol,
    underlyingToken: {
      address: underlyingTokenAddress,
      name: underlyingName,
      decimals: underlyingDecimals,
      symbol: underlyingSymbol,
    },
    logoURI,
    // Needed to display conversion rates on test networks,
    mainnetTokenEquivalentAddress,
    netFlow: 0,
    balance: 0,
  };
};
