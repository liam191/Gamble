// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title UPchain Casino — Commit-reveal gambling on UPchain
/// @notice Based on Dice2Win. Multi-token betting, UP-only payout via oracle.
/// @dev Whitelist-only. House edge 4%. Single-sequencer chain: blockhash is not
///      independent entropy. Settlement is croupier-only. This is a house-operated
///      game with commit-reveal structure, not a trustless provably fair system.

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IPriceFeed {
    function latestAnswer() external view returns (int256);
}

contract UPchainCasino is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Constants ──

    uint256 constant HOUSE_EDGE_PERCENT = 4;
    uint256 constant MIN_BET_USD = 20e8;
    uint256 constant MAX_BET_USD = 200e8;

    uint256 constant MAX_MODULO = 100;
    uint256 constant MAX_MASK_MODULO = 40;
    uint256 constant BET_EXPIRATION_BLOCKS = 250;

    uint256 constant MIN_ORACLE_PRICE = 1e4;
    uint256 constant MAX_ORACLE_PRICE = 1e14;

    uint256 constant POPCNT_MULT = 0x0000000000002000000000100000000008000000000400000000020000000001;
    uint256 constant POPCNT_MASK = 0x0001041041041041041041041041041041041041041041041041041041041041;
    uint256 constant POPCNT_MODULO = 0x3F;

    // ── Token addresses ──

    address constant WETH = 0xb416eACb2d3A0fCF53CC01cab2F387bf77dA03a5;
    address constant UP   = 0x65B7Bf774A173130a66967f5013c7652BACf022B;
    address constant SIDE = 0x5D5179b9FE335Dc1cA696914f356fB670B13712D;
    address constant SEC  = 0x2b020a10e2737C4aDd1ca3a503f67c705e15E540;
    address constant USP  = 0x8da87c3B6d989593Afe5E1Cb4E57e50B3c8b38cd;

    // ── Oracle feed addresses ──

    address constant FEED_WETH = 0x4e786DBe065061B9d36D610A5b3DDC2A8a5D7D77;
    address constant FEED_UP   = 0x7a863dA7D0F6eA378f62241DA4718cf8A9B8de21;
    address constant FEED_SIDE = 0x282c162932feA655F8c0a6D634e9Ed532b83ce05;
    address constant FEED_SEC  = 0x005E73B4313Bb01D9a3bf69206D29EfEaaAE7827;
    address constant FEED_USP  = 0xf4f863c7eA245Bdcf7F8cB31146C987069C5fD6d;

    address constant ETH_SENTINEL = address(0);

    // ── State ──

    /// @notice Hardcoded treasury address — all withdrawals are forced to this destination.
    /// @dev Even if the owner's private key is compromised, funds can only be sent here.
    ///      This address is immutable at the bytecode level (constant) and cannot be changed
    ///      by any on-chain transaction, including by the owner.
    address public constant TREASURY = 0x4baeFE982d6cbd2B8880007A0f8cb9161bD020f3;

    address public croupier;
    uint128 public lockedInBets;          // Total UP locked for potential payouts
    uint128 public lockedUPRefundExcess;  // Extra UP needed when UP bet refund > payout

    mapping(address => bool) public whitelisted;
    mapping(address => address) public tokenFeed;
    mapping(address => uint8) public tokenDecimals;
    mapping(address => uint256) public lockedRefunds; // Per-token refund reserves

    // ── Bet structure (3 slots, packed) ──

    struct Bet {
        // Slot 1
        uint128 amount;
        uint128 possibleWinUP;
        // Slot 2
        uint8   modulo;
        uint8   rollUnder;
        uint40  placeBlockNumber;
        uint40  mask;
        address gambler;
        // Slot 3
        address token;
    }

    mapping(uint256 => Bet) public bets;

    // ── Events ──

    event BetPlaced(
        uint256 indexed commit, address indexed player,
        address token, uint256 amount, uint8 modulo, uint8 rollUnder,
        uint256 possibleWinUP
    );
    event BetSettled(
        uint256 indexed commit, address indexed player,
        uint256 diceResult, uint256 payoutUP
    );
    event BetRefunded(
        uint256 indexed commit, address indexed player,
        address token, uint256 amount, bool refundedAsWETH
    );

    // ── Modifiers ──

    modifier onlyCroupier() {
        require(msg.sender == croupier, "!croupier");
        _;
    }

    modifier onlyWhitelisted() {
        require(whitelisted[msg.sender], "Not whitelisted");
        _;
    }

    // ── Constructor ──

    constructor(address _croupier) Ownable(msg.sender) {
        require(_croupier != address(0), "Zero croupier");
        croupier = _croupier;

        tokenFeed[ETH_SENTINEL] = FEED_WETH;
        tokenFeed[WETH] = FEED_WETH;
        tokenFeed[UP]   = FEED_UP;
        tokenFeed[SIDE] = FEED_SIDE;
        tokenFeed[SEC]  = FEED_SEC;
        tokenFeed[USP]  = FEED_USP;

        tokenDecimals[ETH_SENTINEL] = 18;
        tokenDecimals[WETH] = 18;
        tokenDecimals[UP]   = 18;
        tokenDecimals[SIDE] = 18;
        tokenDecimals[SEC]  = 18;
        tokenDecimals[USP]  = 18;
    }

    // ═══════════════════════════════════════════════════════════
    //  Admin
    // ═══════════════════════════════════════════════════════════

    function setCroupier(address _croupier) external onlyOwner {
        require(_croupier != address(0), "Zero address");
        croupier = _croupier;
    }

    function addToWhitelist(address[] calldata addrs) external onlyOwner {
        for (uint256 i = 0; i < addrs.length; i++) {
            whitelisted[addrs[i]] = true;
        }
    }

    function removeFromWhitelist(address[] calldata addrs) external onlyOwner {
        for (uint256 i = 0; i < addrs.length; i++) {
            whitelisted[addrs[i]] = false;
        }
    }

    /// @notice Withdraw non-UP tokens (ETH, WETH, SIDE, SEC, USP) to TREASURY.
    /// @dev Destination is hardcoded to TREASURY — the `to` parameter was intentionally
    ///      removed to prevent fund theft even if the owner's private key is compromised.
    ///      Active bet refund reserves (lockedRefunds) are always protected.
    /// @param token Token address to withdraw (address(0) for ETH)
    /// @param amount Amount to withdraw (in token's smallest unit)
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        require(token != UP, "Use withdrawUP for UP");
        if (token == ETH_SENTINEL) {
            require(address(this).balance >= lockedRefunds[ETH_SENTINEL] + amount, "Would underfund ETH refunds");
            (bool ok,) = TREASURY.call{value: amount}("");
            require(ok, "ETH transfer failed");
        } else {
            uint256 bal = IERC20(token).balanceOf(address(this));
            require(bal >= lockedRefunds[token] + amount, "Would underfund token refunds");
            IERC20(token).safeTransfer(TREASURY, amount);
        }
    }

    /// @notice Withdraw UP tokens to TREASURY, respecting worst-case reserve for all active bets.
    /// @dev Reserve = lockedInBets + lockedUPRefundExcess.
    ///      lockedInBets covers all potential payouts (UP-denominated).
    ///      lockedUPRefundExcess covers the extra UP needed when a UP bet's
    ///      refund amount exceeds its possibleWinUP (high-probability bets).
    ///      Destination is hardcoded to TREASURY — same security rationale as withdrawToken.
    /// @param amount Amount of UP to withdraw (18 decimals)
    function withdrawUP(uint256 amount) external onlyOwner {
        uint256 upBal = IERC20(UP).balanceOf(address(this));
        uint256 reserved = uint256(lockedInBets) + uint256(lockedUPRefundExcess);
        require(upBal >= reserved + amount, "Would underfund locked bets");
        IERC20(UP).safeTransfer(TREASURY, amount);
    }

    receive() external payable {}

    // ═══════════════════════════════════════════════════════════
    //  Oracle
    // ═══════════════════════════════════════════════════════════

    /// @dev UPchain feeds expose only latestAnswer() — no updatedAt/decimals.
    ///      Freshness cannot be verified on-chain (chain limitation).
    function getUsdPrice(address token) public view returns (uint256) {
        address feed = tokenFeed[token];
        require(feed != address(0), "No feed");

        int256 answer = IPriceFeed(feed).latestAnswer();
        require(answer > 0, "Bad oracle price");

        uint256 price = uint256(answer);
        require(price >= MIN_ORACLE_PRICE && price <= MAX_ORACLE_PRICE, "Oracle price out of range");
        return price;
    }

    function getUsdValue(address token, uint256 amount) public view returns (uint256) {
        return (amount * getUsdPrice(token)) / (10 ** tokenDecimals[token]);
    }

    function usdToUP(uint256 usdValue8) public view returns (uint256) {
        return (usdValue8 * 1e18) / getUsdPrice(UP);
    }

    /// @notice Total UP that must be retained in the contract for active bets.
    function totalUPReserved() public view returns (uint256) {
        return uint256(lockedInBets) + uint256(lockedUPRefundExcess);
    }

    // ═══════════════════════════════════════════════════════════
    //  Place Bet
    // ═══════════════════════════════════════════════════════════

    function placeBetETH(
        uint256 betMask, uint256 modulo,
        uint256 commitLastBlock, uint256 commit,
        uint8 v, bytes32 r, bytes32 s
    ) external payable onlyWhitelisted nonReentrant {
        _placeBet(ETH_SENTINEL, msg.value, betMask, modulo, commitLastBlock, commit, v, r, s);
    }

    function placeBetToken(
        address token, uint256 amount,
        uint256 betMask, uint256 modulo,
        uint256 commitLastBlock, uint256 commit,
        uint8 v, bytes32 r, bytes32 s
    ) external onlyWhitelisted nonReentrant {
        require(
            token == WETH || token == UP || token == SIDE || token == SEC || token == USP,
            "Unsupported token"
        );
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _placeBet(token, amount, betMask, modulo, commitLastBlock, commit, v, r, s);
    }

    struct PlaceBetParams {
        address token;
        uint256 amount;
        uint256 betMask;
        uint256 modulo;
        uint256 commitLastBlock;
        uint256 commit;
        uint8   v;
        bytes32 r;
        bytes32 s;
    }

    function _placeBet(
        address token, uint256 amount,
        uint256 betMask, uint256 modulo,
        uint256 commitLastBlock, uint256 commit,
        uint8 v, bytes32 r, bytes32 s
    ) internal {
        PlaceBetParams memory p = PlaceBetParams(token, amount, betMask, modulo, commitLastBlock, commit, v, r, s);
        _placeBetInner(p);
    }

    function _placeBetInner(PlaceBetParams memory p) internal {
        Bet storage bet = bets[p.commit];
        require(bet.gambler == address(0), "Bet exists");

        require(p.modulo > 1 && p.modulo <= MAX_MODULO, "Bad modulo");
        require(p.amount > 0, "Zero amount");

        if (p.modulo <= MAX_MASK_MODULO) {
            require(p.betMask > 0 && p.betMask < (1 << p.modulo), "Bad mask for modulo");
        } else {
            require(p.betMask > 0 && p.betMask <= p.modulo, "Bad mask for high modulo");
        }

        {
            uint256 usdVal = getUsdValue(p.token, p.amount);
            require(usdVal >= MIN_BET_USD, "Below min bet");
            require(usdVal <= MAX_BET_USD, "Above max bet");
        }

        require(block.number <= p.commitLastBlock, "Commit expired");
        {
            bytes32 msgHash = keccak256(abi.encode(
                address(this), block.chainid, p.commitLastBlock, p.commit,
                msg.sender, p.token, p.amount, p.betMask, p.modulo
            ));
            bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(msgHash);
            address recovered = ECDSA.recover(ethSignedHash, p.v, p.r, p.s);
            require(recovered == croupier, "Invalid signature");
        }

        uint256 rollUnder;
        uint256 mask;
        if (p.modulo <= MAX_MASK_MODULO) {
            rollUnder = ((p.betMask * POPCNT_MULT) & POPCNT_MASK) % POPCNT_MODULO;
            mask = p.betMask;
        } else {
            rollUnder = p.betMask;
        }

        uint256 possibleWin = _calcWinAmountUP(p.token, p.amount, p.modulo, rollUnder);
        require(possibleWin > 0, "Zero win");

        // Lock UP for payout
        lockedInBets += uint128(possibleWin);

        // For UP bets: if refund amount > payout, track the excess
        // This ensures the contract always has enough UP for the worst case
        // (some bets refunded, others won) across all active bets.
        if (p.token == UP && p.amount > possibleWin) {
            lockedUPRefundExcess += uint128(p.amount - possibleWin);
        }

        // Solvency check: UP balance must cover all potential obligations
        require(totalUPReserved() <= IERC20(UP).balanceOf(address(this)), "House underfunded");

        // Lock refund reserve for non-UP tokens
        lockedRefunds[p.token] += p.amount;

        // Store
        bet.amount = uint128(p.amount);
        bet.possibleWinUP = uint128(possibleWin);
        bet.modulo = uint8(p.modulo);
        bet.rollUnder = uint8(rollUnder);
        bet.placeBlockNumber = uint40(block.number);
        bet.mask = uint40(mask);
        bet.gambler = msg.sender;
        bet.token = p.token;

        emit BetPlaced(p.commit, msg.sender, p.token, p.amount, uint8(p.modulo), uint8(rollUnder), possibleWin);
    }

    // ═══════════════════════════════════════════════════════════
    //  Settle Bet
    // ═══════════════════════════════════════════════════════════

    function settleBet(uint256 reveal, bytes32 blockHash) external onlyCroupier nonReentrant {
        uint256 commit = uint256(keccak256(abi.encodePacked(reveal)));

        Bet storage bet = bets[commit];
        uint256 placeBlockNumber = bet.placeBlockNumber;
        uint128 amount = bet.amount;
        uint128 possibleWin = bet.possibleWinUP;
        address gambler = bet.gambler;
        address token = bet.token;

        require(amount != 0, "Bet not active");
        require(block.number > placeBlockNumber, "Too early");
        require(block.number <= placeBlockNumber + BET_EXPIRATION_BLOCKS, "Bet expired");
        require(blockhash(placeBlockNumber) == blockHash, "Bad blockhash");

        bytes32 entropy = keccak256(abi.encodePacked(reveal, blockHash));
        uint256 dice = uint256(entropy) % bet.modulo;

        bool won;
        if (bet.modulo <= MAX_MASK_MODULO) {
            won = (2 ** dice) & bet.mask != 0;
        } else {
            won = dice < bet.rollUnder;
        }

        // Unlock
        lockedInBets -= possibleWin;
        lockedRefunds[token] -= amount;
        if (token == UP && amount > possibleWin) {
            lockedUPRefundExcess -= uint128(amount - possibleWin);
        }
        bet.amount = 0;

        uint256 payoutUP = 0;
        if (won) {
            payoutUP = possibleWin;
            IERC20(UP).safeTransfer(gambler, payoutUP);
        }

        emit BetSettled(commit, gambler, dice, payoutUP);
    }

    // ═══════════════════════════════════════════════════════════
    //  Refund
    // ═══════════════════════════════════════════════════════════

    function refundBet(uint256 commit) external nonReentrant {
        Bet storage bet = bets[commit];
        uint128 amount = bet.amount;
        uint128 possibleWin = bet.possibleWinUP;
        address gambler = bet.gambler;
        address token = bet.token;

        require(amount != 0, "Bet not active");
        require(block.number > bet.placeBlockNumber + BET_EXPIRATION_BLOCKS, "Not expired");

        lockedInBets -= possibleWin;
        lockedRefunds[token] -= amount;
        if (token == UP && amount > possibleWin) {
            lockedUPRefundExcess -= uint128(amount - possibleWin);
        }
        bet.amount = 0;

        bool refundedAsWETH = false;
        if (token == ETH_SENTINEL) {
            (bool ok,) = gambler.call{value: amount}("");
            if (!ok) {
                (bool depOk,) = WETH.call{value: amount}(abi.encodeWithSignature("deposit()"));
                require(depOk, "WETH deposit failed");
                IERC20(WETH).safeTransfer(gambler, amount);
                refundedAsWETH = true;
            }
        } else {
            IERC20(token).safeTransfer(gambler, amount);
        }

        emit BetRefunded(commit, gambler, token, amount, refundedAsWETH);
    }

    // ═══════════════════════════════════════════════════════════
    //  Win calculation
    // ═══════════════════════════════════════════════════════════

    function _calcWinAmountUP(
        address token, uint256 amount,
        uint256 modulo, uint256 rollUnder
    ) internal view returns (uint256) {
        require(rollUnder > 0 && rollUnder <= modulo, "Bad rollUnder");

        uint256 houseEdge = (amount * HOUSE_EDGE_PERCENT) / 100;
        require(houseEdge < amount, "Bet too small");

        uint256 winInToken = ((amount - houseEdge) * modulo) / rollUnder;
        uint256 winUsd = getUsdValue(token, winInToken);
        return usdToUP(winUsd);
    }

    function previewWinUP(
        address token, uint256 amount,
        uint256 modulo, uint256 rollUnder
    ) external view returns (uint256) {
        return _calcWinAmountUP(token, amount, modulo, rollUnder);
    }
}
