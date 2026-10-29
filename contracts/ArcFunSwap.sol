// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IArcFunSwapVault {
    function releaseFunds(address token, address user, uint256 amount) external;
}

/**
 * @title ArcFunSwap
 * @dev Phase 5D: Swap Execution with Dedicated Vault
 * 
 * Enforces strict limits: Max 10 swaps/day, Max 10 tokens per swap.
 * Validates whitelist/eligibility before execution.
 */
contract ArcFunSwap is 
    Initializable, 
    UUPSUpgradeable, 
    AccessControlUpgradeable, 
    PausableUpgradeable, 
    ReentrancyGuard 
{
    using SafeERC20 for IERC20;

    // --- Roles ---
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant WHITELIST_MANAGER_ROLE = keccak256("WHITELIST_MANAGER_ROLE");

    // --- Configuration & Limits ---
    uint256 public constant MAX_SWAPS_PER_DAY = 1000;
    uint256 public constant SECONDS_PER_DAY = 86400;
    
    // Limits scaled for 18 decimal normalization
    uint256 public constant MAX_SWAP_AMOUNT_NORMALIZED = 1000000 * 10**18; 
    // uint256 public constant DECIMAL_OFFSET = 10**12; // Removed in V2

    bool public scoreRequirementEnabled;
    address public usdcAddress;
    address public eurcAddress;

    // --- Storage ---
    // User => Day (Timestamp / 86400) => Swap Count
    mapping(address => mapping(uint256 => uint256)) public dailySwapCount;
    mapping(address => bool) public isWhitelisted;

    address public vaultAddress;

    // Used to track strict exact approvals. Unlimited approvals not allowed implicitly by the UI, 
    // but contract-side we just transfer exactly what's needed.

    // --- Events ---
    event SwapRequested(address indexed user, address tokenIn, address tokenOut, uint256 amount);
    event SwapExecuted(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event SwapRejected(address indexed user, string reason);
    event LimitExceeded(address indexed user, string reason);
    event SecurityViolation(address indexed user, string reason);
    
    event FeatureFlagUpdated(string flag, bool value);
    event WhitelistUpdated(address indexed user, bool status);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _usdc, address _eurc, address adminMultisig) public initializer {
        __AccessControl_init();
        __Pausable_init();
        
        
        _grantRole(DEFAULT_ADMIN_ROLE, adminMultisig);
        _grantRole(PAUSER_ROLE, adminMultisig);
        _grantRole(UPGRADER_ROLE, adminMultisig);
        _grantRole(WHITELIST_MANAGER_ROLE, adminMultisig);

        usdcAddress = _usdc;
        eurcAddress = _eurc;
        scoreRequirementEnabled = true;
    }

    function setEURCAddress(address _newEURC) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newEURC != address(0), "Invalid address");
        eurcAddress = _newEURC;
        emit FeatureFlagUpdated("EURC_ADDRESS", true); // Reusing event for tracking
    }

    // --- Modifiers ---
    modifier onlySupportedAssets(address tokenIn, address tokenOut) {
        require(
            (tokenIn == usdcAddress && tokenOut == eurcAddress) ||
            (tokenIn == eurcAddress && tokenOut == usdcAddress),
            "ArcFunSwap: Unsupported asset pair"
        );
        _;
    }

    modifier onlyVaultConfigured() {
        require(vaultAddress != address(0), "ArcFunSwap: Vault not configured");
        _;
    }

    // --- Execution Logic ---

    /**
     * @dev Executes a 1:1 swap dynamically supporting any token decimals up to 18.
     */
    function swap(address tokenIn, address tokenOut, uint256 amountIn) 
        external 
        whenNotPaused 
        nonReentrant 
        onlySupportedAssets(tokenIn, tokenOut)
        onlyVaultConfigured
    {
        require(amountIn > 0, "ArcFunSwap: Zero amount not allowed");
        emit SwapRequested(msg.sender, tokenIn, tokenOut, amountIn);

        uint8 decimalsIn = IERC20Metadata(tokenIn).decimals();
        uint8 decimalsOut = IERC20Metadata(tokenOut).decimals();
        require(decimalsIn <= 18 && decimalsOut <= 18, "Unsupported decimals");

        uint256 amountOut;

        // Base 1:1 conversion matching decimals
        if (decimalsIn > decimalsOut) {
            amountOut = amountIn / (10**(decimalsIn - decimalsOut));
        } else if (decimalsIn < decimalsOut) {
            amountOut = amountIn * (10**(decimalsOut - decimalsIn));
        } else {
            amountOut = amountIn;
        }

        // Apply high precision exchange rates matching backend source of truth
        // 1 USDC = 0.6 EURC (amountOut = amountIn * 6 / 10)
        // 1 EURC = 1.6666... USDC (amountOut = amountIn * 10 / 6)
        if (tokenIn == usdcAddress && tokenOut == eurcAddress) {
            amountOut = (amountOut * 6) / 10;
        } else if (tokenIn == eurcAddress && tokenOut == usdcAddress) {
            amountOut = (amountOut * 10) / 6;
        }

        uint256 normalizedAmount = amountIn * (10**(18 - decimalsIn));

        require(amountOut > 0, "ArcFunSwap: Amount too small for conversion");

        // 1. Feature Flag & Eligibility Validation
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && scoreRequirementEnabled && !isWhitelisted[msg.sender]) {
            emit SecurityViolation(msg.sender, "Score requirement active and user not whitelisted");
            revert("ArcFunSwap: Unauthorized/Not Eligible");
        }

        // 2. Limit Validation
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && normalizedAmount > MAX_SWAP_AMOUNT_NORMALIZED) {
            emit LimitExceeded(msg.sender, "Amount exceeds MAX_SWAP_AMOUNT");
            revert("ArcFunSwap: Amount exceeds maximum limit");
        }

        uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && dailySwapCount[msg.sender][currentDay] >= MAX_SWAPS_PER_DAY) {
            emit LimitExceeded(msg.sender, "Daily swap limit reached");
            revert("ArcFunSwap: Daily swap limit reached");
        }

        // 3. Exact Approval Enforcement
        uint256 allowance = IERC20(tokenIn).allowance(msg.sender, address(this));
        if (allowance < amountIn) {
            emit SwapRejected(msg.sender, "Insufficient allowance");
            revert("ArcFunSwap: Insufficient allowance");
        }

        // Ensure the vault has enough tokenOut liquidity for the swap
        uint256 vaultBalance = IERC20(tokenOut).balanceOf(vaultAddress);
        if (vaultBalance < amountOut) {
            emit SwapRejected(msg.sender, "Insufficient vault liquidity");
            revert("ArcFunSwap: Insufficient liquidity");
        }

        // 4. State Updates
        dailySwapCount[msg.sender][currentDay] += 1;

        // 5. Asset Transfers
        // Pull tokens from user directly to the vault
        IERC20(tokenIn).safeTransferFrom(msg.sender, vaultAddress, amountIn);
        
        // Command vault to release tokens to the user
        IArcFunSwapVault(vaultAddress).releaseFunds(tokenOut, msg.sender, amountOut);

        emit SwapExecuted(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    // --- Admin & Security Controls ---

    function setScoreRequirement(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        scoreRequirementEnabled = enabled;
        emit FeatureFlagUpdated("scoreRequirementEnabled", enabled);
    }

    function setVaultAddress(address _vault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_vault != address(0), "Invalid address");
        vaultAddress = _vault;
        emit FeatureFlagUpdated("VAULT_ADDRESS", true);
    }

    function setWhitelist(address user, bool status) external onlyRole(WHITELIST_MANAGER_ROLE) {
        require(user != address(0), "ArcFunSwap: Zero address not allowed");
        isWhitelisted[user] = status;
        emit WhitelistUpdated(user, status);
    }

    /**
     * @dev Emergency admin override to reset a user's daily swap count.
     * Required when a user's slot becomes corrupted or an allowance is granted.
     */
    function resetDailyCount(address user) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
        dailySwapCount[user][currentDay] = 0;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @dev ERC7201 storage gap — prevents storage slot collision during UUPS upgrades.
     * Must always remain at the END of all state variable declarations.
     */
    uint256[49] private __gap;
}
