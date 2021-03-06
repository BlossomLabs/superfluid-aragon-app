import { useEffect, useState, useRef } from 'react';
import { getConvertRatesUrl } from '../helpers';

const CONVERT_API_RETRY_DELAY = 2 * 1000;
const CONVERT_API_RETRY_DELAY_MAX = 60 * 1000;

const useConvertRates = (tokenAddresses, currencies, chainId) => {
  const [rates, setRates] = useState({});
  const retryDelay = useRef(CONVERT_API_RETRY_DELAY);

  const tokenAddressesQueryValues = tokenAddresses ? tokenAddresses.join(',') : null;
  const currenciesQueryValues = currencies.join(',');

  useEffect(() => {
    let cancelled = false;
    let retryTimer = null;

    const update = async () => {
      if (!tokenAddressesQueryValues || !currenciesQueryValues || !chainId) {
        setRates({});
        return;
      }

      try {
        const response = await fetch(
          getConvertRatesUrl(tokenAddressesQueryValues, currenciesQueryValues, chainId)
        );
        const rates = await response.json();

        if (!cancelled) {
          // Set all convert rate tokens to lower case
          const normalizedRates = Object.keys(rates).reduce((newRates, key) => {
            newRates[key.toLowerCase()] = rates[key];
            return newRates;
          }, {});

          setRates(normalizedRates);
          retryDelay.current = CONVERT_API_RETRY_DELAY;
        }
      } catch (err) {
        console.error(err);
        // The !cancelled check is needed in case:
        //  1. The fetch() request is ongoing.
        //  2. The component gets unmounted.
        //  3. An error gets thrown.
        //
        //  Assuming the fetch() request keeps throwing, it would create new
        //  requests even though the useEffect() got cancelled.
        if (!cancelled) {
          // Add more delay after every failed attempt
          retryDelay.current = Math.min(CONVERT_API_RETRY_DELAY_MAX, retryDelay.current * 1.2);
          retryTimer = setTimeout(update, retryDelay.current);
        }
      }
    };

    update();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      retryDelay.current = CONVERT_API_RETRY_DELAY;
    };
  }, [tokenAddressesQueryValues, currenciesQueryValues, chainId]);

  return rates;
};

export default useConvertRates;
