const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("USDToken", function () {
  let usdToken;
  let owner, user1, user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const USDToken = await ethers.getContractFactory("USDToken");
    usdToken = await USDToken.deploy();
    await usdToken.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await usdToken.name()).to.equal("USD Token");
      expect(await usdToken.symbol()).to.equal("USD");
    });

    it("Should have zero initial supply", async function () {
      expect(await usdToken.totalSupply()).to.equal(0);
    });
  });

  describe("Minting", function () {
    it("Should allow anyone to mint tokens", async function () {
      const amount = ethers.parseEther("1000");
      await usdToken.connect(user1).mint(user1.address, amount);

      expect(await usdToken.balanceOf(user1.address)).to.equal(amount);
      expect(await usdToken.totalSupply()).to.equal(amount);
    });

    it("Should allow minting to any address", async function () {
      const amount = ethers.parseEther("500");
      await usdToken.connect(user1).mint(user2.address, amount);

      expect(await usdToken.balanceOf(user2.address)).to.equal(amount);
      expect(await usdToken.balanceOf(user1.address)).to.equal(0);
    });

    it("Should allow multiple mints", async function () {
      const amount1 = ethers.parseEther("100");
      const amount2 = ethers.parseEther("200");

      await usdToken.connect(user1).mint(user1.address, amount1);
      await usdToken.connect(user2).mint(user2.address, amount2);

      expect(await usdToken.balanceOf(user1.address)).to.equal(amount1);
      expect(await usdToken.balanceOf(user2.address)).to.equal(amount2);
      expect(await usdToken.totalSupply()).to.equal(amount1 + amount2);
    });

    it("Should allow minting zero amount", async function () {
      await usdToken.connect(user1).mint(user1.address, 0);
      expect(await usdToken.balanceOf(user1.address)).to.equal(0);
    });

    it("Should allow minting very large amounts", async function () {
      const largeAmount = ethers.parseEther("1000000000");
      await usdToken.connect(user1).mint(user1.address, largeAmount);
      expect(await usdToken.balanceOf(user1.address)).to.equal(largeAmount);
    });
  });

  describe("ERC20 Standard", function () {
    it("Should support standard ERC20 transfers", async function () {
      const amount = ethers.parseEther("1000");
      await usdToken.connect(user1).mint(user1.address, amount);

      const transferAmount = ethers.parseEther("300");
      await usdToken.connect(user1).transfer(user2.address, transferAmount);

      expect(await usdToken.balanceOf(user1.address)).to.equal(amount - transferAmount);
      expect(await usdToken.balanceOf(user2.address)).to.equal(transferAmount);
    });

    it("Should support approve and transferFrom", async function () {
      const amount = ethers.parseEther("1000");
      await usdToken.connect(user1).mint(user1.address, amount);

      const approveAmount = ethers.parseEther("500");
      await usdToken.connect(user1).approve(user2.address, approveAmount);

      const transferAmount = ethers.parseEther("300");
      await usdToken.connect(user2).transferFrom(user1.address, user2.address, transferAmount);

      expect(await usdToken.balanceOf(user1.address)).to.equal(amount - transferAmount);
      expect(await usdToken.balanceOf(user2.address)).to.equal(transferAmount);
    });
  });

});

