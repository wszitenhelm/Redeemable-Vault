const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PoolToken", function () {
  let usdToken, poolToken;
  let owner, user1, user2, user3;

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();

    const USDToken = await ethers.getContractFactory("USDToken");
    usdToken = await USDToken.deploy();
    await usdToken.waitForDeployment();

    const PoolToken = await ethers.getContractFactory("PoolToken");
    poolToken = await PoolToken.deploy(usdToken.target);
    await poolToken.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set correct name, symbol, and USD token address", async function () {
      expect(await poolToken.name()).to.equal("Pool Token");
      expect(await poolToken.symbol()).to.equal("POOL");
      expect(await poolToken.usdToken()).to.equal(usdToken.target);
      expect(await poolToken.totalSupply()).to.equal(0);
    });

    it("Should revert if USD token address is zero", async function () {
      const PoolToken = await ethers.getContractFactory("PoolToken");
      await expect(PoolToken.deploy(ethers.ZeroAddress)).to.be.revertedWith(
        "PoolToken: invalid USD token address"
      );
    });
  });

  describe("Deposit", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("10000");
      await usdToken.connect(user1).mint(user1.address, amount);
      await usdToken.connect(user2).mint(user2.address, amount);
      await usdToken.connect(user1).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(user2).approve(poolToken.target, ethers.MaxUint256);
    });

    it("Should deposit USD and mint pool tokens 1:1", async function () {
      const depositAmount = ethers.parseEther("1000");
      await poolToken.connect(user1).deposit(depositAmount);

      expect(await poolToken.balanceOf(user1.address)).to.equal(depositAmount);
      expect(await poolToken.totalSupply()).to.equal(depositAmount);
      expect(await usdToken.balanceOf(poolToken.target)).to.equal(depositAmount);
      expect(await poolToken.userDebt(user1.address)).to.equal(0);
    });

    it("Should allow multiple users to deposit", async function () {
      await poolToken.connect(user1).deposit(ethers.parseEther("1000"));
      await poolToken.connect(user2).deposit(ethers.parseEther("2000"));

      expect(await poolToken.totalSupply()).to.equal(ethers.parseEther("3000"));
    });

    it("Should revert on zero amount or insufficient balance", async function () {
      await expect(poolToken.connect(user1).deposit(0)).to.be.revertedWith(
        "PoolToken: amount must be > 0"
      );
      await expect(poolToken.connect(user1).deposit(ethers.parseEther("20000"))).to.be.reverted;
    });
  });

  describe("Deposit Proceeds", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("10000");
      await usdToken.connect(user1).mint(user1.address, amount);
      await usdToken.connect(user2).mint(user2.address, amount);
      await usdToken.connect(owner).mint(owner.address, amount);

      await usdToken.connect(user1).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(user2).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(owner).approve(poolToken.target, ethers.MaxUint256);

      await poolToken.connect(user1).deposit(ethers.parseEther("1000"));
      await poolToken.connect(user2).deposit(ethers.parseEther("2000"));
    });

    it("Should deposit proceeds and update accProceedsPerShare", async function () {
      const proceedsAmount = ethers.parseEther("300");
      const totalSupply = ethers.parseEther("3000");

      await poolToken.connect(owner).depositProceeds(proceedsAmount);

      const expectedAccProceedsPerShare = (proceedsAmount * ethers.parseEther("1")) / totalSupply;
      expect(await poolToken.accProceedsPerShare()).to.equal(expectedAccProceedsPerShare);
      expect(await usdToken.balanceOf(poolToken.target)).to.equal(
        ethers.parseEther("3300")
      );
    });

    it("Should emit ProceedsDeposited event", async function () {
      const proceedsAmount = ethers.parseEther("300");
      const totalSupply = ethers.parseEther("3000");
      const expectedAccProceedsPerShare = (proceedsAmount * ethers.parseEther("1")) / totalSupply;
      
      await expect(poolToken.connect(owner).depositProceeds(proceedsAmount))
        .to.emit(poolToken, "ProceedsDeposited")
        .withArgs(proceedsAmount, expectedAccProceedsPerShare);
    });

    it("Should revert if no pool tokens exist or amount is zero", async function () {
      const PoolToken = await ethers.getContractFactory("PoolToken");
      const newPoolToken = await PoolToken.deploy(usdToken.target);
      await newPoolToken.waitForDeployment();

      const proceedsAmount = ethers.parseEther("300");
      await usdToken.connect(owner).mint(owner.address, proceedsAmount);
      await usdToken.connect(owner).approve(newPoolToken.target, proceedsAmount);

      await expect(newPoolToken.connect(owner).depositProceeds(proceedsAmount)).to.be.revertedWith(
        "PoolToken: no pool tokens"
      );
      await expect(poolToken.connect(owner).depositProceeds(0)).to.be.revertedWith(
        "PoolToken: amount must be > 0"
      );
    });
  });

  describe("Pending Proceeds", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("10000");
      await usdToken.connect(user1).mint(user1.address, amount);
      await usdToken.connect(user2).mint(user2.address, amount);
      await usdToken.connect(owner).mint(owner.address, amount);

      await usdToken.connect(user1).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(user2).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(owner).approve(poolToken.target, ethers.MaxUint256);

      await poolToken.connect(user1).deposit(ethers.parseEther("1000"));
      await poolToken.connect(user2).deposit(ethers.parseEther("2000"));
    });

    it("Should calculate pending proceeds correctly", async function () {
      const proceedsAmount = ethers.parseEther("300");
      await poolToken.connect(owner).depositProceeds(proceedsAmount);

      // user1: 1000/3000 = 33.33% of 300 = 100
      // user2: 2000/3000 = 66.67% of 300 = 200
      expect(await poolToken.pendingProceeds(user1.address)).to.equal(ethers.parseEther("100"));
      expect(await poolToken.pendingProceeds(user2.address)).to.equal(ethers.parseEther("200"));
    });

    it("Should return zero after claiming", async function () {
      const proceedsAmount = ethers.parseEther("300");
      await poolToken.connect(owner).depositProceeds(proceedsAmount);

      await poolToken.connect(user1).claimProceeds();
      expect(await poolToken.pendingProceeds(user1.address)).to.equal(0);
    });

    it("Should handle multiple proceeds deposits", async function () {
      await poolToken.connect(owner).depositProceeds(ethers.parseEther("300"));
      await usdToken.connect(owner).mint(owner.address, ethers.parseEther("600"));
      await usdToken.connect(owner).approve(poolToken.target, ethers.parseEther("600"));
      await poolToken.connect(owner).depositProceeds(ethers.parseEther("600"));

      // user1 should get 33.33% of (300 + 600) = 300
      expect(await poolToken.pendingProceeds(user1.address)).to.equal(ethers.parseEther("300"));
    });
  });

  describe("Claim Proceeds", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("10000");
      await usdToken.connect(user1).mint(user1.address, amount);
      await usdToken.connect(user2).mint(user2.address, amount);
      await usdToken.connect(owner).mint(owner.address, amount);

      await usdToken.connect(user1).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(user2).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(owner).approve(poolToken.target, ethers.MaxUint256);

      await poolToken.connect(user1).deposit(ethers.parseEther("1000"));
      await poolToken.connect(user2).deposit(ethers.parseEther("2000"));
    });

    it("Should claim proceeds and update userDebt", async function () {
      const proceedsAmount = ethers.parseEther("300");
      await poolToken.connect(owner).depositProceeds(proceedsAmount);

      const user1BalanceBefore = await usdToken.balanceOf(user1.address);
      await poolToken.connect(user1).claimProceeds();
      const user1BalanceAfter = await usdToken.balanceOf(user1.address);

      expect(user1BalanceAfter - user1BalanceBefore).to.equal(ethers.parseEther("100"));
      expect(await poolToken.pendingProceeds(user1.address)).to.equal(0);
    });

    it("Should emit ProceedsClaimed event", async function () {
      const proceedsAmount = ethers.parseEther("300");
      await poolToken.connect(owner).depositProceeds(proceedsAmount);

      const pending = await poolToken.pendingProceeds(user1.address);
      await expect(poolToken.connect(user1).claimProceeds())
        .to.emit(poolToken, "ProceedsClaimed")
        .withArgs(user1.address, pending);
    });

    it("Should revert if no proceeds to claim", async function () {
      await expect(poolToken.connect(user1).claimProceeds()).to.be.revertedWith(
        "PoolToken: no proceeds to claim"
      );
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("10000");
      await usdToken.connect(user1).mint(user1.address, amount);
      await usdToken.connect(user2).mint(user2.address, amount);
      await usdToken.connect(owner).mint(owner.address, amount);

      await usdToken.connect(user1).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(user2).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(owner).approve(poolToken.target, ethers.MaxUint256);

      await poolToken.connect(user1).deposit(ethers.parseEther("1000"));
      await poolToken.connect(user2).deposit(ethers.parseEther("2000"));
    });

    it("Should withdraw pool tokens and return USD 1:1", async function () {
      const withdrawAmount = ethers.parseEther("500");
      const user1USDBefore = await usdToken.balanceOf(user1.address);

      await poolToken.connect(user1).withdraw(withdrawAmount);

      expect(await poolToken.balanceOf(user1.address)).to.equal(ethers.parseEther("500"));
      expect(await usdToken.balanceOf(user1.address)).to.equal(user1USDBefore + withdrawAmount);
    });

    it("Should claim pending proceeds before withdrawal", async function () {
      const proceedsAmount = ethers.parseEther("300");
      await poolToken.connect(owner).depositProceeds(proceedsAmount);

      const user1USDBefore = await usdToken.balanceOf(user1.address);
      await poolToken.connect(user1).withdraw(ethers.parseEther("500"));

      // User1 should receive proceeds (100) + withdrawal (500) = 600
      const user1USDAfter = await usdToken.balanceOf(user1.address);
      expect(user1USDAfter - user1USDBefore).to.equal(ethers.parseEther("600"));
      expect(await poolToken.pendingProceeds(user1.address)).to.equal(0);
    });

    it("Should ensure no outstanding proceeds after full withdrawal", async function () {
      const proceedsAmount = ethers.parseEther("300");
      await poolToken.connect(owner).depositProceeds(proceedsAmount);

      const user1Balance = await poolToken.balanceOf(user1.address);
      await poolToken.connect(user1).withdraw(user1Balance);

      expect(await poolToken.pendingProceeds(user1.address)).to.equal(0);
      expect(await poolToken.balanceOf(user1.address)).to.equal(0);
    });

    it("Should revert on zero amount or insufficient balance", async function () {
      await expect(poolToken.connect(user1).withdraw(0)).to.be.revertedWith(
        "PoolToken: amount must be > 0"
      );
      await expect(poolToken.connect(user1).withdraw(ethers.parseEther("2000"))).to.be.revertedWith(
        "PoolToken: insufficient balance"
      );
    });
  });

  describe("Complex Scenarios", function () {
    it("Should handle multiple users, deposits, proceeds, and withdrawals", async function () {
      const amount = ethers.parseEther("10000");
      await usdToken.connect(user1).mint(user1.address, amount);
      await usdToken.connect(user2).mint(user2.address, amount);
      await usdToken.connect(user3).mint(user3.address, amount);
      await usdToken.connect(owner).mint(owner.address, amount);

      await usdToken.connect(user1).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(user2).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(user3).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(owner).approve(poolToken.target, ethers.MaxUint256);

      // Deposits
      await poolToken.connect(user1).deposit(ethers.parseEther("1000"));
      await poolToken.connect(owner).depositProceeds(ethers.parseEther("100"));
      await poolToken.connect(user2).deposit(ethers.parseEther("2000"));
      await poolToken.connect(owner).depositProceeds(ethers.parseEther("300"));

      // Claims
      await poolToken.connect(user1).claimProceeds();
      await poolToken.connect(user2).claimProceeds();

      // More deposits and proceeds
      await poolToken.connect(user3).deposit(ethers.parseEther("1000"));
      await poolToken.connect(owner).depositProceeds(ethers.parseEther("400"));

      // Withdrawal (should claim proceeds first)
      const user1Balance = await poolToken.balanceOf(user1.address);
      const user1USDBefore = await usdToken.balanceOf(user1.address);
      await poolToken.connect(user1).withdraw(user1Balance);

      expect(await poolToken.pendingProceeds(user1.address)).to.equal(0);
      expect(await usdToken.balanceOf(user1.address)).to.be.gt(user1USDBefore);
    });

    it("Should maintain correct accounting with equal deposits", async function () {
      const amount = ethers.parseEther("10000");
      await usdToken.connect(user1).mint(user1.address, amount);
      await usdToken.connect(user2).mint(user2.address, amount);
      await usdToken.connect(user3).mint(user3.address, amount);
      await usdToken.connect(owner).mint(owner.address, amount);

      await usdToken.connect(user1).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(user2).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(user3).approve(poolToken.target, ethers.MaxUint256);
      await usdToken.connect(owner).approve(poolToken.target, ethers.MaxUint256);

      // Each user deposits 1000 tokens
      await poolToken.connect(user1).deposit(ethers.parseEther("1000"));
      await poolToken.connect(user2).deposit(ethers.parseEther("1000"));
      await poolToken.connect(user3).deposit(ethers.parseEther("1000"));

      // Proceeds of 900 (300 per user)
      const proceeds = ethers.parseEther("900");
      await poolToken.connect(owner).depositProceeds(proceeds);

      // Each user should have 300 pending
      expect(await poolToken.pendingProceeds(user1.address)).to.equal(ethers.parseEther("300"));
      expect(await poolToken.pendingProceeds(user2.address)).to.equal(ethers.parseEther("300"));
      expect(await poolToken.pendingProceeds(user3.address)).to.equal(ethers.parseEther("300"));

      // Total claimable should equal proceeds
      const totalClaimable = 
        (await poolToken.pendingProceeds(user1.address)) +
        (await poolToken.pendingProceeds(user2.address)) +
        (await poolToken.pendingProceeds(user3.address));
  
      expect(totalClaimable).to.equal(proceeds);
    });
  });
});
