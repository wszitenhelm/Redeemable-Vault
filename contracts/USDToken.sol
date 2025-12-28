// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title USDToken
 * @dev ERC20 token representing the underlying USD asset
 * @notice Any user can mint any amount of tokens
 */
contract USDToken is ERC20 {
    /**
     * @dev Constructor that sets the token name and symbol
     */
    constructor() ERC20("USD Token", "USD") {}

    /**
     * @dev Mints tokens to the specified address
     * @param to The address to mint tokens to
     * @param amount The amount of tokens to mint
     * @notice This function can be called by any user to mint any amount
     */
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}

