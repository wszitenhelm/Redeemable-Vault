const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("PoolToken Tests", function () {
  let usdToken, poolToken;
  let owner, user1, user2, attacker;

  beforeEach(async function () {
    [owner, user1, user2, attacker] = await ethers.getSigners();

    const USDToken = await ethers.getContractFactory("USDToken");
    usdToken = await USDToken.deploy();
    await usdToken.waitForDeployment();

    const PoolToken = await ethers.getContractFactory("PoolTokenV1");

    poolToken = await upgrades.deployProxy(PoolToken, [usdToken.target], {
      initializer: "initialize",
    });
    await poolToken.waitForDeployment();
  });

  describe("Token Metadata", function () {
    it("Has correct name, symbol and decimals", async function () {
      expect(await poolToken.name()).to.equal("Pool Token V1");
      expect(await poolToken.symbol()).to.equal("POOL");
      expect(await poolToken.decimals()).to.equal(18);
    });
  });

  describe("Deposit & Mint Safety", function () {
    it("Mints pool tokens 1:1 with USD deposits", async function () {
      const amount = ethers.parseEther("1000");

      await usdToken.mint(user1.address, amount);
      await usdToken.connect(user1).approve(poolToken.target, amount);

      await poolToken.connect(user1).deposit(amount);

      expect(await poolToken.balanceOf(user1.address)).to.equal(amount);
    });
  });

  describe("Event Emission", function () {
    it("Emits ProceedsDeposited event", async function () {
      const deposit = ethers.parseEther("1000");
      const proceeds = ethers.parseEther("100");

      await usdToken.mint(user1.address, deposit);
      await usdToken.connect(user1).approve(poolToken.target, deposit);
      await poolToken.connect(user1).deposit(deposit);

      await usdToken.mint(owner.address, proceeds);
      await usdToken.connect(owner).approve(poolToken.target, proceeds);

      const expectedAccProceedsPerShare =
        (proceeds * ethers.parseEther("1")) / deposit;
      await expect(poolToken.connect(owner).depositProceeds(proceeds))
        .to.emit(poolToken, "ProceedsDeposited")
        .withArgs(proceeds, expectedAccProceedsPerShare);
    });
  });

  describe("Late Depositor Protection", function () {
    it("Prevents new depositors from claiming past proceeds", async function () {
      const deposit = ethers.parseEther("1000");
      const proceeds = ethers.parseEther("100");

      await usdToken.mint(user1.address, deposit);
      await usdToken.mint(attacker.address, ethers.parseEther("1000000"));
      await usdToken.mint(owner.address, proceeds);

      await usdToken.connect(user1).approve(poolToken.target, deposit);
      await usdToken
        .connect(attacker)
        .approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(owner).approve(poolToken.target, proceeds);

      await poolToken.connect(user1).deposit(deposit);
      await poolToken.connect(owner).depositProceeds(proceeds);

      await poolToken.connect(attacker).deposit(ethers.parseEther("1000000"));

      expect(await poolToken.pendingProceeds(attacker.address)).to.equal(0);
      expect(await poolToken.pendingProceeds(user1.address)).to.equal(proceeds);
    });
  });

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

      await expect(poolToken.connect(user1).claimProceeds()).to.be.revertedWith(
        "PoolToken: no proceeds to claim"
      );
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

  describe("Reentrancy Protection", function () {
    it("Should block reentrancy during claimProceeds", async function () {
      const MaliciousUSD = await ethers.getContractFactory("MaliciousUSD");
      const maliciousUSD = await MaliciousUSD.deploy();
      await maliciousUSD.waitForDeployment();

      const PoolToken = await ethers.getContractFactory("PoolTokenV1");

      const pool = await upgrades.deployProxy(
        PoolToken,
        [maliciousUSD.target],
        {
          initializer: "initialize",
        }
      );
      await pool.waitForDeployment();

      await maliciousUSD.setPool(pool.target);

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

  describe("Admin Access Control", function () {
    it("Only owner can deposit proceeds", async function () {
      const proceeds = ethers.parseEther("100");

      await usdToken.mint(user1.address, proceeds);
      await usdToken.connect(user1).approve(poolToken.target, proceeds);

      await expect(
        poolToken.connect(user1).depositProceeds(proceeds)
      ).to.be.revertedWith("PoolToken: only admin");
    });
  });

  describe("Pause Controls", function () {
    it("Allows admin to pause inflows but still lets users withdraw", async function () {
      const amount = ethers.parseEther("100");

      await usdToken.mint(user1.address, amount);
      await usdToken.connect(user1).approve(poolToken.target, amount);
      await poolToken.connect(user1).deposit(amount);

      await poolToken.connect(owner).setDepositsPaused(true);

      await usdToken.mint(owner.address, amount);
      await usdToken.connect(owner).approve(poolToken.target, amount);

      await expect(poolToken.connect(owner).deposit(amount)).to.be.revertedWith(
        "PoolToken: deposits paused"
      );
      await expect(
        poolToken.connect(owner).depositProceeds(amount)
      ).to.be.revertedWith("PoolToken: deposits paused");

      await expect(poolToken.connect(user1).withdraw(amount)).to.not.be.reverted;
    });

    it("Rejects pause changes from non-admin", async function () {
      await expect(
        poolToken.connect(user1).setDepositsPaused(true)
      ).to.be.revertedWith("PoolToken: only admin");
    });
  });

  describe("Dust and Precision Accounting", function () {
    it("Should quantify and track trapped dust", async function () {
      const userAmount = 3n;
      const proceedsAmount = 10n;

      await usdToken.connect(user1).mint(user1.address, userAmount);
      await usdToken.connect(user1).approve(poolToken.target, userAmount);
      await poolToken.connect(user1).deposit(userAmount);

      await usdToken.connect(owner).mint(owner.address, proceedsAmount);
      await usdToken.connect(owner).approve(poolToken.target, proceedsAmount);
      await poolToken.connect(owner).depositProceeds(proceedsAmount);

      const pending = await poolToken.pendingProceeds(user1.address);

      const expectedDust = 1n;
      expect(pending).to.equal(9n);

      const totalPoolBalance = await usdToken.balanceOf(poolToken.target);
      expect(totalPoolBalance).to.equal(userAmount + proceedsAmount);

      await poolToken.connect(user1).claimProceeds();
      const balanceAfterClaim = await usdToken.balanceOf(poolToken.target);

      expect(balanceAfterClaim).to.equal(userAmount + expectedDust);
    });
  });

  describe("Transfer Restrictions", function () {
    it("Blocks user-to-user transfer to preserve proceeds accounting", async function () {
      const amount = ethers.parseEther("50");

      await usdToken.mint(user1.address, amount);
      await usdToken.connect(user1).approve(poolToken.target, amount);
      await poolToken.connect(user1).deposit(amount);

      await expect(
        poolToken.connect(user1).transfer(user2.address, 1)
      ).to.be.revertedWith("PoolToken: transfers disabled");
    });
  });

  describe("PoolToken Upgrade", function () {
    it("Should preserve state and allow new functions after upgrade", async function () {
      await usdToken.mint(owner.address, ethers.parseEther("1000"));
      await usdToken
        .connect(owner)
        .approve(poolToken.target, ethers.parseEther("1000"));
      await poolToken.connect(owner).deposit(ethers.parseEther("500"));

      const PoolTokenV2 = await ethers.getContractFactory("PoolTokenV2");
      const upgraded = await upgrades.upgradeProxy(
        poolToken.target,
        PoolTokenV2
      );
      await upgraded.waitForDeployment();

      const balance = await upgraded.balanceOf(owner.address);
      expect(balance).to.equal(ethers.parseEther("500"));

      await upgraded.newFeature();
    });
  });

  describe("PoolToken - Admin Transfer", function () {
    it("Allows admin transfer and acceptance", async function () {
      const [adminSigner, newAdmin] = await ethers.getSigners();

      await expect(poolToken.connect(adminSigner).transferAdmin(newAdmin.address))
        .to.emit(poolToken, "AdminTransferInitiated")
        .withArgs(adminSigner.address, newAdmin.address);

      expect(await poolToken.pendingAdmin()).to.equal(newAdmin.address);

      await expect(poolToken.connect(newAdmin).acceptAdmin())
        .to.emit(poolToken, "AdminTransferCompleted")
        .withArgs(adminSigner.address, newAdmin.address);

      expect(await poolToken.admin()).to.equal(newAdmin.address);
      expect(await poolToken.pendingAdmin()).to.equal(ethers.ZeroAddress);
    });

    it("Reverts on unauthorized or invalid actions", async function () {
      const [adminSigner, newAdmin, badActor] = await ethers.getSigners();

      await expect(
        poolToken.connect(badActor).transferAdmin(newAdmin.address)
      ).to.be.revertedWith("PoolToken: only admin");

      await expect(
        poolToken.connect(adminSigner).transferAdmin(ethers.ZeroAddress)
      ).to.be.revertedWith("PoolToken: invalid admin address");

      await poolToken.connect(adminSigner).transferAdmin(newAdmin.address);
      await expect(poolToken.connect(badActor).acceptAdmin()).to.be.revertedWith(
        "PoolToken: not pending admin"
      );
    });
  });

  describe("Implementation Hardening", function () {
    it("Disallows initializing the implementation contract", async function () {
      const PoolTokenImpl = await ethers.getContractFactory("PoolTokenV1");
      const implementation = await PoolTokenImpl.deploy();
      await implementation.waitForDeployment();

      await expect(
        implementation.initialize(usdToken.target)
      ).to.be.revertedWithCustomError(implementation, "InvalidInitialization");
    });
  });
});
