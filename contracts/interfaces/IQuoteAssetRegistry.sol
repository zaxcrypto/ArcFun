// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IQuoteAssetRegistry
 * @notice Interface for validating approved quote assets (such as Dinari dShares) in ArcFun
 */
interface IQuoteAssetRegistry {
    /**
     * @notice Checks if a quote asset is approved for pairing on ArcFun bonding curves
     * @param token Address of the ERC-20 quote asset
     * @return isApproved True if token is an approved quote asset
     */
    function isQuoteAssetApproved(address token) external view returns (bool isApproved);
}
