// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IPoolToken {
    function claimProceeds() external;
}

contract MaliciousUSD is ERC20 {
    IPoolToken public pool;
    bool public attack;

    constructor() ERC20("Malicious USD", "mUSD") {}

    function setPool(address _pool) external {
        pool = IPoolToken(_pool);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function enableAttack() external {
        attack = true;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        bool success = super.transfer(to, amount);

        if (attack) {
            pool.claimProceeds(); // reentrancy attempt
        }

        return success;
    }
}