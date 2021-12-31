import { useAppState } from '@aragon/api-react';
import { Field, formatTokenAmount, IdentityBadge } from '@aragon/ui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAddress } from 'web3-utils';
import { addressPattern, addressesEqual, toDecimals, fromDecimals, MONTH } from '../../../helpers';
import useDebounce from '../../../hooks/useDebounce';
import BaseSidePanel from '../BaseSidePanel';
import FlowRateField from './FlowRateField';
import LocalIdentitiesAutoComplete from '../../LocalIdentitiesAutoComplete';
import SubmitButton from '../SubmitButton';
import TokenSelector, { INITIAL_SELECTED_TOKEN } from '../../TokenSelector';
import InfoBox from '../InfoBox';
import { useAppLogic } from '../../../app-logic';
import styled from 'styled-components';

const DEBOUNCE_TIME = 500;

const isFlowRateTooBigError = errorMessage =>
  errorMessage.includes('revert CFA: flow rate too big');

const validateFields = (recipient, flowRate, agentAddress) => {
  if (!isAddress(recipient)) {
    return 'Recipient must be a valid Ethereum address.';
  } else if (addressesEqual(recipient, agentAddress)) {
    return "You can't create a flow to the app's agent.";
  } else if (Number(flowRate) <= 0) {
    return "Flow rate provided can't be negative nor zero.";
  }
};

const findSuperTokenByAddress = (address, superTokens) => {
  const index = superTokens.findIndex(superToken => addressesEqual(superToken.address, address));
  const superToken = superTokens[index];

  return {
    index,
    address: superToken.address,
    data: { decimals: superToken.decimals, name: superToken.name, symbol: superToken.symbol },
  };
};

const toMonthlyRate = flowRate => {
  return flowRate * MONTH;
};

const calculateNewFlowRate = (existingFlow, flowRate) => {
  return existingFlow
    ? (Number(fromDecimals(existingFlow.flowRate)) + Number(flowRate)).toString()
    : flowRate;
};

