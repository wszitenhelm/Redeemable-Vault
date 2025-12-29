// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// Solidity 0.8+ has built-in overflow/underflow protection. 

import "node_modules/@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "node_modules/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "node_modules/@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title PoolToken
 * @dev ERC20 token representing shares in the pool
 * Users deposit USD tokens and receive pool tokens (1:1)
 * Proceeds are distributed proportionally using cumulative accumulator pattern
 * 
 * The protocol avoids bad debt by design.
    Pool tokens and proceeds are only minted or accounted for after successful USD transfers 
    into the contract. Withdrawals and claims revert if insufficient USD is available, 
    ensuring the system cannot enter a debt state.
 */

contract PoolTokenV1 is Initializable, ERC20Upgradeable, ReentrancyGuardUpgradeable {
    IERC20 public usdToken;
    
    uint256 public accProceedsPerShare;     // Accumulated proceeds per pool token (scaled by 1e18)
    mapping(address => uint256) public userDebt; // Tracks proceeds already accounted for per user
    uint256 private constant PRECISION = 1e18;

    address public admin;
    address public pendingAdmin;


    // Events
    event ProceedsDeposited(uint256 amount, uint256 newAccProceedsPerShare);
    event ProceedsClaimed(address indexed user, uint256 amount);
    event AdminTransferInitiated(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferCompleted(address indexed previousAdmin, address indexed newAdmin);

    function initialize(address _usdToken) public initializer {
        __ERC20_init("Pool Token V1", "POOL");
        __ReentrancyGuard_init();

        require(_usdToken != address(0), "PoolToken: invalid USD token address");
        usdToken = IERC20(_usdToken);
        admin = msg.sender;
    }

    function transferAdmin(address newAdmin) external {
        require(msg.sender == admin, "PoolToken: only admin");
        require(newAdmin != address(0), "PoolToken: invalid admin address");
        pendingAdmin = newAdmin;
        emit AdminTransferInitiated(admin, newAdmin);
    }

    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "PoolToken: not pending admin");
        address previousAdmin = admin;
        admin = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferCompleted(previousAdmin, admin);
    }

    /**
     * @dev Deposit USD and receive pool tokens (1:1)
     * @param amount USD tokens to deposit
     * Updates userDebt to prevent retroactive proceeds claims
     */
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "PoolToken: amount must be > 0");
        
        // Transfer USD tokens from user
        require(
            usdToken.transferFrom(msg.sender, address(this), amount),
            "PoolToken: USD transfer failed"
        );

        // Mint pool tokens 1:1
        _mint(msg.sender, amount);

        // Increment userDebt: new tokens start with current index
        userDebt[msg.sender] += (amount * accProceedsPerShare) / PRECISION;
    }

    /**
     * @dev Deposit proceeds (USD) to be distributed to pool token holders
     * @param amount Amount of USD to deposit
     * Caller must have approved USD transfer to this contract
     */
    function depositProceeds(uint256 amount) external nonReentrant {
        require(msg.sender == admin, "PoolToken: only admin can deposit proceeds");
        require(amount > 0, "PoolToken: amount must be > 0");
        uint256 totalSupplyTokens = totalSupply();
        require(totalSupplyTokens > 0, "PoolToken: no pool tokens");

        // Transfer USD from caller (newly minted proceeds)
        require(
            usdToken.transferFrom(msg.sender, address(this), amount),
            "PoolToken: proceeds transfer failed"
        );

        // Update global accumulator
        accProceedsPerShare += (amount * PRECISION) / totalSupplyTokens;

        emit ProceedsDeposited(amount, accProceedsPerShare);
    }

    /**
     * @dev Check how much proceeds a user can claim
     * @param user Address to check
     * @return Amount of USD claimable
     */
    function pendingProceeds(address user) public view returns (uint256) {
        uint256 totalEntitlement = (balanceOf(user) * accProceedsPerShare) / PRECISION;
        uint256 debt = userDebt[user];
        // user can't claim twice for the same proceeds
        return totalEntitlement > debt ? totalEntitlement - debt : 0;
    }

    function claimProceeds() external nonReentrant {
        uint256 pendingAmount = pendingProceeds(msg.sender);
        require(pendingAmount > 0, "PoolToken: no proceeds to claim");

        // EFFECTS: Update state first
        userDebt[msg.sender] += pendingAmount;

        // INTERACTIONS: Transfer USD tokens
        require(
            usdToken.transfer(msg.sender, pendingAmount),
            "PoolToken: proceeds transfer failed"
        );

        emit ProceedsClaimed(msg.sender, pendingAmount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "PoolToken: amount must be > 0");
        require(balanceOf(msg.sender) >= amount, "PoolToken: insufficient balance");

        // Claim pending proceeds first (safe with reentrancy guard)
        uint256 pendingAmount = pendingProceeds(msg.sender);
        if (pendingAmount > 0) {
            userDebt[msg.sender] += pendingAmount;
            require(
                usdToken.transfer(msg.sender, pendingAmount),
                "PoolToken: proceeds transfer failed"
            );
            emit ProceedsClaimed(msg.sender, pendingAmount);
        }

        // EFFECTS: Burn pool tokens and update debt
        _burn(msg.sender, amount);
        uint256 debtReduction = (amount * accProceedsPerShare) / PRECISION;
        if (userDebt[msg.sender] >= debtReduction) {
            userDebt[msg.sender] -= debtReduction;
        } else {
            userDebt[msg.sender] = 0;
        }

        // INTERACTIONS: Transfer USD tokens
        require(
            usdToken.transfer(msg.sender, amount),
            "PoolToken: USD transfer failed"
        );
    }
}