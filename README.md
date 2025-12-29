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

- Proceeds are distributed using a cumulative `accProceedsPerShare` model to ensure gas-efficient solution.
- Late depositors do not receive past proceeds.
- Proceeds are claimable independently or automatically on withdrawal.
- USD token is assumed to be a standard ERC-20 with no transfer fees or callbacks.
- Reentrancy protection is enforced using `ReentrancyGuard`.
- The protocol is designed to fail safely (revert) rather than create bad debt.

## Security Considerations

- Reentrancy protected via checks-effects-interactions and `nonReentrant`.
- Double-claim prevention via per-user debt accounting.
- Withdrawals always ensure sufficient USD balance exists.

## Testing

The test suite demonstrates resistance to:
- Reentrancy attacks
- Late depositor exploits
- Double claiming
- Insolvency / bad debt scenarios


## Assumptions

- Accounting is per-transaction sequential. Multiple deposits or withdrawals in the same block are processed in order.
- Proceeds cannot be deposited when no pool tokens exist.
- Proceeds are distributed based on cumulative `accProceedsPerShare` using 1e18 scaling. Small rounding dust remains in the pool.
Integer Division & Dust: The contract uses the standard "Floor" rounding inherent in Solidity. When depositProceeds is called, any remainder (dust) resulting from the division of rewards by the total supply stays within the contract. This ensures the vault remains over-collateralized and prevents execution failure due to rounding errors.
- Only a trusted role (admin/owner) can deposit proceeds.
- Front-running / same-block manipulation is mitigated: new deposits do not retroactively receive past proceeds.
- Upgradeability is planned as a future improvement; current balances and accounting are not migrated.

### Transaction Ordering Assumption

Proceeds are distributed based on the pool token balances at the exact moment
`depositProceeds()` is executed.

Due to Ethereum’s block construction and MEV mechanics, transactions within the
same block may be reordered by validators. As a result, a user who submits a
deposit transaction intended to precede a proceeds deposit may not receive those
proceeds if the proceeds transaction is mined first.

This is an inherent limitation of per-transaction accounting on Ethereum.
The protocol guarantees correctness
per transaction, not intent-based fairness across same-block operations.

## Known Limitations & Assumptions

### Token Transfers Between Users
**Assumption:** The current implementation assumes that `PoolTokens` are not transferred between users via the standard ERC-20 `transfer` or `transferFrom` functions.

**Technical Detail:** The reward accounting logic (cumulative accumulator) is currently triggered only during `deposit()`, `withdraw()`, and `claimProceeds()`. 
* If a user transfers POOL tokens to another address, the `userDebt` (accounting for proceeds already claimed) will not automatically move with the tokens. 
* This could lead to a scenario where the recipient is able to claim rewards that the sender was already entitled to, or the sender's debt remains inaccurately high.

**Production Recommendation:**
To make this protocol "transfer-ready," the `_update` (OpenZeppelin v5.x) or `_beforeTokenTransfer` (OpenZeppelin v4.x) internal functions should be overridden to settle pending proceeds for both the `from` and `to` addresses before any balance change occurs.