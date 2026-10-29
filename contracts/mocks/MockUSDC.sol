// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockERC20.sol";

/// @notice Mock USDC — 6 decimals on EVM chains, 18 decimals on Arc Testnet
contract MockUSDC is MockERC20 {
    constructor(uint8 decimals_) MockERC20("USD Coin", "USDC", decimals_) {}
}
