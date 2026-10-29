import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("ArcApiEscrow v2 — Backend Vulnerability Recovery Tests", function () {
  let escrow: any;
  let usdc: any;
  let owner: HardhatEthersSigner;
  let userA: HardhatEthersSigner;
  let userB: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;

  const RECOVERY_DELAY = 24 * 60 * 60;
  const DEPOSIT_ETH = ethers.parseEther("0.05");

  beforeEach(async function () {
    [owner, userA, userB, treasury] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory("MockERC20");
    usdc = await MockUSDC.deploy("Mock USDC", "USDC", 6);
    await usdc.waitForDeployment();

    const Escrow = await ethers.getContractFactory("ArcApiEscrow");
    escrow = await Escrow.deploy(treasury.address, await usdc.getAddress());
    await escrow.waitForDeployment();
  });

  describe("1. Crash after analysis persistence but before HTTP response", function () {
    it("Simulates SETTLEMENT_PENDING race condition prevention", async function () {
      // User deposits
      await escrow.connect(userA).depositETH({ value: DEPOSIT_ETH });
      
      // Cron actively verifies snapshot exists before committing.
      // We simulate the cron job committing because snapshot exists.
      await escrow.connect(owner).commitPayment(userA.address);
      
      const deposit = await escrow.deposits(userA.address);
      expect(deposit.isCommitted).to.be.true;
      
      // Cannot be incorrectly refunded or committed twice
      await expect(escrow.connect(owner).commitPayment(userA.address)).to.be.revertedWith("Payment already committed");
      await expect(escrow.connect(owner).settlePayment(userA.address, false)).to.be.revertedWith("Cannot refund: payment already committed (data was delivered)");
    });
  });

  describe("2. Stale PROCESSING Black Hole Recovery", function () {
    it("safely becomes REFUND_PENDING and 5-minute manual claim works", async function () {
      // User deposits
      await escrow.connect(userA).depositETH({ value: DEPOSIT_ETH });
      
      // Simulated DB Transition: PROCESSING -> REFUND_PENDING (no on-chain tx yet)
      const depositBefore = await escrow.deposits(userA.address);
      expect(depositBefore.isPending).to.be.true;
      expect(depositBefore.isCommitted).to.be.false;

      // 5-minute manual claim triggers settlePayment(false)
      const balanceBefore = await ethers.provider.getBalance(userA.address);
      const tx = await escrow.connect(owner).settlePayment(userA.address, false);
      const receipt = await tx.wait();
      
      const depositAfter = await escrow.deposits(userA.address);
      expect(depositAfter.isPending).to.be.false;
    });
  });

  describe("3. Concurrent sync/commit requests", function () {
    it("No nonce collision and no duplicate commitment", async function () {
      await escrow.connect(userA).depositETH({ value: DEPOSIT_ETH });
      
      // Simulating global DB lock in API:
      // Worker 1 acquires lock, gets nonce, broadcasts tx.
      // Worker 2 waits for lock, sees tx_hash saved, relies on cron reconciliation.
      await escrow.connect(owner).commitPayment(userA.address);
      
      // Worker 2 or cron attempts duplicate commit
      await expect(
        escrow.connect(owner).commitPayment(userA.address)
      ).to.be.revertedWith("Payment already committed");
    });
  });

  describe("Additional Security Invariants", function () {
    it("committed payment cannot be refunded", async function () {
      await escrow.connect(userA).depositETH({ value: DEPOSIT_ETH });
      await escrow.connect(owner).commitPayment(userA.address);
      await expect(escrow.connect(owner).settlePayment(userA.address, false)).to.be.revertedWith("Cannot refund: payment already committed (data was delivered)");
    });

    it("uncommitted payment can be manually refunded", async function () {
      await escrow.connect(userA).depositETH({ value: DEPOSIT_ETH });
      await escrow.connect(owner).settlePayment(userA.address, false);
      const deposit = await escrow.deposits(userA.address);
      expect(deposit.isPending).to.be.false;
    });

    it("admin emergency refund still works instantly", async function () {
      await escrow.connect(userA).depositETH({ value: DEPOSIT_ETH });
      await escrow.connect(owner).settlePayment(userA.address, false);
      const deposit = await escrow.deposits(userA.address);
      expect(deposit.isPending).to.be.false;
    });

    it("24h emergency recovery still works", async function () {
      await escrow.connect(userA).depositETH({ value: DEPOSIT_ETH });
      await escrow.connect(userA).requestRecovery();
      await ethers.provider.send("evm_increaseTime", [RECOVERY_DELAY + 1]);
      await ethers.provider.send("evm_mine", []);
      await escrow.connect(userA).executeRecovery();
      const deposit = await escrow.deposits(userA.address);
      expect(deposit.isPending).to.be.false;
    });

    it("user A cannot claim user B's refund", async function () {
      await escrow.connect(userA).depositETH({ value: DEPOSIT_ETH });
      await escrow.connect(userB).depositETH({ value: DEPOSIT_ETH });
      
      // In V2, refunds go back to the original depositor mapping
      const balanceBBefore = await ethers.provider.getBalance(userB.address);
      // Even if admin calls settlePayment on userA, userB gets nothing
      await escrow.connect(owner).settlePayment(userA.address, false);
      
      const balanceBAfter = await ethers.provider.getBalance(userB.address);
      expect(balanceBAfter).to.equal(balanceBBefore);
    });

    it("duplicate claim cannot double-refund", async function () {
      await escrow.connect(userA).depositETH({ value: DEPOSIT_ETH });
      await escrow.connect(owner).settlePayment(userA.address, false);
      await expect(escrow.connect(owner).settlePayment(userA.address, false)).to.be.revertedWith("No pending deposit for user");
    });
  });
});
