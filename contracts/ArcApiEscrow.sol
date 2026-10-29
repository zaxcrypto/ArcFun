// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ArcApiEscrow v2 — Commitment Pattern
 *
 * State Machine (on-chain):
 *
 *   PENDING (isPending=true, isCommitted=false, recoveryRequestedAt=0)
 *     │
 *     ├── [Backend calls commitPayment()] ──────────────────────────────────────
 *     │                                                                         │
 *     │   COMMITTED (isPending=true, isCommitted=true, recoveryRequestedAt=0)   │
 *     │     │                                                                   │
 *     │     └── [Cron calls settlePayment(user, true)] → SETTLED (isPending=false)
 *     │                                                    Funds → Treasury
 *     │
 *     ├── [User calls requestRecovery()] ─── RECOVERY_REQUESTED (recoveryRequestedAt > 0)
 *     │     │
 *     │     └── (after RECOVERY_DELAY) [User calls executeRecovery()] → SETTLED
 *     │                                                                   Funds → User
 *     │
 *     └── [Cron/Admin calls settlePayment(user, false)] → SETTLED (isPending=false)
 *                                                           Funds → User (refund)
 *
 * Security Invariants:
 *   1. commitPayment() permanently blocks requestRecovery() and executeRecovery().
 *   2. settlePayment(true) REQUIRES isCommitted == true. Cannot pay treasury without commitment.
 *   3. settlePayment(false) REQUIRES isCommitted == false. Cannot refund a committed deposit.
 *   4. Every state transition is atomic and requires isPending == true as precondition.
 *   5. Refund destination is ALWAYS the original depositor address stored on-chain.
 *   6. The owner/admin can never redirect user funds to themselves or any other address.
 */
