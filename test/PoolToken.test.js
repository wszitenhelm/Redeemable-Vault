const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PoolToken – Security Tests", function () {
  let usdToken, poolToken;
  let owner, user1, user2, attacker;

  beforeEach(async function () {
    [owner, user1, user2, attacker] = await ethers.getSigners();

    const USDToken = await ethers.getContractFactory("USDToken");
    usdToken = await USDToken.deploy();
    await usdToken.waitForDeployment();

    const PoolToken = await ethers.getContractFactory("PoolToken");
    poolToken = await PoolToken.deploy(usdToken.target);
    await poolToken.waitForDeployment();
  });

  /* =============================================================
     METADATA TESTS
     ============================================================= */

  describe("Token Metadata", function () {
    it("Has correct name, symbol and decimals", async function () {
      expect(await poolToken.name()).to.equal("Pool Token");
      expect(await poolToken.symbol()).to.equal("POOL");
      expect(await poolToken.decimals()).to.equal(18);
    });
  });

  /* =============================================================
     CORE SAFETY TESTS
     ============================================================= */

  describe("Deposit & Mint Safety", function () {
    it("Mints pool tokens 1:1 with USD deposits", async function () {
      const amount = ethers.parseEther("1000");

      await usdToken.mint(user1.address, amount);
      await usdToken.connect(user1).approve(poolToken.target, amount);

      await poolToken.connect(user1).deposit(amount);

      expect(await poolToken.balanceOf(user1.address)).to.equal(amount);
    });
  });

  /* =============================================================
     EVENT EMISSION
     ============================================================= */

  describe("Event Emission", function () {
    it("Emits ProceedsDeposited event", async function () {
      const deposit = ethers.parseEther("1000");
      const proceeds = ethers.parseEther("100");

      // Need pool tokens to exist first
      await usdToken.mint(user1.address, deposit);
      await usdToken.connect(user1).approve(poolToken.target, deposit);
      await poolToken.connect(user1).deposit(deposit);

      await usdToken.mint(owner.address, proceeds);
      await usdToken.connect(owner).approve(poolToken.target, proceeds);

      const expectedAccProceedsPerShare = (proceeds * ethers.parseEther("1")) / deposit;
      await expect(poolToken.connect(owner).depositProceeds(proceeds))
        .to.emit(poolToken, "ProceedsDeposited")
        .withArgs(proceeds, expectedAccProceedsPerShare);
    });
  });

  /* =============================================================
     LATE DEPOSITOR / FLASH-LOAN STYLE ATTACK PREVENTION
     ============================================================= */

  describe("Late Depositor Protection", function () {
    it("Prevents new depositors from claiming past proceeds", async function () {
      const deposit = ethers.parseEther("1000");
      const proceeds = ethers.parseEther("100");

      await usdToken.mint(user1.address, deposit);
      await usdToken.mint(attacker.address, ethers.parseEther("1000000"));
      await usdToken.mint(owner.address, proceeds);

      await usdToken.connect(user1).approve(poolToken.target, deposit);
      await usdToken.connect(attacker).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(owner).approve(poolToken.target, proceeds);

      await poolToken.connect(user1).deposit(deposit);
      await poolToken.connect(owner).depositProceeds(proceeds);

      await poolToken.connect(attacker).deposit(ethers.parseEther("1000000"));

      expect(await poolToken.pendingProceeds(attacker.address)).to.equal(0);
      expect(await poolToken.pendingProceeds(user1.address)).to.equal(proceeds);
    });
  });

  /* =============================================================
     CLAIM & WITHDRAW SAFETY (NO BAD DEBT)
     ============================================================= */

  describe("Claiming & Withdrawal Safety", function () {
    it("Claims proceeds once and prevents double-claiming", async function () {
      const deposit = ethers.parseEther("1000");
      const proceeds = ethers.parseEther("100");

      await usdToken.mint(user1.address, deposit);
      await usdToken.mint(owner.address, proceeds);

      await usdToken.connect(user1).approve(poolToken.target, deposit);
      await usdToken.connect(owner).approve(poolToken.target, proceeds);

      await poolToken.connect(user1).deposit(deposit);
      await poolToken.connect(owner).depositProceeds(proceeds);

      await poolToken.connect(user1).claimProceeds();
      expect(await poolToken.pendingProceeds(user1.address)).to.equal(0);

      await expect(poolToken.connect(user1).claimProceeds())
        .to.be.revertedWith("PoolToken: no proceeds to claim");
    });

    it("Withdraws USD and settles all proceeds without bad debt", async function () {
      const deposit = ethers.parseEther("1000");
      const proceeds = ethers.parseEther("100");

      await usdToken.mint(user1.address, deposit);
      await usdToken.mint(owner.address, proceeds);

      await usdToken.connect(user1).approve(poolToken.target, deposit);
      await usdToken.connect(owner).approve(poolToken.target, proceeds);

      await poolToken.connect(user1).deposit(deposit);
      await poolToken.connect(owner).depositProceeds(proceeds);

      await poolToken.connect(user1).withdraw(deposit);

      expect(await poolToken.balanceOf(user1.address)).to.equal(0);
      expect(await poolToken.pendingProceeds(user1.address)).to.equal(0);
      expect(await poolToken.userDebt(user1.address)).to.equal(0);
    });
  });

  /* =============================================================
     PRECISION & ROUNDING SAFETY
     ============================================================= */

  describe("Precision & Rounding", function () {
    it("Distributes proceeds proportionally without inflation", async function () {
      const a1 = ethers.parseEther("1");
      const a2 = ethers.parseEther("2");
      const proceeds = ethers.parseEther("3");

      await usdToken.mint(user1.address, ethers.parseEther("10"));
      await usdToken.mint(user2.address, ethers.parseEther("10"));
      await usdToken.mint(owner.address, proceeds);

      await usdToken.connect(user1).approve(poolToken.target, a1);
      await usdToken.connect(user2).approve(poolToken.target, a2);
      await usdToken.connect(owner).approve(poolToken.target, proceeds);

      await poolToken.connect(user1).deposit(a1);
      await poolToken.connect(user2).deposit(a2);
      await poolToken.connect(owner).depositProceeds(proceeds);

      const p1 = await poolToken.pendingProceeds(user1.address);
      const p2 = await poolToken.pendingProceeds(user2.address);

      expect(p1 + p2).to.equal(proceeds);
    });
  });

  /* =============================================================
     ZERO-SUPPLY EDGE CASE
     ============================================================= */

  describe("Zero Supply Edge Case", function () {
    it("Rejects proceeds deposit when no pool tokens exist", async function () {
      const proceeds = ethers.parseEther("100");

      await usdToken.mint(owner.address, proceeds);
      await usdToken.connect(owner).approve(poolToken.target, proceeds);

      await expect(
        poolToken.connect(owner).depositProceeds(proceeds)
      ).to.be.revertedWith("PoolToken: no pool tokens");
    });
  });

  /* =============================================================
     REENTRANCY PROTECTION
     ============================================================= */

  describe("Reentrancy Protection", function () {
    it("Should block reentrancy during claimProceeds", async function () {
      const MaliciousUSD = await ethers.getContractFactory("MaliciousUSD");
      const maliciousUSD = await MaliciousUSD.deploy();
      await maliciousUSD.waitForDeployment();
  
      const PoolToken = await ethers.getContractFactory("PoolToken");
      const pool = await PoolToken.deploy(maliciousUSD.target);
      await pool.waitForDeployment();
  
      await maliciousUSD.setPool(pool.target);
  
      // Setup balances
      const deposit = ethers.parseEther("1000");
      await maliciousUSD.mint(user1.address, deposit);
      await maliciousUSD.mint(owner.address, deposit);
  
      await maliciousUSD.connect(user1).approve(pool.target, deposit);
      await maliciousUSD.connect(owner).approve(pool.target, deposit);
  
      await pool.connect(user1).deposit(deposit);
      await pool.connect(owner).depositProceeds(ethers.parseEther("100"));
  
      await maliciousUSD.enableAttack();
  
      await expect(
        pool.connect(user1).claimProceeds()
      ).to.be.revertedWithCustomError(pool, "ReentrancyGuardReentrantCall");
    });
  });
  

