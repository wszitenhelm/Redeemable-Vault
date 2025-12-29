# Redeemable-Vault

A smart contract application that allows users to deposit tokens and later receive dividend payouts (proceeds) proportional to their initial token deposits. 

## Overview

The application consists of two main token contracts:

1. **USD Token** - An ERC20 token representing the underlying asset.
                 - Any user should be able to mint any amount of USD tokens

2. **Pool Token** - An ERC20 token contract that allows USD tokens to be deposited and withdrawn 
                    in  exchange for pool tokens.

#### Functionality

1. **Deposits**
   - Depositing USD tokens grants the user pool tokens (1:1 conversion)
   - The contract holds onto the USD tokens
   - This method should be executable by any user

2. **Deposit Proceeds**
   - Proceeds are USD tokens that should be distributed to pool token holders
   - Proceeds should be newly minted tokens from the USD token smart contract

3. **Proceeds Withdrawal/Distribution**
   - A mechanism for users to withdraw proceeds, or for the contract to distribute proceeds to users
   - Proceeds should be distributed based on each user's relative share of the total supply of pool tokens at the time the proceeds were deposited

4. **Withdrawals**
   - Users should be able to convert their pool tokens back to USD tokens (1:1 conversion)
   - Users shouldn't have any outstanding proceed withdrawals after withdrawing (if withdrawals were the chosen method)


## Project Setup

This project uses Hardhat for development, testing, and deployment.

### Installation

```bash
npm install
```

### Available Commands

- `npm run compile` - Compile Solidity contracts
- `npm test` - Run tests
- `npm run node` - Start a local Hardhat node
- `npm run deploy` - Deploy contracts


## Design Choices & Assumptions

- Proceeds are distributed using a cumulative `accProceedsPerShare` model.
- Late depositors do not receive past proceeds.
- Proceeds are claimable independently or automatically on withdrawal.
- USD token is assumed to be a standard ERC-20 with no transfer fees or callbacks.
- Reentrancy protection is enforced using `ReentrancyGuard`.
- The protocol is designed to fail safely (revert) rather than create bad debt.

## Security Considerations

- Reentrancy protected via checks-effects-interactions and `nonReentrant`.
- Double-claim prevention via per-user debt accounting.
- Proceeds cannot be deposited when total supply is zero.
- Withdrawals always ensure sufficient USD balance exists.

## Testing

The test suite demonstrates resistance to:
- Reentrancy attacks
- Late depositor exploits
- Double claiming
- Insolvency / bad debt scenarios