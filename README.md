# Redeemable-Vault

A Hardhat project implementing a redeemable vault with upgradeable pool shares and proportional proceeds distribution.

## Overview

The system has two contracts:

1. **USDToken**
- ERC20 underlying token used for deposits and proceeds.
- In this repo it is intentionally permissive for testing: any user can mint.

2. **PoolTokenV1** (UUPS-style proxy deployment via OpenZeppelin upgrades plugin)
- Users deposit USD and receive POOL shares 1:1.
- Admin can deposit proceeds, which are distributed pro-rata via cumulative accounting.
- Users can claim proceeds or receive them automatically on withdraw.

## Core Mechanics

1. **Deposit (`deposit`)**
- User transfers USD into the pool.
- Contract mints POOL 1:1.
- User debt is updated so new deposits cannot claim historical proceeds.

2. **Deposit Proceeds (`depositProceeds`)**
- Admin-only.
- Proceeds are transferred in and `accProceedsPerShare` is updated.
- Reverts if total supply is zero.

3. **Claim Proceeds (`claimProceeds`)**
- User claims currently pending proceeds.
- Debt is updated before transfer (checks-effects-interactions).

4. **Withdraw (`withdraw`)**
- Settles pending proceeds first.
- Burns POOL.
- Returns USD principal 1:1.

## Security and Hardening

Implemented protections:

- **Reentrancy protection** on state-mutating flows via `ReentrancyGuardUpgradeable`.
- **Safe ERC20 interactions** via `SafeERC20` (`safeTransfer`, `safeTransferFrom`).
- **Implementation initializer lock** via constructor `_disableInitializers()`.
- **Admin-only privileged actions** (`depositProceeds`, `setDepositsPaused`, admin transfer).
- **Emergency inflow pause**: admin can pause `deposit` and `depositProceeds` while still allowing withdrawals.
- **Non-transferable POOL shares**: user-to-user `transfer/transferFrom` is disabled to preserve proceeds accounting correctness.
- **Late depositor protection** through per-user debt snapshots.
- **No-bad-debt behavior** by reverting on failed transfers and settling claims before principal withdrawal.

## Important Design Decision

POOL is intentionally **non-transferable** in this version. This avoids debt/accounting desynchronization that would otherwise occur with ERC20 transfers under a cumulative proceeds model.

If transferability is required later, reward debt migration/settlement must be implemented in token transfer hooks with additional invariant testing.

## Upgradeability

- Current implementation: `PoolTokenV1`
- Example upgrade target: `PoolTokenV2`
- Proxy deployment and upgrades are managed through `@openzeppelin/hardhat-upgrades`.
- Storage is preserved across upgrades when layout compatibility is maintained.

## Project Setup

```bash
npm install
```

## Commands

- `npx hardhat compile`
- `npx hardhat test`
- `npx hardhat node`
- `npx hardhat run scripts/deployV1.js --network localhost`
- `npx hardhat run scripts/upgradeV2.js --network localhost`

## Testing Coverage

The suite covers:

- Metadata and 1:1 mint/redeem behavior
- Proceeds distribution correctness
- Late depositor protection
- Double-claim prevention
- Reentrancy resistance
- Zero-supply proceeds edge case
- Dust/rounding behavior
- Admin transfer controls
- Upgrade state preservation
- Pause controls
- Transfer restriction enforcement
- Implementation initializer lock

## Assumptions and Limitations

- USDToken in this repo is a mock and not production-safe.
- Integer division creates rounding dust that remains in the pool.
- Transaction ordering is per-mined-order; same-block intent fairness is not guaranteed.
- Hardhat currently warns about local Node.js version compatibility in this environment.
