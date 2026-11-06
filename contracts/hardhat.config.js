require("@nomicfoundation/hardhat-toolbox");
const path = require("path");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

const SOLC_VERSION = "0.8.28";

// 使用 npm 安裝的 solc（JavaScript 版編譯器），不從網路下載。
// 這樣在無法連到 binaries.soliditylang.org 的環境也能編譯，且各處編譯結果一致。
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === SOLC_VERSION) {
    const compilerPath = path.join(__dirname, "node_modules", "solc", "soljson.js");
    return {
      compilerPath,
      isSolcJs: true,
      version: args.solcVersion,
      longVersion: require("solc").version(),
    };
  }
  return runSuper();
});

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const accounts = DEPLOYER_KEY ? [DEPLOYER_KEY] : [];

module.exports = {
  solidity: {
    version: SOLC_VERSION,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // 保守設定：不使用較新的操作碼，任何以太坊相容鏈都能執行。
      evmVersion: "paris",
    },
  },
  networks: {
    // Base 測試網（Sepolia）。CHAIN_RPC_URL 可改用自己的連線服務，未設定時用 Base 官方公開節點。
    baseSepolia: {
      url: process.env.CHAIN_RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts,
    },
    // Base 主網（第 1 階段才會用到；部署腳本會要求多簽管理者）
    base: {
      url: process.env.CHAIN_RPC_URL || "https://mainnet.base.org",
      chainId: 8453,
      accounts,
    },
  },
};
