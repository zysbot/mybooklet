const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const SHOW_A = 1n;
const SHOW_B = 2n;
const URI_A = "ar://show-a-metadata";
const URI_B = "ar://show-b-metadata";

const claimId = (label) => ethers.id(label);

async function deployFixture() {
  const [admin, minter, migrator, curator, alice, bob, aliceOwnWallet, stranger] = await ethers.getSigners();
  const Booklet = await ethers.getContractFactory("MyBooklet");
  const booklet = await Booklet.deploy(admin.address);

  await booklet.connect(admin).grantRole(await booklet.MINTER_ROLE(), minter.address);
  await booklet.connect(admin).grantRole(await booklet.MIGRATOR_ROLE(), migrator.address);
  await booklet.connect(admin).grantRole(await booklet.CURATOR_ROLE(), curator.address);

  await booklet.connect(curator).setShowURI(SHOW_A, URI_A);
  await booklet.connect(curator).setShowURI(SHOW_B, URI_B);

  return { booklet, admin, minter, migrator, curator, alice, bob, aliceOwnWallet, stranger };
}

async function mintedFixture() {
  const ctx = await deployFixture();
  const { booklet, minter, alice, bob } = ctx;
  await booklet.connect(minter).mintBatch([
    { to: alice.address, showId: SHOW_A, serial: 1, claimedAt: 1763700000, claimId: claimId("c1") },
    { to: bob.address, showId: SHOW_A, serial: 2, claimedAt: 1763700060, claimId: claimId("c2") },
    { to: alice.address, showId: SHOW_B, serial: 1, claimedAt: 1763800000, claimId: claimId("c3") },
  ]);
  return ctx;
}

