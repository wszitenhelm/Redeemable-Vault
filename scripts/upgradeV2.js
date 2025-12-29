async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading with:", deployer.address);

  // Replace this with your existing proxy address
  const proxyAddress = "0x0165878A594ca255338adfa4d48449f69242Eb8F";

  const PoolTokenV2 = await ethers.getContractFactory("PoolTokenV2");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, PoolTokenV2);

  console.log("PoolToken upgraded to V2 at proxy address:", upgraded.target);

  // Test the new feature
  console.log("New feature call:", await upgraded.newFeature());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});