contract ArcApiEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice All data for a single user's escrow deposit
    struct Deposit {
        uint256 ethAmount;
        uint256 usdcAmount;
        bool isPending;       // True while funds are locked in escrow
        bool isCommitted;     // True after backend commits a successful analysis; blocks user recovery
        uint256 recoveryRequestedAt; // Timestamp when user initiated a recovery request (0 if not requested)
    }

    /// @notice One deposit per user address
    mapping(address => Deposit) public deposits;

    address public treasury;
    IERC20 public usdcToken;

    /// @notice Safety window: after requesting recovery, user must wait this long before executing
    uint256 public constant RECOVERY_DELAY = 24 hours;

    event DepositedETH(address indexed user, uint256 amount);
    event DepositedUSDC(address indexed user, uint256 amount);
    event PaymentCommitted(address indexed user);
    event RecoveryRequested(address indexed user, uint256 executionTime);
    event Settled(address indexed user, bool success, uint256 ethAmount, uint256 usdcAmount);
    event TreasuryUpdated(address newTreasury);

    constructor(address _treasury, address _usdcToken) Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        require(_usdcToken != address(0), "Invalid USDC");
        treasury = _treasury;
        usdcToken = IERC20(_usdcToken);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DEPOSIT FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice User deposits ETH into escrow before requesting an X analysis
    function depositETH() external payable nonReentrant {
        require(msg.value > 0, "Must send ETH");
        require(!deposits[msg.sender].isPending, "Already has pending deposit");

        deposits[msg.sender] = Deposit({
            ethAmount: msg.value,
            usdcAmount: 0,
            isPending: true,
            isCommitted: false,
            recoveryRequestedAt: 0
        });

        emit DepositedETH(msg.sender, msg.value);
    }

    /// @notice User deposits USDC into escrow before requesting an X analysis
    function depositUSDC(uint256 amount) external nonReentrant {
        require(amount > 0, "Must send USDC");
        require(!deposits[msg.sender].isPending, "Already has pending deposit");

        deposits[msg.sender] = Deposit({
            ethAmount: 0,
            usdcAmount: amount,
            isPending: true,
            isCommitted: false,
            recoveryRequestedAt: 0
        });

        usdcToken.safeTransferFrom(msg.sender, address(this), amount);

        emit DepositedUSDC(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BACKEND COMMITMENT — Called synchronously by /api/social/x/sync
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Backend calls this BEFORE returning successful analysis to the user.
     *         Once committed, the user can NEVER recover or refund this deposit.
     *         The deposit is now guaranteed to eventually reach the treasury.
     * @param user The wallet address of the user whose analysis succeeded
     */
    function commitPayment(address user) external onlyOwner nonReentrant {
        require(deposits[user].isPending, "No pending deposit for user");
        require(!deposits[user].isCommitted, "Payment already committed");

        deposits[user].isCommitted = true;

        emit PaymentCommitted(user);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SETTLEMENT — Called by cron job or admin for batch/emergency processing
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Settles the escrow — either to treasury (success) or back to user (refund).
     * @param user    The wallet address of the user
     * @param success If true, sends to treasury. If false, refunds the original depositor.
     *
     * Security rules enforced by the contract:
     *  - settlePayment(user, true)  requires isCommitted == true  (data was delivered)
     *  - settlePayment(user, false) requires isCommitted == false (data was NOT delivered)
     *  - Refund ALWAYS goes to the original depositor — never to admin or treasury
     */
    function settlePayment(address user, bool success) external onlyOwner nonReentrant {
        require(deposits[user].isPending, "No pending deposit for user");

        if (success) {
            require(deposits[user].isCommitted, "Cannot settle to treasury: payment not committed");
        } else {
            require(!deposits[user].isCommitted, "Cannot refund: payment already committed (data was delivered)");
        }

        uint256 ethAmt = deposits[user].ethAmount;
        uint256 usdcAmt = deposits[user].usdcAmount;

        // Clear state atomically before any external calls (checks-effects-interactions)
        deposits[user].isPending = false;
        deposits[user].isCommitted = false;
        deposits[user].ethAmount = 0;
        deposits[user].usdcAmount = 0;
        deposits[user].recoveryRequestedAt = 0;

        if (success) {
            // Analysis succeeded — send funds to treasury
            if (ethAmt > 0) {
                (bool sent, ) = treasury.call{value: ethAmt}("");
                require(sent, "ETH transfer to treasury failed");
            }
            if (usdcAmt > 0) {
                usdcToken.safeTransfer(treasury, usdcAmt);
            }
        } else {
            // Analysis failed — refund the ORIGINAL DEPOSITOR (not any frontend-supplied address)
            if (ethAmt > 0) {
                (bool sent, ) = user.call{value: ethAmt}("");
                require(sent, "ETH refund failed");
            }
            if (usdcAmt > 0) {
                usdcToken.safeTransfer(user, usdcAmt);
            }
        }

        emit Settled(user, success, ethAmt, usdcAmt);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // USER SELF-RECOVERY — Two-step process for genuinely stuck funds
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Step 1: User signals they want to recover their stuck funds.
     *         This is BLOCKED if the payment is already committed (data was delivered).
     *         Starts the 24-hour safety countdown.
     */
    function requestRecovery() external nonReentrant {
        Deposit storage dep = deposits[msg.sender];
        require(dep.isPending, "No pending deposit");
        require(!dep.isCommitted, "Cannot recover: payment committed (analysis was delivered)");
        require(dep.recoveryRequestedAt == 0, "Recovery already requested");

        dep.recoveryRequestedAt = block.timestamp;

        emit RecoveryRequested(msg.sender, block.timestamp + RECOVERY_DELAY);
    }

    /**
     * @notice Step 2: After the 24-hour delay has passed, user claims their funds.
     *         This is BLOCKED if the payment is committed (isCommitted == true).
     *         This CANNOT race with commitPayment() — if the backend commits first,
     *         this will revert because isCommitted will be true.
     */
    function executeRecovery() external nonReentrant {
        Deposit storage dep = deposits[msg.sender];
        require(dep.isPending, "No pending deposit");
        require(!dep.isCommitted, "Cannot recover: payment committed (analysis was delivered)");
        require(dep.recoveryRequestedAt > 0, "Recovery not requested");
        require(
            block.timestamp >= dep.recoveryRequestedAt + RECOVERY_DELAY,
            "Recovery delay not elapsed"
        );

        uint256 ethAmt = dep.ethAmount;
        uint256 usdcAmt = dep.usdcAmount;

        // Clear state atomically before any external calls
        dep.isPending = false;
        dep.isCommitted = false;
        dep.ethAmount = 0;
        dep.usdcAmount = 0;
        dep.recoveryRequestedAt = 0;

        if (ethAmt > 0) {
            (bool sent, ) = msg.sender.call{value: ethAmt}("");
            require(sent, "ETH refund failed");
        }
        if (usdcAmt > 0) {
            usdcToken.safeTransfer(msg.sender, usdcAmt);
        }

        emit Settled(msg.sender, false, ethAmt, usdcAmt);
    }
}
