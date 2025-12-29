// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PoolTokenV1.sol";

contract PoolTokenV2 is PoolTokenV1 {
    // New feature example
    function newFeature() external pure returns (string memory) {
        return "V2 feature working!";
    }
}