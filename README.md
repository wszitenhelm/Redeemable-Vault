# Redeemable-Vault

A smart contract application that allows users to deposit tokens and later receive dividend payouts (proceeds) proportional to their initial token deposits. The business logic that governs how these proceeds are generated is out of scope for this exercise; the focus is mainly on token deposits and proceeds distribution.

## Overview

The application consists of two main token contracts:

1. **USD Token** - Represents the underlying asset
2. **Pool Token** - Represents shares in the pool where USD tokens can be deposited

## Contract Requirements

### USD Token Contract

The USD token is an ERC20 token representing the underlying asset.

#### Functionality

- **Minting**: Any user should be able to mint any amount of USD tokens

### Pool Token Contract

The pool token is an ERC20 token contract that allows USD tokens to be deposited and withdrawn in exchange for pool tokens.

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

## Bonus Features

- Demonstrate knowledge of proxied contract upgradability using diamonds or other methods
- Add comprehensive tests to the protocol and demonstrate that it is not prone to attacks or bad debt

## Additional Instructions

- Please send an archive containing your solution via email once your work is complete
- Do not hesitate to ask questions by emailing directly

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
