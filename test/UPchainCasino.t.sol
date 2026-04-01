// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {UPchainCasino} from "../src/UPchainCasino.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockFeed {
    int256 public price;
    constructor(int256 _price) { price = _price; }
    function latestAnswer() external view returns (int256) { return price; }
}

contract MockERC20 {
    string public name;
    string public symbol;
    uint8  public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _n, string memory _s) { name = _n; symbol = _s; }
    function mint(address to, uint256 a) external { balanceOf[to] += a; totalSupply += a; }
    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[to] += a; return true;
    }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
}

contract UPchainCasinoTest is Test {
    receive() external payable {}

    UPchainCasino casino;
    address owner = address(this);
    uint256 croupierPk = 0xBEEF;
    address croupier = vm.addr(croupierPk);
    address player = address(0xCAFE);
    address player2 = address(0xBEAD);

    address constant UP   = 0x65B7Bf774A173130a66967f5013c7652BACf022B;
    address constant FEED_WETH = 0x4e786DBe065061B9d36D610A5b3DDC2A8a5D7D77;
    address constant FEED_UP   = 0x7a863dA7D0F6eA378f62241DA4718cf8A9B8de21;
    address constant FEED_SIDE = 0x282c162932feA655F8c0a6D634e9Ed532b83ce05;
    address constant FEED_SEC  = 0x005E73B4313Bb01D9a3bf69206D29EfEaaAE7827;
    address constant FEED_USP  = 0xf4f863c7eA245Bdcf7F8cB31146C987069C5fD6d;

    function setUp() public {
        _deployFeedAt(FEED_WETH, 2000e8);
        _deployFeedAt(FEED_UP,   0.2e8);
        _deployFeedAt(FEED_SIDE, 0.4e8);
        _deployFeedAt(FEED_SEC,  0.8e8);
        _deployFeedAt(FEED_USP,  1e8);

        _deployTokenAt(0xb416eACb2d3A0fCF53CC01cab2F387bf77dA03a5, "WETH","WETH");
        _deployTokenAt(UP, "UP","UP");
        _deployTokenAt(0x5D5179b9FE335Dc1cA696914f356fB670B13712D, "SIDE","SIDE");
        _deployTokenAt(0x2b020a10e2737C4aDd1ca3a503f67c705e15E540, "SEC","SEC");
        _deployTokenAt(0x8da87c3B6d989593Afe5E1Cb4E57e50B3c8b38cd, "USP","USP");

        casino = new UPchainCasino(croupier);

        address[] memory a = new address[](2);
        a[0] = player; a[1] = player2;
        casino.addToWhitelist(a);

        MockERC20(UP).mint(address(casino), 1_000_000e18);
        vm.deal(player, 10 ether);
        vm.deal(player2, 10 ether);
    }

    function _deployFeedAt(address t, int256 p) internal {
        MockFeed f = new MockFeed(p);
        vm.etch(t, address(f).code);
        vm.store(t, bytes32(uint256(0)), bytes32(uint256(uint128(p < 0 ? uint256(0) : uint256(p)))));
    }

    function _deployTokenAt(address t, string memory n, string memory s) internal {
        MockERC20 tk = new MockERC20(n, s);
        vm.etch(t, address(tk).code);
    }

    // Full-scope signature: address(this), chainid, commitLastBlock, commit, player, token, amount, betMask, modulo
    function _sign(
        uint256 secret, address _player,
        address _token, uint256 _amount, uint256 _betMask, uint256 _modulo
    ) internal view returns (uint256 commit, uint256 clb, uint8 v, bytes32 r, bytes32 s) {
        commit = uint256(keccak256(abi.encodePacked(secret)));
        clb = block.number + 250;
        bytes32 h = keccak256(abi.encode(address(casino), block.chainid, clb, commit, _player, _token, _amount, _betMask, _modulo));
        bytes32 eth = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
        (v, r, s) = vm.sign(croupierPk, eth);
    }

    // ═══════════════════════════════════════════════════════════
    //  Basic
    // ═══════════════════════════════════════════════════════════

    function test_deployment() public view {
        assertEq(casino.owner(), owner);
        assertEq(casino.croupier(), croupier);
        assertEq(casino.whitelisted(player), true);
    }

    function test_oraclePrices() public view {
        assertEq(casino.getUsdPrice(address(0)), 2000e8);
        assertEq(casino.getUsdPrice(UP), 0.2e8);
    }

    function test_previewWinUP_coinFlip() public view {
        assertEq(casino.previewWinUP(address(0), 0.01 ether, 2, 1), 192e18);
    }

    function test_previewWinUP_dice() public view {
        assertEq(casino.previewWinUP(address(0), 0.01 ether, 6, 1), 576e18);
    }

    // ═══════════════════════════════════════════════════════════
    //  Full Bet Flow
    // ═══════════════════════════════════════════════════════════

    function test_placeBet_and_settle() public {
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(111, player, address(0), 0.01 ether, 1, 2);

        vm.prank(player);
        casino.placeBetETH{value: 0.01 ether}(1, 2, clb, c, v, r, s);

        (uint128 amt, uint128 pw,,,,, address g,) = casino.bets(c);
        assertEq(amt, 0.01 ether);
        assertEq(pw, 192e18);
        assertEq(g, player);
        assertEq(casino.lockedRefunds(address(0)), 0.01 ether);

        vm.roll(block.number + 1);
        vm.prank(croupier);
        casino.settleBet(111, blockhash(block.number - 1));

        assertEq(casino.lockedInBets(), 0);
        assertEq(casino.lockedRefunds(address(0)), 0);
    }

    // ═══════════════════════════════════════════════════════════
    //  Oracle change — frozen possibleWinUP
    // ═══════════════════════════════════════════════════════════

    function test_oracleChange_noUnderflow() public {
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(222, player, address(0), 0.01 ether, 1, 2);
        vm.prank(player);
        casino.placeBetETH{value: 0.01 ether}(1, 2, clb, c, v, r, s);

        vm.store(FEED_UP, bytes32(uint256(0)), bytes32(uint256(0.1e8))); // UP drops

        vm.roll(block.number + 1);
        vm.prank(croupier);
        casino.settleBet(222, blockhash(block.number - 1));
        assertEq(casino.lockedInBets(), 0);
    }

    function test_oracleChange_noLeak() public {
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(333, player, address(0), 0.01 ether, 1, 2);
        vm.prank(player);
        casino.placeBetETH{value: 0.01 ether}(1, 2, clb, c, v, r, s);

        vm.store(FEED_UP, bytes32(uint256(0)), bytes32(uint256(0.4e8))); // UP rises

        vm.roll(block.number + 1);
        vm.prank(croupier);
        casino.settleBet(333, blockhash(block.number - 1));
        assertEq(casino.lockedInBets(), 0);
    }

    // ═══════════════════════════════════════════════════════════
    //  Signature — full parameter binding
    // ═══════════════════════════════════════════════════════════

    function test_frontRun_otherPlayer_reverts() public {
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(444, player, address(0), 0.01 ether, 1, 2);
        vm.prank(player2); // wrong player
        vm.expectRevert("Invalid signature");
        casino.placeBetETH{value: 0.01 ether}(1, 2, clb, c, v, r, s);
    }

    function test_parameterTampering_amount_reverts() public {
        // Sig for 0.01 ETH, but user sends 0.05 ETH
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(555, player, address(0), 0.01 ether, 1, 2);
        vm.prank(player);
        vm.expectRevert("Invalid signature");
        casino.placeBetETH{value: 0.05 ether}(1, 2, clb, c, v, r, s);
    }

    function test_parameterTampering_modulo_reverts() public {
        // Sig for modulo=2, but user uses modulo=6
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(666, player, address(0), 0.01 ether, 1, 2);
        vm.prank(player);
        vm.expectRevert("Invalid signature");
        casino.placeBetETH{value: 0.01 ether}(1, 6, clb, c, v, r, s);
    }

    function test_parameterTampering_betMask_reverts() public {
        // Sig for mask=1 (heads), user tries mask=2 (tails)
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(777, player, address(0), 0.01 ether, 1, 2);
        vm.prank(player);
        vm.expectRevert("Invalid signature");
        casino.placeBetETH{value: 0.01 ether}(2, 2, clb, c, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════
    //  withdrawToken blocks UP / protects refund reserves
    // ═══════════════════════════════════════════════════════════

    function test_withdrawToken_blocksUP() public {
        vm.expectRevert("Use withdrawUP for UP");
        casino.withdrawToken(UP, owner, 1e18);
    }

    function test_withdrawETH_protectsRefundReserve() public {
        vm.deal(address(casino), 1 ether);

        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(888, player, address(0), 0.01 ether, 1, 2);
        vm.prank(player);
        casino.placeBetETH{value: 0.01 ether}(1, 2, clb, c, v, r, s);

        vm.expectRevert("Would underfund ETH refunds");
        casino.withdrawToken(address(0), owner, 1.01 ether);

        casino.withdrawToken(address(0), owner, 1 ether); // available portion OK
    }

    // ═══════════════════════════════════════════════════════════
    //  UP bet solvency — lockedUPRefundExcess
    // ═══════════════════════════════════════════════════════════

    function test_upBet_highProb_reserveCorrect() public {
        // UP bet: 100 UP, modulo=100, rollUnder=99 (99% win chance)
        // possibleWin = (100*0.96) * 100/99 ≈ 96.97 UP
        // refund = 100 UP > possibleWin → excess = 100 - 96.97 ≈ 3.03 UP
        uint256 upAmount = 100e18;
        MockERC20(UP).mint(player, upAmount);
        vm.prank(player);
        MockERC20(UP).approve(address(casino), upAmount);

        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(3001, player, UP, upAmount, 99, 100);
        vm.prank(player);
        casino.placeBetToken(UP, upAmount, 99, 100, clb, c, v, r, s);

        // lockedUPRefundExcess should be > 0
        uint128 excess = casino.lockedUPRefundExcess();
        assertGt(excess, 0, "excess should be positive for high-prob UP bet");

        // totalUPReserved = lockedInBets + excess
        uint256 reserved = casino.totalUPReserved();
        uint128 locked = casino.lockedInBets();
        assertEq(reserved, uint256(locked) + uint256(excess));

        // Settle — excess should return to 0
        vm.roll(block.number + 1);
        vm.prank(croupier);
        casino.settleBet(3001, blockhash(block.number - 1));

        assertEq(casino.lockedInBets(), 0);
        assertEq(casino.lockedUPRefundExcess(), 0);
    }

    function test_upBet_lowProb_noExcess() public {
        // UP bet: 100 UP, modulo=100, rollUnder=1 (1% win chance)
        // possibleWin = (100*0.96) * 100/1 = 9600 UP >> 100 refund → no excess
        uint256 upAmount = 100e18;
        MockERC20(UP).mint(player, upAmount);
        vm.prank(player);
        MockERC20(UP).approve(address(casino), upAmount);

        // Need enough UP in house for 9600 UP payout
        MockERC20(UP).mint(address(casino), 10_000e18);

        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(3002, player, UP, upAmount, 1, 100);
        vm.prank(player);
        casino.placeBetToken(UP, upAmount, 1, 100, clb, c, v, r, s);

        assertEq(casino.lockedUPRefundExcess(), 0, "no excess for low-prob bet");
    }

    function test_mixed_upBets_worstCase() public {
        // UP=$0.20, so 500 UP = $100 (within $20-$200 range)
        // Bet A: UP 500, modulo=100, rollUnder=99 → possibleWin ≈ 484.85, excess ≈ 15.15
        // Bet B: UP 500, modulo=100, rollUnder=1  → possibleWin = 48000, excess = 0
        // Worst case: A refunded(500) + B won(48000) = 48500 UP
        // totalReserved should be ≈ (484.85+48000) + 15.15 = 48500

        MockERC20(UP).mint(player, 1000e18);
        vm.prank(player);
        MockERC20(UP).approve(address(casino), 1000e18);

        // Bet A: high probability
        (uint256 cA, uint256 clbA, uint8 vA, bytes32 rA, bytes32 sA) = _sign(3003, player, UP, 500e18, 99, 100);
        vm.prank(player);
        casino.placeBetToken(UP, 500e18, 99, 100, clbA, cA, vA, rA, sA);

        uint128 excessAfterA = casino.lockedUPRefundExcess();
        assertGt(excessAfterA, 0, "high-prob bet should have excess");

        // Bet B: low probability
        (uint256 cB, uint256 clbB, uint8 vB, bytes32 rB, bytes32 sB) = _sign(3004, player, UP, 500e18, 1, 100);
        vm.prank(player);
        casino.placeBetToken(UP, 500e18, 1, 100, clbB, cB, vB, rB, sB);

        uint256 reserved = casino.totalUPReserved();
        uint256 lockedBets = casino.lockedInBets();
        uint256 excess = casino.lockedUPRefundExcess();

        // reserved = lockedInBets + excess
        assertEq(reserved, lockedBets + excess);
        // excess unchanged (bet B has no excess)
        assertEq(excess, excessAfterA);
    }

    // ═══════════════════════════════════════════════════════════
    //  Mask validation
    // ═══════════════════════════════════════════════════════════

    function test_invalidMask_dice_reverts() public {
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(901, player, address(0), 0.01 ether, 128, 6);
        vm.prank(player);
        vm.expectRevert("Bad mask for modulo");
        casino.placeBetETH{value: 0.01 ether}(128, 6, clb, c, v, r, s);
    }

    function test_validMask_dice_works() public {
        // mask=63 (0b111111) for modulo=6 — all 6 outcomes
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(902, player, address(0), 0.01 ether, 63, 6);
        vm.prank(player);
        casino.placeBetETH{value: 0.01 ether}(63, 6, clb, c, v, r, s);
        (uint128 amt,,,,,,,) = casino.bets(c);
        assertGt(amt, 0);
    }

    // ═══════════════════════════════════════════════════════════
    //  Oracle sanity bounds
    // ═══════════════════════════════════════════════════════════

    function test_oracleTooLow_reverts() public {
        vm.store(FEED_UP, bytes32(uint256(0)), bytes32(uint256(1)));
        vm.expectRevert("Oracle price out of range");
        casino.getUsdPrice(UP);
    }

    // ═══════════════════════════════════════════════════════════
    //  Access Control
    // ═══════════════════════════════════════════════════════════

    function test_nonWhitelisted_reverts() public {
        address rando = address(0xDEAD);
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(1001, rando, address(0), 0.01 ether, 1, 2);
        vm.deal(rando, 1 ether);
        vm.prank(rando);
        vm.expectRevert("Not whitelisted");
        casino.placeBetETH{value: 0.01 ether}(1, 2, clb, c, v, r, s);
    }

    function test_belowMinBet_reverts() public {
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(1002, player, address(0), 0.001 ether, 1, 2);
        vm.prank(player);
        vm.expectRevert("Below min bet");
        casino.placeBetETH{value: 0.001 ether}(1, 2, clb, c, v, r, s);
    }

    function test_aboveMaxBet_reverts() public {
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(1003, player, address(0), 1 ether, 1, 2);
        vm.prank(player);
        vm.expectRevert("Above max bet");
        casino.placeBetETH{value: 1 ether}(1, 2, clb, c, v, r, s);
    }

    function test_onlyCroupier_settle_reverts() public {
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(1004, player, address(0), 0.01 ether, 1, 2);
        vm.prank(player);
        casino.placeBetETH{value: 0.01 ether}(1, 2, clb, c, v, r, s);

        vm.roll(block.number + 1);
        vm.prank(player);
        vm.expectRevert("!croupier");
        casino.settleBet(1004, blockhash(block.number - 1));
    }

    // ═══════════════════════════════════════════════════════════
    //  Refund
    // ═══════════════════════════════════════════════════════════

    function test_refundBet() public {
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(2001, player, address(0), 0.01 ether, 1, 2);
        uint256 bal = player.balance;
        vm.prank(player);
        casino.placeBetETH{value: 0.01 ether}(1, 2, clb, c, v, r, s);

        vm.roll(block.number + 251);
        casino.refundBet(c);

        assertEq(player.balance, bal);
        assertEq(casino.lockedInBets(), 0);
        assertEq(casino.lockedRefunds(address(0)), 0);
    }

    function test_refundBet_tooEarly_reverts() public {
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(2002, player, address(0), 0.01 ether, 1, 2);
        vm.prank(player);
        casino.placeBetETH{value: 0.01 ether}(1, 2, clb, c, v, r, s);

        vm.roll(block.number + 100);
        vm.expectRevert("Not expired");
        casino.refundBet(c);
    }

    function test_refundBet_oracleChanged() public {
        (uint256 c, uint256 clb, uint8 v, bytes32 r, bytes32 s) = _sign(2003, player, address(0), 0.01 ether, 1, 2);
        vm.prank(player);
        casino.placeBetETH{value: 0.01 ether}(1, 2, clb, c, v, r, s);

        vm.store(FEED_UP, bytes32(uint256(0)), bytes32(uint256(0.1e8)));
        vm.roll(block.number + 251);
        casino.refundBet(c);
        assertEq(casino.lockedInBets(), 0);
    }

    function test_constructor_zeroCroupier_reverts() public {
        vm.expectRevert("Zero croupier");
        new UPchainCasino(address(0));
    }

    function test_whitelistManagement() public {
        address u = address(0xBEEF);
        assertEq(casino.whitelisted(u), false);
        address[] memory a = new address[](1);
        a[0] = u;
        casino.addToWhitelist(a);
        assertEq(casino.whitelisted(u), true);
        casino.removeFromWhitelist(a);
        assertEq(casino.whitelisted(u), false);
    }
}
