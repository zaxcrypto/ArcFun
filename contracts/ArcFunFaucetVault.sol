// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ArcFunFaucetVault
 * @notice Community Faucet Pool vault. Accepts permanent, non-refundable
 *         donations from the community to sustain ArcFun cross-chain faucet
 *         operations.
 * @dev    Deliberately stripped of LP mechanics — no shares, no yields,
 *         no withdrawal rights for donors. Donations are final.
 *
 * Roles:
 *   DEFAULT_ADMIN_ROLE  — Grant/revoke other roles, emergency sweep.
 *   WITHDRAWER_ROLE     — Move funds to faucet distributor wallets.
 *   PAUSER_ROLE         — Halt/resume incoming donations.
 *   ASSET_MANAGER_ROLE  — Enable/disable specific ERC20 tokens for donation.
 */
contract ArcFunFaucetVault is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Roles ────────────────────────────────────────────────────────────────
    bytes32 public constant WITHDRAWER_ROLE     = keccak256("WITHDRAWER_ROLE");
    bytes32 public constant PAUSER_ROLE         = keccak256("PAUSER_ROLE");
    bytes32 public constant ASSET_MANAGER_ROLE  = keccak256("ASSET_MANAGER_ROLE");

    // ── State ─────────────────────────────────────────────────────────────────
    /// @notice Whether a given ERC20 token is accepted for donation.
    mapping(address => bool) public supportedAssets;

    /// @notice Cumulative amount donated per token address.
    mapping(address => uint256) public totalDonatedPerAsset;

    /// @notice Cumulative amount donated per user per token.
    mapping(address => mapping(address => uint256)) public donorTotals;

    /// @notice Total number of unique donation transactions processed.
    uint256 public totalDonationCount;

    // ── Events ────────────────────────────────────────────────────────────────
    event DonationReceived(
        address indexed donor,
        address indexed token,   // address(0) for native
        uint256 amount,
        uint256 timestamp
    );
    event AssetToggled(address indexed token, bool enabled);
    event FundsWithdrawn(address indexed token, uint256 amount, address indexed to);
    event NativeDonationReceived(address indexed donor, uint256 amount, uint256 timestamp);

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(WITHDRAWER_ROLE, admin);
        _grantRole(ASSET_MANAGER_ROLE, admin);
    }

    // ── Donation Functions ────────────────────────────────────────────────────

    /**
     * @notice Donate an ERC20 token to the community faucet pool.
     * @param token  ERC20 token address to donate.
     * @param amount Amount in token's native decimals.
     * @dev   Caller must have approved this contract first.
     *        Donations are permanent and non-refundable.
     */
    function donate(address token, uint256 amount)
        external
        whenNotPaused
        nonReentrant
    {
        require(supportedAssets[token], "Asset not supported");
        require(amount > 0, "Amount must be > 0");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        totalDonatedPerAsset[token] += amount;
        donorTotals[msg.sender][token] += amount;
        totalDonationCount++;

        emit DonationReceived(msg.sender, token, amount, block.timestamp);
    }

    /**
     * @notice Donate native gas token (ETH, MON, S, etc.) to the pool.
     * @dev    Native donations always accepted regardless of asset whitelist
     *         as long as the contract is not paused.
     */
    function donateNative()
        external
        payable
        whenNotPaused
        nonReentrant
    {
        require(msg.value > 0, "Amount must be > 0");

        totalDonatedPerAsset[address(0)] += msg.value;
        donorTotals[msg.sender][address(0)] += msg.value;
        totalDonationCount++;

        emit NativeDonationReceived(msg.sender, msg.value, block.timestamp);
        emit DonationReceived(msg.sender, address(0), msg.value, block.timestamp);
    }

    // ── Admin Functions ───────────────────────────────────────────────────────

    /**
     * @notice Withdraw ERC20 tokens to a faucet distributor wallet.
     * @param token  ERC20 token address (or address(0) for native).
     * @param amount Amount to withdraw.
     * @param to     Destination address (faucet distributor).
     */
    function withdraw(address token, uint256 amount, address to)
        external
        onlyRole(WITHDRAWER_ROLE)
        nonReentrant
    {
        require(to != address(0), "Invalid destination");
        require(amount > 0, "Amount must be > 0");

        if (token == address(0)) {
            require(address(this).balance >= amount, "Insufficient native balance");
            (bool ok,) = to.call{value: amount}("");
            require(ok, "Native transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }

        emit FundsWithdrawn(token, amount, to);
    }

    /**
     * @notice Enable or disable an ERC20 asset for donation.
     */
    function toggleAsset(address token, bool enabled)
        external
        onlyRole(ASSET_MANAGER_ROLE)
    {
        supportedAssets[token] = enabled;
        emit AssetToggled(token, enabled);
    }

    /**
     * @notice Pause all incoming donations.
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Resume incoming donations.
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    /**
     * @notice Get the vault's current balance for a given token.
     * @param token ERC20 address or address(0) for native.
     */
    function vaultBalance(address token) external view returns (uint256) {
        if (token == address(0)) return address(this).balance;
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice Get a donor's total contribution for a specific token.
     */
    function donorContribution(address donor, address token) external view returns (uint256) {
        return donorTotals[donor][token];
    }

    // ── Safety ────────────────────────────────────────────────────────────────
    receive() external payable {
        // Accepts native donations via receive()
        totalDonatedPerAsset[address(0)] += msg.value;
        donorTotals[msg.sender][address(0)] += msg.value;
        totalDonationCount++;
        emit DonationReceived(msg.sender, address(0), msg.value, block.timestamp);
    }
}
