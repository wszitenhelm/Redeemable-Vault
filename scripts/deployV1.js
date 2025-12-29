async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Deploy USDToken
  const USDToken = await ethers.getContractFactory("USDToken");
  const usdToken = await USDToken.deploy(); // returns a contract instance promise
  console.log("USDToken deployed at:", await usdToken.getAddress()); // await .getAddress()!

  // Deploy PoolTokenV1 as proxy
  const PoolToken = await ethers.getContractFactory("PoolTokenV1");
  const poolToken = await upgrades.deployProxy(
    PoolToken,
    [await usdToken.getAddress()], // pass actual address, not promise
    { initializer: "initialize" }
  );
  console.log("PoolTokenV1 deployed at:", await poolToken.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
