// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PoolTokenV1
 * @dev ERC20 token representing shares in the pool.
 * Users deposit USD tokens and receive pool tokens (1:1).
 * Proceeds are distributed proportionally using cumulative accumulator accounting.
 */
contract PoolTokenV1 is Initializable, ERC20Upgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    IERC20 public usdToken;

    uint256 public accProceedsPerShare; // Accumulated proceeds per share (scaled by 1e18)
    mapping(address => uint256) public userDebt; // Proceeds already accounted for per user
    uint256 private constant PRECISION = 1e18;

    address public admin;
    address public pendingAdmin;
    bool public depositsPaused;

    event ProceedsDeposited(uint256 amount, uint256 newAccProceedsPerShare);
    event ProceedsClaimed(address indexed user, uint256 amount);
    event AdminTransferInitiated(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferCompleted(address indexed previousAdmin, address indexed newAdmin);
    event DepositsPauseUpdated(bool paused);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "PoolToken: only admin");
        _;
    }

    function initialize(address _usdToken) public initializer {
        __ERC20_init("Pool Token V1", "POOL");
        __ReentrancyGuard_init();

        require(_usdToken != address(0), "PoolToken: invalid USD token address");
        usdToken = IERC20(_usdToken);
        admin = msg.sender;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
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

    function setDepositsPaused(bool paused) external onlyAdmin {
        depositsPaused = paused;
        emit DepositsPauseUpdated(paused);
    }

    /**
     * @dev Deposit USD and receive pool tokens (1:1).
     */
    function deposit(uint256 amount) external nonReentrant {
        require(!depositsPaused, "PoolToken: deposits paused");
        require(amount > 0, "PoolToken: amount must be > 0");

        usdToken.safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);

        // New tokens start with current proceeds index.
        userDebt[msg.sender] += (amount * accProceedsPerShare) / PRECISION;
    }

    /**
     * @dev Deposit proceeds to be distributed to pool token holders.
     */
    function depositProceeds(uint256 amount) external nonReentrant onlyAdmin {
        require(!depositsPaused, "PoolToken: deposits paused");
        require(amount > 0, "PoolToken: amount must be > 0");

        uint256 totalSupplyTokens = totalSupply();
        require(totalSupplyTokens > 0, "PoolToken: no pool tokens");

        usdToken.safeTransferFrom(msg.sender, address(this), amount);

        accProceedsPerShare += (amount * PRECISION) / totalSupplyTokens;
        emit ProceedsDeposited(amount, accProceedsPerShare);
    }

    function pendingProceeds(address user) public view returns (uint256) {
        uint256 totalEntitlement = (balanceOf(user) * accProceedsPerShare) / PRECISION;
        uint256 debt = userDebt[user];
        return totalEntitlement > debt ? totalEntitlement - debt : 0;
    }

    function claimProceeds() external nonReentrant {
        uint256 pendingAmount = pendingProceeds(msg.sender);
        require(pendingAmount > 0, "PoolToken: no proceeds to claim");

        userDebt[msg.sender] += pendingAmount;
        usdToken.safeTransfer(msg.sender, pendingAmount);

        emit ProceedsClaimed(msg.sender, pendingAmount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "PoolToken: amount must be > 0");
        require(balanceOf(msg.sender) >= amount, "PoolToken: insufficient balance");

        uint256 pendingAmount = pendingProceeds(msg.sender);
        if (pendingAmount > 0) {
            userDebt[msg.sender] += pendingAmount;
            usdToken.safeTransfer(msg.sender, pendingAmount);
            emit ProceedsClaimed(msg.sender, pendingAmount);
        }

        _burn(msg.sender, amount);

        uint256 debtReduction = (amount * accProceedsPerShare) / PRECISION;
        if (userDebt[msg.sender] >= debtReduction) {
            userDebt[msg.sender] -= debtReduction;
        } else {
            userDebt[msg.sender] = 0;
        }

        usdToken.safeTransfer(msg.sender, amount);
    }

    /**
     * @dev POOL is intentionally non-transferable between users to preserve debt accounting.
     */
    function _update(address from, address to, uint256 value) internal override {
        require(from == address(0) || to == address(0), "PoolToken: transfers disabled");
        super._update(from, to, value);
    }
}