/* =============================================================
   ADDITIONAL TESTS FOR ADMIN & ROUNDING DUST
   ============================================================= */

   describe("Admin Access Control", function () {
    it("Only owner can deposit proceeds", async function () {
      const proceeds = ethers.parseEther("100");
  
      await usdToken.mint(user1.address, proceeds);
      await usdToken.connect(user1).approve(poolToken.target, proceeds);
  
      await expect(
        poolToken.connect(user1).depositProceeds(proceeds)
      ).to.be.revertedWith("PoolToken: only admin can deposit proceeds");
    });
  });
  
  describe("Small Rounding Dust", function () {
    it("Should retain small rounding dust in the pool", async function () {
      const userAmount = 3n; // very small number
      const proceedsAmount = 10n;
  
      // User deposit
      await usdToken.connect(user1).mint(user1.address, userAmount);
      await usdToken.connect(user1).approve(poolToken.target, userAmount);
      await poolToken.connect(user1).deposit(userAmount);
  
      // Owner deposits proceeds
      await usdToken.connect(owner).mint(owner.address, proceedsAmount);
      await usdToken.connect(owner).approve(poolToken.target, proceedsAmount);
      await poolToken.connect(owner).depositProceeds(proceedsAmount);
  
      const pending = await poolToken.pendingProceeds(user1.address);
      const accPerShare = await poolToken.accProceedsPerShare();
  
      // Pending may not perfectly match due to rounding
      expect(pending).to.be.lte((userAmount * accPerShare) / (10n ** 18n));
    });
  });

  /* =============================================================
     ADMIN TRANSFER
     ============================================================= */

     describe("PoolToken – Admin Transfer", function () {
        it("Allows admin transfer and acceptance", async function () {
          const [owner, newAdmin] = await ethers.getSigners();
      
          // Admin initiates transfer
          await expect(poolToken.connect(owner).transferAdmin(newAdmin.address))
            .to.emit(poolToken, "AdminTransferInitiated")
            .withArgs(owner.address, newAdmin.address);
      
          expect(await poolToken.pendingAdmin()).to.equal(newAdmin.address);
      
          // Pending admin accepts
          await expect(poolToken.connect(newAdmin).acceptAdmin())
            .to.emit(poolToken, "AdminTransferCompleted")
            .withArgs(owner.address, newAdmin.address);
      
          expect(await poolToken.admin()).to.equal(newAdmin.address);
          expect(await poolToken.pendingAdmin()).to.equal(ethers.ZeroAddress);
        });
      
        it("Reverts on unauthorized or invalid actions", async function () {
          const [owner, newAdmin, attacker] = await ethers.getSigners();
      
          // Only admin can initiate
          await expect(poolToken.connect(attacker).transferAdmin(newAdmin.address))
            .to.be.revertedWith("PoolToken: only admin");
      
          // Cannot transfer to zero address
          await expect(poolToken.connect(owner).transferAdmin(ethers.ZeroAddress))
            .to.be.revertedWith("PoolToken: invalid admin address");
      
          // Only pending admin can accept
          await poolToken.connect(owner).transferAdmin(newAdmin.address);
          await expect(poolToken.connect(attacker).acceptAdmin())
            .to.be.revertedWith("PoolToken: not pending admin");
        });
      });      
});