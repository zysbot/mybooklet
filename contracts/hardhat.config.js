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
      // 保守設定：不使用較新的操作碼，確保 Kaia 主網與測試網都能執行。
      evmVersion: "paris",
    },
  },
  networks: {
    // Kaia 測試網
    kairos: {
      url: process.env.KAIA_RPC_URL || "https://public-en-kairos.node.kaia.io",
      chainId: 1001,
      accounts,
    },
    // Kaia 主網（第 1 階段才會用到）
    kaia: {
      url: process.env.KAIA_RPC_URL || "https://public-en.node.kaia.io",
      chainId: 8217,
      accounts,
    },
  },
};
