// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockERC20.sol";

/// @notice Mock EURC — 6 decimals on all chains
contract MockEURC is MockERC20 {
    constructor() MockERC20("Euro Coin", "EURC", 6) {}
}