export default React.memo(({ panelState, flows, superTokens, onUpdateFlow }) => {
  const { agentAddress } = useAppState();
  const { cfa } = useAppLogic();
  const [recipient, setRecipient] = useState('');
  const [selectedToken, setSelectedToken] = useState(INITIAL_SELECTED_TOKEN);
  const [flowRate, setFlowRate] = useState('');
  const [requiredDeposit, setRequiredDeposit] = useState();
  const [errorMessage, setErrorMessage] = useState();
  const debouncedFlowRate = useDebounce(flowRate, DEBOUNCE_TIME);
  const recipientInputRef = useRef();
  const { updateSuperTokenAddress, updateRecipient } = panelState.params || {};
  const isFlowUpdateOperation = Boolean(updateSuperTokenAddress && updateRecipient);
  const disableSubmit = Boolean(
    errorMessage ||
      (!recipient && !updateRecipient) ||
      (!selectedToken.address && !updateSuperTokenAddress) ||
      !flowRate
  );
  const displayError = errorMessage && errorMessage.length;
  const existingFlow = useMemo(() => {
    if (isFlowUpdateOperation || !isAddress(recipient) || !isAddress(selectedToken.address)) {
      return null;
    }

    const flowIndex = flows.findIndex(
      ({ isCancelled, isIncoming, entity, superTokenAddress }) =>
        !isCancelled &&
        !isIncoming &&
        addressesEqual(entity, recipient) &&
        addressesEqual(superTokenAddress, selectedToken.address)
    );

    return flows[flowIndex];
  }, [flows, isFlowUpdateOperation, recipient, selectedToken.address]);
  const displayFlowExists = existingFlow && Number(flowRate) > 0;

  const clear = () => {
    setRecipient('');
    setRequiredDeposit();
    setSelectedToken(INITIAL_SELECTED_TOKEN);
    setFlowRate('');
    setErrorMessage();
  };

  const handleTokenChange = useCallback(value => {
    setSelectedToken(value);
    setErrorMessage('');
  }, []);

  const handleRecipientChange = useCallback(value => {
    setRecipient(value);
    setErrorMessage('');
  }, []);

  const handleFlowRateChange = useCallback(value => {
    setFlowRate(value);
    setErrorMessage('');
  }, []);

  const handleSubmit = async event => {
    event.preventDefault();

    const error = validateFields(
      isFlowUpdateOperation ? updateRecipient : recipient,
      flowRate,
      agentAddress
    );

    if (error && error.length) {
      setErrorMessage(error);
      return;
    }

    const newFlowRate = existingFlow
      ? calculateNewFlowRate(existingFlow, flowRate).toString()
      : flowRate;
    const adjustedFlowRate = toDecimals(newFlowRate, selectedToken.decimals);

    if (isFlowUpdateOperation) {
      panelState.requestTransaction(onUpdateFlow, [
        updateSuperTokenAddress,
        updateRecipient,
        adjustedFlowRate,
      ]);
    } else {
      panelState.requestTransaction(onUpdateFlow, [
        selectedToken.address,
        recipient,
        adjustedFlowRate,
      ]);
    }
  };

  // handle reset when opening
  useEffect(() => {
    if (panelState.didOpen && !isFlowUpdateOperation) {
      // reset to default values
      // Focus the right input after some time to avoid the panel transition to
      // be skipped by the browser.
      recipientInputRef && setTimeout(() => recipientInputRef.current.focus(), 100);
    }
    return () => {
      clear();
    };
  }, [panelState.didOpen, isFlowUpdateOperation]);

  useEffect(() => {
    const fetchDepositRequeriment = async (superTokenAddress, flowRate) => {
      try {
        const adjustedFlowRate = toDecimals(flowRate);
        const flowDeposit = await cfa
          .getDepositRequiredForFlowRate(superTokenAddress, adjustedFlowRate)
          .toPromise();

        setRequiredDeposit(flowDeposit);
      } catch (err) {
        console.error(err);
        if (isFlowRateTooBigError(err.message)) {
          setErrorMessage('The flow rate provided is too big.');
        }
      }
    };

    if (!selectedToken.address || !debouncedFlowRate || Number(debouncedFlowRate) <= 0) {
      return;
    }

    fetchDepositRequeriment(selectedToken.address, debouncedFlowRate);
  }, [cfa, debouncedFlowRate, selectedToken.address]);

  return (
    <BaseSidePanel
      title={isFlowUpdateOperation || displayFlowExists ? 'Update Flow' : 'Create Flow'}
      panelState={panelState}
    >
      <form onSubmit={handleSubmit}>
        <Field
          label="Recipient (must be a valid Ethereum address)"
          css={`
            height: 60px;
            ${isFlowUpdateOperation && 'pointer-events: none;'}
          `}
        >
          <LocalIdentitiesAutoComplete
            ref={recipientInputRef}
            onChange={handleRecipientChange}
            pattern={
              // Allow spaces to be trimmable
              ` *${addressPattern} *`
            }
            value={isFlowUpdateOperation ? updateRecipient : recipient}
            required
            wide
          />
        </Field>
        <TokenSelector
          tokens={superTokens}
          selectedToken={
            isFlowUpdateOperation
              ? findSuperTokenByAddress(updateSuperTokenAddress, superTokens)
              : selectedToken
          }
          disabled={isFlowUpdateOperation}
          onChange={handleTokenChange}
        />
        <FlowRateField onChange={handleFlowRateChange} />
        <SubmitButton
          panelState={panelState}
          label={isFlowUpdateOperation || !!displayFlowExists ? 'Update' : 'Create'}
          disabled={disableSubmit}
        />
      </form>
      {displayError && <InfoBox mode="error">{errorMessage}</InfoBox>}
      {displayFlowExists && (
        <ExistingFlowInfo flow={existingFlow} selectedToken={selectedToken} flowRate={flowRate} />
      )}
      {requiredDeposit && (
        <RequiredDepositInfo requiredDeposit={requiredDeposit} selectedToken={selectedToken} />
      )}
    </BaseSidePanel>
  );
});

const ExistingFlowInfo = ({ flow, selectedToken, flowRate = '0' }) => {
  const currentMonthlyFlowRate = toMonthlyRate(fromDecimals(flow.flowRate)).toFixed(2);
  const newMonthlyFlowRate = toMonthlyRate(calculateNewFlowRate(flow, flowRate)).toFixed(2);
  const tokenSymbol = selectedToken.data.symbol;

  return (
    <InfoBox>
      There is already a flow of{' '}
      <BoldUnderline>
        {currentMonthlyFlowRate} {tokenSymbol}/month
      </BoldUnderline>{' '}
      open to <IdentityBadge entity={flow.entity} connectedAccount compact />. We will add this
      amount to the flow for a total of{' '}
      <BoldUnderline>
        {newMonthlyFlowRate} {tokenSymbol}/month.
      </BoldUnderline>
    </InfoBox>
  );
};

const RequiredDepositInfo = ({ requiredDeposit, selectedToken }) => (
  <InfoBox mode="warning">
    Starting this flow will take a security Deposit of{' '}
    <BoldUnderline>
      {formatTokenAmount(requiredDeposit, selectedToken.data.decimals, { digits: 6 })}{' '}
      {selectedToken.data.symbol}
    </BoldUnderline>{' '}
    from the app agent's balance. The Deposit will be refunded in full when the flow gets close or
    lost if the {selectedToken.data.symbol} balance hits zero with the flow still open.
  </InfoBox>
);

const BoldUnderline = styled.span`
  font-weight: bold;
  text-decoration: underline;
`;