describe("MyBooklet", function () {
  describe("部署", function () {
    it("名稱、代號與管理角色正確", async function () {
      const { booklet, admin } = await loadFixture(deployFixture);
      expect(await booklet.name()).to.equal("吾冊 My Booklet");
      expect(await booklet.symbol()).to.equal("BOOKLET");
      expect(await booklet.hasRole(await booklet.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
    });

    it("宣告支援 ERC-721 與 ERC-5192", async function () {
      const { booklet } = await loadFixture(deployFixture);
      expect(await booklet.supportsInterface("0x80ac58cd")).to.equal(true); // ERC-721
      expect(await booklet.supportsInterface("0xb45a3c0e")).to.equal(true); // ERC-5192
    });

    it("管理者不能是零地址", async function () {
      const Booklet = await ethers.getContractFactory("MyBooklet");
      await expect(Booklet.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(Booklet, "InvalidRecipient");
    });
  });

  describe("場次內容", function () {
    it("只有場次內容角色能設定", async function () {
      const { booklet, stranger } = await loadFixture(deployFixture);
      await expect(booklet.connect(stranger).setShowURI(9, "ar://x"))
        .to.be.revertedWithCustomError(booklet, "AccessControlUnauthorizedAccount");
    });

    it("不接受空網址", async function () {
      const { booklet, curator } = await loadFixture(deployFixture);
      await expect(booklet.connect(curator).setShowURI(9, "")).to.be.revertedWithCustomError(booklet, "EmptyURI");
    });

    it("凍結前可修改，凍結後不能再改", async function () {
      const { booklet, curator } = await loadFixture(deployFixture);
      await booklet.connect(curator).setShowURI(SHOW_A, "ar://fixed-typo");
      expect(await booklet.showURI(SHOW_A)).to.equal("ar://fixed-typo");

      await expect(booklet.connect(curator).freezeShow(SHOW_A)).to.emit(booklet, "ShowFrozen").withArgs(SHOW_A);
      await expect(booklet.connect(curator).setShowURI(SHOW_A, "ar://changed"))
        .to.be.revertedWithCustomError(booklet, "ShowIsFrozen");
    });

    it("尚未設定內容的場次不能凍結", async function () {
      const { booklet, curator } = await loadFixture(deployFixture);
      await expect(booklet.connect(curator).freezeShow(99)).to.be.revertedWithCustomError(booklet, "ShowNotConfigured");
    });
  });

  describe("批次鑄造", function () {
    it("鑄造後記錄場次、入場編號、領取時間，tokenURI 指向場次內容", async function () {
      const { booklet, alice } = await loadFixture(mintedFixture);
      expect(await booklet.ownerOf(1)).to.equal(alice.address);
      const t = await booklet.ticketOf(1);
      expect(t.showId).to.equal(SHOW_A);
      expect(t.serial).to.equal(1);
      expect(t.claimedAt).to.equal(1763700000);
      expect(await booklet.tokenURI(1)).to.equal(URI_A);
      expect(await booklet.tokenURI(3)).to.equal(URI_B);
      expect(await booklet.totalMinted()).to.equal(3);
      expect(await booklet.balanceOf(alice.address)).to.equal(2);
    });

    it("記錄 claimId 對應的 tokenId", async function () {
      const { booklet } = await loadFixture(mintedFixture);
      expect(await booklet.tokenOfClaim(claimId("c2"))).to.equal(2);
      expect(await booklet.tokenOfClaim(claimId("never"))).to.equal(0);
    });

    it("發出 Locked 與 Claimed 事件", async function () {
      const { booklet, minter, alice } = await loadFixture(deployFixture);
      const tx = booklet.connect(minter).mintBatch([
        { to: alice.address, showId: SHOW_A, serial: 7, claimedAt: 1, claimId: claimId("ev") },
      ]);
      await expect(tx).to.emit(booklet, "Locked").withArgs(1);
      await expect(tx).to.emit(booklet, "Claimed").withArgs(claimId("ev"), 1, alice.address, SHOW_A, 7);
    });

    it("重複的 claimId 會略過，不會重複鑄造，也不會整批失敗", async function () {
      const { booklet, minter, alice, bob } = await loadFixture(mintedFixture);
      const tx = booklet.connect(minter).mintBatch([
        { to: alice.address, showId: SHOW_A, serial: 1, claimedAt: 1, claimId: claimId("c1") }, // 已鑄造過
        { to: bob.address, showId: SHOW_B, serial: 2, claimedAt: 2, claimId: claimId("c4") },   // 新的
      ]);
      await expect(tx).to.emit(booklet, "ClaimSkipped").withArgs(claimId("c1"), 1);
      expect(await booklet.totalMinted()).to.equal(4);
      expect(await booklet.ownerOf(4)).to.equal(bob.address);
    });

    it("同一批內重複的 claimId 也只鑄造一次", async function () {
      const { booklet, minter, alice } = await loadFixture(deployFixture);
      await booklet.connect(minter).mintBatch([
        { to: alice.address, showId: SHOW_A, serial: 1, claimedAt: 1, claimId: claimId("dup") },
        { to: alice.address, showId: SHOW_A, serial: 1, claimedAt: 1, claimId: claimId("dup") },
      ]);
      expect(await booklet.totalMinted()).to.equal(1);
    });

    it("只有鑄造角色能鑄造", async function () {
      const { booklet, stranger, alice } = await loadFixture(deployFixture);
      await expect(
        booklet.connect(stranger).mintBatch([
          { to: alice.address, showId: SHOW_A, serial: 1, claimedAt: 1, claimId: claimId("x") },
        ])
      ).to.be.revertedWithCustomError(booklet, "AccessControlUnauthorizedAccount");
    });

    it("場次尚未設定內容時不能鑄造", async function () {
      const { booklet, minter, alice } = await loadFixture(deployFixture);
      await expect(
        booklet.connect(minter).mintBatch([
          { to: alice.address, showId: 99, serial: 1, claimedAt: 1, claimId: claimId("x") },
        ])
      ).to.be.revertedWithCustomError(booklet, "ShowNotConfigured");
    });

    it("不能鑄造給零地址", async function () {
      const { booklet, minter } = await loadFixture(deployFixture);
      await expect(
        booklet.connect(minter).mintBatch([
          { to: ethers.ZeroAddress, showId: SHOW_A, serial: 1, claimedAt: 1, claimId: claimId("x") },
        ])
      ).to.be.revertedWithCustomError(booklet, "InvalidRecipient");
    });
  });

  describe("不可轉讓", function () {
    it("持有人不能轉讓", async function () {
      const { booklet, alice, bob } = await loadFixture(mintedFixture);
      await expect(booklet.connect(alice).transferFrom(alice.address, bob.address, 1))
        .to.be.revertedWithCustomError(booklet, "Soulbound");
      await expect(
        booklet.connect(alice)["safeTransferFrom(address,address,uint256)"](alice.address, bob.address, 1)
      ).to.be.revertedWithCustomError(booklet, "Soulbound");
    });

    it("不能授權給別人", async function () {
      const { booklet, alice, bob } = await loadFixture(mintedFixture);
      await expect(booklet.connect(alice).approve(bob.address, 1)).to.be.revertedWithCustomError(booklet, "Soulbound");
      await expect(booklet.connect(alice).setApprovalForAll(bob.address, true))
        .to.be.revertedWithCustomError(booklet, "Soulbound");
    });

    it("管理者也不能轉讓別人的 token", async function () {
      const { booklet, admin, alice } = await loadFixture(mintedFixture);
      await expect(booklet.connect(admin).transferFrom(alice.address, admin.address, 1))
        .to.be.revertedWithCustomError(booklet, "Soulbound");
    });

    it("locked() 回傳 true", async function () {
      const { booklet } = await loadFixture(mintedFixture);
      expect(await booklet.locked(1)).to.equal(true);
    });
  });

  describe("搬遷", function () {
    it("把觀眾的 token 搬到新錢包，保留原本的編號與內容", async function () {
      const { booklet, migrator, alice, aliceOwnWallet } = await loadFixture(mintedFixture);
      const tx = booklet.connect(migrator).migrate([1, 3], aliceOwnWallet.address);
      await expect(tx).to.emit(booklet, "Migrated").withArgs(1, alice.address, aliceOwnWallet.address);
      await expect(tx).to.emit(booklet, "Migrated").withArgs(3, alice.address, aliceOwnWallet.address);

      expect(await booklet.ownerOf(1)).to.equal(aliceOwnWallet.address);
      expect(await booklet.ownerOf(3)).to.equal(aliceOwnWallet.address);
      expect(await booklet.balanceOf(alice.address)).to.equal(0);
      const t = await booklet.ticketOf(1);
      expect(t.serial).to.equal(1);
      expect(await booklet.tokenURI(1)).to.equal(URI_A);
    });

    it("搬遷後仍然不能轉讓", async function () {
      const { booklet, migrator, aliceOwnWallet, bob } = await loadFixture(mintedFixture);
      await booklet.connect(migrator).migrate([1], aliceOwnWallet.address);
      await expect(booklet.connect(aliceOwnWallet).transferFrom(aliceOwnWallet.address, bob.address, 1))
        .to.be.revertedWithCustomError(booklet, "Soulbound");
    });

    it("只有搬遷角色能搬", async function () {
      const { booklet, alice, stranger } = await loadFixture(mintedFixture);
      await expect(booklet.connect(alice).migrate([1], stranger.address))
        .to.be.revertedWithCustomError(booklet, "AccessControlUnauthorizedAccount");
    });

    it("不能搬到零地址", async function () {
      const { booklet, migrator } = await loadFixture(mintedFixture);
      await expect(booklet.connect(migrator).migrate([1], ethers.ZeroAddress))
        .to.be.revertedWithCustomError(booklet, "InvalidRecipient");
    });

    it("不存在的 token 會整筆失敗", async function () {
      const { booklet, migrator, bob } = await loadFixture(mintedFixture);
      await expect(booklet.connect(migrator).migrate([999], bob.address))
        .to.be.revertedWithCustomError(booklet, "ERC721NonexistentToken");
    });

    it("已在目標地址的 token 會略過", async function () {
      const { booklet, migrator, alice } = await loadFixture(mintedFixture);
      await expect(booklet.connect(migrator).migrate([1], alice.address)).not.to.emit(booklet, "Migrated");
      expect(await booklet.ownerOf(1)).to.equal(alice.address);
    });
  });

  describe("權限管理", function () {
    it("非管理者不能授予角色", async function () {
      const { booklet, stranger } = await loadFixture(deployFixture);
      await expect(booklet.connect(stranger).grantRole(await booklet.MINTER_ROLE(), stranger.address))
        .to.be.revertedWithCustomError(booklet, "AccessControlUnauthorizedAccount");
    });

    it("撤銷鑄造角色後就不能再鑄造（服務終止承諾第 6 條）", async function () {
      const { booklet, admin, minter, alice } = await loadFixture(deployFixture);
      await booklet.connect(admin).revokeRole(await booklet.MINTER_ROLE(), minter.address);
      await expect(
        booklet.connect(minter).mintBatch([
          { to: alice.address, showId: SHOW_A, serial: 1, claimedAt: 1, claimId: claimId("x") },
        ])
      ).to.be.revertedWithCustomError(booklet, "AccessControlUnauthorizedAccount");
    });

    it("管理者放棄權限後，沒有人能再授予角色", async function () {
      const { booklet, admin } = await loadFixture(deployFixture);
      const ADMIN = await booklet.DEFAULT_ADMIN_ROLE();
      await booklet.connect(admin).renounceRole(ADMIN, admin.address);
      await expect(booklet.connect(admin).grantRole(await booklet.MINTER_ROLE(), admin.address))
        .to.be.revertedWithCustomError(booklet, "AccessControlUnauthorizedAccount");
    });
  });

  describe("成本", function () {
    it("一次批次鑄造 50 份的 gas 用量", async function () {
      const { booklet, minter } = await loadFixture(deployFixture);
      const wallets = Array.from({ length: 50 }, () => ethers.Wallet.createRandom().address);
      const reqs = wallets.map((to, i) => ({
        to, showId: SHOW_A, serial: i + 1, claimedAt: 1763700000 + i, claimId: claimId("batch-" + i),
      }));
      const receipt = await (await booklet.connect(minter).mintBatch(reqs)).wait();
      console.log(`      50 份共 ${receipt.gasUsed} gas，平均每份 ${receipt.gasUsed / 50n} gas`);
      expect(await booklet.totalMinted()).to.equal(50);
    });
  });
});
