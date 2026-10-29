// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ArcFunSwapVault
 * @dev Secure storage for ArcFun Swap liquidity.
 * Separates liquidity storage from swap execution logic.
 */
contract ArcFunSwapVault is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant SWAP_ROUTER_ROLE = keccak256("SWAP_ROUTER_ROLE");

    event LiquidityDeposited(address indexed admin, address indexed token, uint256 amount);
    event LiquidityWithdrawn(address indexed admin, address indexed token, uint256 amount);
    event FundsReleased(address indexed router, address indexed user, address indexed token, uint256 amount);

    constructor(address adminMultisig) {
        _grantRole(DEFAULT_ADMIN_ROLE, adminMultisig);
    }

    /**
     * @dev Allows admins to deposit liquidity into the vault.
     */
    function depositLiquidity(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit LiquidityDeposited(msg.sender, token, amount);
    }

    /**
     * @dev Allows admins to withdraw liquidity from the vault.
     */
    function withdrawLiquidity(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(token).safeTransfer(msg.sender, amount);
        emit LiquidityWithdrawn(msg.sender, token, amount);
    }

    /**
     * @dev Emergency recovery function for admins to drain all balance of a specific token.
     */
    function emergencyWithdraw(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(msg.sender, balance);
        emit LiquidityWithdrawn(msg.sender, token, balance);
    }

    /**
     * @dev Called by the ArcFunSwap router to release funds to a user during a swap.
     */
    function releaseFunds(address token, address user, uint256 amount) external onlyRole(SWAP_ROUTER_ROLE) {
        IERC20(token).safeTransfer(user, amount);
        emit FundsReleased(msg.sender, user, token, amount);
    }
}
