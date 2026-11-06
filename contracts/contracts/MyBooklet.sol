// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title 吾冊 My Booklet 數位節目單
/// @notice 每一次入場領取鑄造一個 token，記錄場次、入場編號與領取時間。
///         token 不可轉讓（ERC-5192）；只有搬遷角色能把觀眾的 token 移到觀眾本人的新錢包。
///         本合約不可升級、不可暫停。
contract MyBooklet is ERC721, AccessControl {
    // ---------------------------------------------------------------
    // 角色
    // ---------------------------------------------------------------

    /// 鑄造：後端發送錢包
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    /// 搬遷：觀眾本人驗證後，把 token 移到新地址
    bytes32 public constant MIGRATOR_ROLE = keccak256("MIGRATOR_ROLE");
    /// 場次內容：設定、凍結場次的內容網址
    bytes32 public constant CURATOR_ROLE = keccak256("CURATOR_ROLE");

    // ---------------------------------------------------------------
    // 資料
    // ---------------------------------------------------------------

    struct Ticket {
        uint64 showId;     // 場次 ID（對應資料庫 shows）
        uint32 serial;     // 入場編號（該場次第幾位領取）
        uint64 claimedAt;  // 領取時間（Unix 秒，由後端依實際領取時間寫入）
    }

    struct MintRequest {
        address to;
        uint64 showId;
        uint32 serial;
        uint64 claimedAt;
        bytes32 claimId;   // 資料庫領取紀錄的唯一 ID，防止重複鑄造
    }

    uint256 private _nextTokenId = 1;

    mapping(uint256 tokenId => Ticket) private _tickets;
    /// claimId 對應的 tokenId；0 代表尚未鑄造
    mapping(bytes32 claimId => uint256 tokenId) public tokenOfClaim;
    /// 場次對應的 metadata 網址（Arweave）
    mapping(uint64 showId => string uri) public showURI;
    /// 場次內容凍結後不能再修改
    mapping(uint64 showId => bool frozen) public showFrozen;

    /// 搬遷進行中才允許移動 token
    bool private _migrating;

    // ---------------------------------------------------------------
    // 事件
    // ---------------------------------------------------------------

    /// ERC-5192：token 被鎖定（不可轉讓）
    event Locked(uint256 tokenId);
    event Claimed(bytes32 indexed claimId, uint256 indexed tokenId, address indexed to, uint64 showId, uint32 serial);
    event ClaimSkipped(bytes32 indexed claimId, uint256 indexed existingTokenId);
    event Migrated(uint256 indexed tokenId, address indexed from, address indexed to);
    event ShowURISet(uint64 indexed showId, string uri);
    event ShowFrozen(uint64 indexed showId);

    // ---------------------------------------------------------------
    // 錯誤
    // ---------------------------------------------------------------

    error Soulbound();
    error ShowNotConfigured(uint64 showId);
    error ShowIsFrozen(uint64 showId);
    error EmptyURI();
    error InvalidRecipient();

    constructor(address admin) ERC721(unicode"吾冊 My Booklet", "BOOKLET") {
        if (admin == address(0)) revert InvalidRecipient();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ---------------------------------------------------------------
    // 場次內容
    // ---------------------------------------------------------------

    function setShowURI(uint64 showId, string calldata uri) external onlyRole(CURATOR_ROLE) {
        if (showFrozen[showId]) revert ShowIsFrozen(showId);
        if (bytes(uri).length == 0) revert EmptyURI();
        showURI[showId] = uri;
        emit ShowURISet(showId, uri);
    }

    /// 凍結後，此場次的內容網址永遠不能更改
    function freezeShow(uint64 showId) external onlyRole(CURATOR_ROLE) {
        if (bytes(showURI[showId]).length == 0) revert ShowNotConfigured(showId);
        showFrozen[showId] = true;
        emit ShowFrozen(showId);
    }

    // ---------------------------------------------------------------
    // 鑄造
    // ---------------------------------------------------------------

    /// @notice 批次鑄造。已鑄造過的 claimId 會略過（不 revert），
    ///         讓後端重試時不會整批失敗，也不會重複鑄造。
    function mintBatch(MintRequest[] calldata requests) external onlyRole(MINTER_ROLE) {
        for (uint256 i = 0; i < requests.length; i++) {
            MintRequest calldata r = requests[i];

            uint256 existing = tokenOfClaim[r.claimId];
            if (existing != 0) {
                emit ClaimSkipped(r.claimId, existing);
                continue;
            }
            if (r.to == address(0)) revert InvalidRecipient();
            if (bytes(showURI[r.showId]).length == 0) revert ShowNotConfigured(r.showId);

            uint256 tokenId = _nextTokenId++;
            tokenOfClaim[r.claimId] = tokenId;
            _tickets[tokenId] = Ticket({showId: r.showId, serial: r.serial, claimedAt: r.claimedAt});
            _mint(r.to, tokenId);

            emit Locked(tokenId);
            emit Claimed(r.claimId, tokenId, r.to, r.showId, r.serial);
        }
    }

    // ---------------------------------------------------------------
    // 搬遷
    // ---------------------------------------------------------------

    /// @notice 觀眾本人在網站上證明擁有新錢包後，由搬遷角色執行。
    ///         保留原 tokenId、場次、入場編號與領取時間。
    function migrate(uint256[] calldata tokenIds, address to) external onlyRole(MIGRATOR_ROLE) {
        if (to == address(0)) revert InvalidRecipient();
        _migrating = true;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            address from = _requireOwned(tokenId);
            if (from == to) continue;
            _transfer(from, to, tokenId);
            emit Migrated(tokenId, from, to);
        }
        _migrating = false;
    }

    // ---------------------------------------------------------------
    // 查詢
    // ---------------------------------------------------------------

    function ticketOf(uint256 tokenId) external view returns (Ticket memory) {
        _requireOwned(tokenId);
        return _tickets[tokenId];
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return showURI[_tickets[tokenId].showId];
    }

    /// ERC-5192：所有 token 永遠鎖定
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    // ---------------------------------------------------------------
    // 不可轉讓
    // ---------------------------------------------------------------

    /// 只允許鑄造（from 為 0）與搬遷中的移動；其餘轉讓、燒毀一律拒絕。
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && !_migrating) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        // 0xb45a3c0e = ERC-5192
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId);
    }
}
