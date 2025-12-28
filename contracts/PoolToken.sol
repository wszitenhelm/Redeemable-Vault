// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PoolToken
 * @dev ERC20 token representing shares in the pool
 * Users deposit USD tokens and receive pool tokens (1:1)
 * Proceeds are distributed proportionally using cumulative accumulator pattern
 */
contract PoolToken is ERC20, ReentrancyGuard {
    IERC20 public immutable usdToken;       // Underlying USD token
    
    uint256 public accProceedsPerShare;     // Accumulated proceeds per pool token (scaled by 1e18)
    mapping(address => uint256) public userDebt; // Tracks proceeds already accounted for per user
    uint256 private constant PRECISION = 1e18;

    // Events
    event ProceedsDeposited(uint256 amount, uint256 newAccProceedsPerShare);
    event ProceedsClaimed(address indexed user, uint256 amount);

    constructor(address _usdToken) ERC20("Pool Token", "POOL") {
        require(_usdToken != address(0), "PoolToken: invalid USD token address");
        usdToken = IERC20(_usdToken);
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
        return totalEntitlement > debt ? totalEntitlement - debt : 0;
    }

    /**
     * @dev Claim all pending proceeds
     */
    function claimProceeds() public nonReentrant {
        uint256 pending = pendingProceeds(msg.sender);
        require(pending > 0, "PoolToken: no proceeds to claim");

        // Update debt and transfer
        userDebt[msg.sender] += pending;
        require(usdToken.transfer(msg.sender, pending), "PoolToken: transfer failed");

        emit ProceedsClaimed(msg.sender, pending);
    }

    /**
     * @dev Withdraw pool tokens and redeem USD (1:1)
     * Claims pending proceeds first
     * @param amount Pool tokens to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "PoolToken: amount must be > 0");
        require(balanceOf(msg.sender) >= amount, "PoolToken: insufficient balance");

        // Claim any pending proceeds first
        uint256 pending = pendingProceeds(msg.sender);
        if (pending > 0) {
            userDebt[msg.sender] += pending;
            require(usdToken.transfer(msg.sender, pending), "PoolToken: proceeds transfer failed");
            emit ProceedsClaimed(msg.sender, pending);
        }

        // Burn pool tokens
        _burn(msg.sender, amount);

        // Reduce userDebt proportionally to withdrawn tokens
        uint256 debtReduction = (amount * accProceedsPerShare) / PRECISION;
        if (userDebt[msg.sender] >= debtReduction) {
            userDebt[msg.sender] -= debtReduction;
        } else {
            userDebt[msg.sender] = 0;
        }

        // Transfer USD back (1:1)
        require(usdToken.transfer(msg.sender, amount), "PoolToken: USD transfer failed");
    }
}