import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("ArcFunSwap (Phase 5A)", function () {
  let swapContract: any;
  let mockUSDC: any;
  let mockEURC: any;
  let admin: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let attacker: SignerWithAddress;

  // Contract assumes USDC = 18 decimals, EURC = 6 decimals, 1:1 via DECIMAL_OFFSET
  const MAX_SWAP_AMOUNT_USDC = ethers.parseUnits("1", 18);       // 1 USDC (18 dec)
  const INITIAL_VAULT_USDC   = ethers.parseUnits("1000", 18);    // 1000 USDC vault
  const INITIAL_VAULT_EURC   = ethers.parseUnits("1000", 6);     // 1000 EURC vault
  const INITIAL_USER_USDC    = ethers.parseUnits("100", 18);
  const INITIAL_USER_EURC    = ethers.parseUnits("100", 6);

  beforeEach(async function () {
    [admin, user1, user2, attacker] = await ethers.getSigners();

    // Deploy mocks matching contract decimal assumptions
    const ERC20Mock = await ethers.getContractFactory("MockERC20");
    mockUSDC = await ERC20Mock.deploy("Mock USDC", "USDC", 18);  // 18 decimals
    mockEURC = await ERC20Mock.deploy("Mock EURC", "EURC", 6);   // 6 decimals

    await mockUSDC.waitForDeployment();
    await mockEURC.waitForDeployment();

    const ArcFunSwap = await ethers.getContractFactory("ArcFunSwap");
    swapContract = await upgrades.deployProxy(ArcFunSwap, [
      await mockUSDC.getAddress(),
      await mockEURC.getAddress(),
      admin.address
    ], { kind: "uups", unsafeAllow: ["constructor"] });

    await swapContract.waitForDeployment();

    const ArcFunSwapVault = await ethers.getContractFactory("ArcFunSwapVault");
    const vault: any = await ArcFunSwapVault.deploy(admin.address);
    await vault.waitForDeployment();

    await swapContract.connect(admin).setVaultAddress(await vault.getAddress());
    await vault.connect(admin).grantRole(await vault.SWAP_ROUTER_ROLE(), await swapContract.getAddress());

    // Fund vault and users
    await mockUSDC.mint(await vault.getAddress(), INITIAL_VAULT_USDC);
    await mockEURC.mint(await vault.getAddress(), INITIAL_VAULT_EURC);
    await mockUSDC.mint(user1.address, INITIAL_USER_USDC);
    await mockEURC.mint(user1.address, INITIAL_USER_EURC);
  });

  describe("Initialization & Access Control", function () {
    it("Should correctly set admin roles", async function () {
      const DEFAULT_ADMIN_ROLE = await swapContract.DEFAULT_ADMIN_ROLE();
      expect(await swapContract.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should reject unprivileged pause attempts", async function () {
      await expect(swapContract.connect(attacker).pause()).to.be.reverted;
    });
  });

  describe("Whitelisting & Score Requirement", function () {
    it("Should reject swap if score requirement is enabled and user is not whitelisted", async function () {
      await mockUSDC.connect(user1).approve(await swapContract.getAddress(), MAX_SWAP_AMOUNT_USDC);
      await expect(
        swapContract.connect(user1).swap(await mockUSDC.getAddress(), await mockEURC.getAddress(), MAX_SWAP_AMOUNT_USDC)
      ).to.be.revertedWith("ArcFunSwap: Unauthorized/Not Eligible");
    });

    it("Should allow swap if user is whitelisted", async function () {
      await swapContract.connect(admin).setWhitelist(user1.address, true);
      await mockUSDC.connect(user1).approve(await swapContract.getAddress(), MAX_SWAP_AMOUNT_USDC);
      await expect(
        swapContract.connect(user1).swap(await mockUSDC.getAddress(), await mockEURC.getAddress(), MAX_SWAP_AMOUNT_USDC)
      ).to.emit(swapContract, "SwapExecuted");
    });

    it("Should allow swap if score requirement is disabled globally", async function () {
      await swapContract.connect(admin).setScoreRequirement(false);
      await mockUSDC.connect(user1).approve(await swapContract.getAddress(), MAX_SWAP_AMOUNT_USDC);
      await expect(
        swapContract.connect(user1).swap(await mockUSDC.getAddress(), await mockEURC.getAddress(), MAX_SWAP_AMOUNT_USDC)
      ).to.emit(swapContract, "SwapExecuted");
    });
  });

  describe("Limits & Constraints", function () {
    beforeEach(async function () {
      await swapContract.connect(admin).setScoreRequirement(false);
    });

    it("Should reject swaps exceeding 1000000 USDC (MAX_SWAP_AMOUNT)", async function () {
      const tooMuch = ethers.parseUnits("1000001", 18);  // 1,000,001 USDC (18 dec) — over limit
      await mockUSDC.mint(user1.address, tooMuch);
      await mockUSDC.connect(user1).approve(await swapContract.getAddress(), tooMuch);
      await expect(
        swapContract.connect(user1).swap(await mockUSDC.getAddress(), await mockEURC.getAddress(), tooMuch)
      ).to.be.revertedWith("ArcFunSwap: Amount exceeds maximum limit");
    });

    it("Should reject more than 1000 swaps per day", async function () {
      const amount = ethers.parseUnits("0.1", 18);  // 0.1 USDC
      await mockUSDC.mint(user1.address, amount * 1005n);
      await mockUSDC.connect(user1).approve(await swapContract.getAddress(), amount * 1005n);
      for (let i = 0; i < 1000; i++) {
        await swapContract.connect(user1).swap(await mockUSDC.getAddress(), await mockEURC.getAddress(), amount);
      }
      await expect(
        swapContract.connect(user1).swap(await mockUSDC.getAddress(), await mockEURC.getAddress(), amount)
      ).to.be.revertedWith("ArcFunSwap: Daily swap limit reached");
    });
  });

  describe("Execution & Asset Safety", function () {
    beforeEach(async function () {
      await swapContract.connect(admin).setScoreRequirement(false);
    });

    it("Should enforce exact amount approvals", async function () {
      const amount = ethers.parseUnits("1", 18);
      await mockUSDC.connect(user1).approve(await swapContract.getAddress(), amount - 1n);
      await expect(
        swapContract.connect(user1).swap(await mockUSDC.getAddress(), await mockEURC.getAddress(), amount)
      ).to.be.revertedWith("ArcFunSwap: Insufficient allowance");
    });

    it("Should successfully swap 1 USDC for 0.6 EURC", async function () {
      const amountIn  = ethers.parseUnits("1", 18);   // 1 USDC (18 dec)
      const amountOut = ethers.parseUnits("0.6", 6);   // 0.6 EURC (6 dec)
      await mockUSDC.connect(user1).approve(await swapContract.getAddress(), amountIn);

      const eurcBefore = await mockEURC.balanceOf(user1.address);
      const usdcBefore = await mockUSDC.balanceOf(user1.address);

      await swapContract.connect(user1).swap(await mockUSDC.getAddress(), await mockEURC.getAddress(), amountIn);

      expect(await mockEURC.balanceOf(user1.address)).to.equal(eurcBefore + amountOut);
      expect(await mockUSDC.balanceOf(user1.address)).to.equal(usdcBefore - amountIn);
    });

    it("Should fail if contract is paused", async function () {
      await swapContract.connect(admin).pause();
      const amount = ethers.parseUnits("1", 18);
      await mockUSDC.connect(user1).approve(await swapContract.getAddress(), amount);
      await expect(
        swapContract.connect(user1).swap(await mockUSDC.getAddress(), await mockEURC.getAddress(), amount)
      ).to.be.revertedWithCustomError(swapContract, "EnforcedPause");
    });

    it("Should reject unsupported assets (cirBTC)", async function () {
      const ERC20Mock = await ethers.getContractFactory("MockERC20");
      const mockCIRBTC = await ERC20Mock.deploy("Mock cirBTC", "cirBTC", 8);
      const amount = ethers.parseUnits("1", 18);
      await expect(
        swapContract.connect(user1).swap(await mockUSDC.getAddress(), await mockCIRBTC.getAddress(), amount)
      ).to.be.revertedWith("ArcFunSwap: Unsupported asset pair");
    });
  });
});
