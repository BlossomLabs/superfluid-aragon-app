import { useNetwork } from '@aragon/api-react';
import { useMemo } from 'react';
import { isAddress } from 'web3-utils';
import {
  DEFAULT_CURRENCY,
  getAvailableSuperTokens,
  getConvertedAmount,
  getConvertRateToken,
  isTestNetwork,
} from '../helpers';
import useConvertRates from './useConvertRates';

const useSuperTokenItems = superTokens => {
  const network = useNetwork();
  const isTestNet = network && isTestNetwork(network);
  const tokenAddresses = superTokens
    .map(superToken => getConvertRateToken(superToken, isTestNet))
    // Filter out Super Tokens that don't have a mainnet equivalent token
    .filter(address => isAddress(address));

  const convertRates = useConvertRates(
    tokenAddresses,
    [DEFAULT_CURRENCY],
    network ? network.id : null
  );

  const balanceItems = useMemo(() => {
    return getAvailableSuperTokens(superTokens).map(superToken => {
      const {
        address,
        balance: amount,
        decimals,
        depletionDate,
        lastUpdateDate,
        logoURI,
        name,
        inflowRate,
        outflowRate,
        netFlow,
        symbol,
      } = superToken;

      const convertRateToken = convertRates[getConvertRateToken(superToken, isTestNet)];
      const conversionRate = convertRateToken ? convertRateToken[DEFAULT_CURRENCY] : null;
      let convertedAmount, convertedNetFlow;

      if (conversionRate) {
        convertedAmount = getConvertedAmount(amount, conversionRate);
        convertedNetFlow = getConvertedAmount(netFlow, conversionRate);
      }

      return {
        address,
        amount,
        convertedAmount,
        decimals,
        depletionDate,
        lastUpdateDate,
        logoURI,
        name,
        inflowRate,
        outflowRate,
        netFlow,
        convertedNetFlow,
        symbol,
      };
    });
  }, [convertRates, superTokens, isTestNet]);
  return balanceItems;
};

export default useSuperTokenItems;
