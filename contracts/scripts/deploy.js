// 部署 MyBooklet 合約，並把角色授予各個後端錢包。
//
// 用法（在 GitHub Actions 或自己的電腦上）：
//   DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/deploy.js --network kairos
//
// 可選環境變數（未設定則全部給部署者，測試網方便用；主網必須分開設定）：
//   ADMIN_ADDRESS     管理角色（主網應為多簽錢包）
//   MINTER_ADDRESS    鑄造角色（後端發送錢包）
//   CURATOR_ADDRESS   場次內容角色
//   MIGRATOR_ADDRESS  搬遷角色
const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("沒有部署錢包：請設定 DEPLOYER_PRIVATE_KEY");

  const admin = process.env.ADMIN_ADDRESS || deployer.address;
  const minter = process.env.MINTER_ADDRESS || deployer.address;
  const curator = process.env.CURATOR_ADDRESS || deployer.address;
  const migrator = process.env.MIGRATOR_ADDRESS || deployer.address;

  if (network.name === "kaia" && admin === deployer.address) {
    throw new Error("主網部署必須設定 ADMIN_ADDRESS（多簽錢包），不能由部署錢包擔任管理者");
  }

  console.log(`網路：${network.name}`);
  console.log(`部署錢包：${deployer.address}`);
  console.log(`餘額：${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} KAIA`);

  const Booklet = await ethers.getContractFactory("MyBooklet");
  // 先以部署者為管理者部署，授完角色後再把管理權交給 ADMIN_ADDRESS
  const booklet = await Booklet.deploy(deployer.address);
  await booklet.waitForDeployment();
  const address = await booklet.getAddress();
  console.log(`合約地址：${address}`);

  const grants = [
    ["MINTER_ROLE", minter],
    ["CURATOR_ROLE", curator],
    ["MIGRATOR_ROLE", migrator],
  ];
  for (const [role, account] of grants) {
    const tx = await booklet.grantRole(await booklet[role](), account);
    await tx.wait();
    console.log(`已授予 ${role} 給 ${account}`);
  }

  if (admin !== deployer.address) {
    const ADMIN = await booklet.DEFAULT_ADMIN_ROLE();
    await (await booklet.grantRole(ADMIN, admin)).wait();
    await (await booklet.renounceRole(ADMIN, deployer.address)).wait();
    console.log(`管理權已移交給 ${admin}，部署錢包已放棄管理權`);
  }

  console.log("\n請把下面這行加到網站的環境變數：");
  console.log(`BOOKLET_CONTRACT_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
