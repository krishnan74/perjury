// SPDX-License-Identifier: MIT
// The appeal layer (ADR 0007 item 4). A witness that fabricates internally
// consistent evidence can still fool the tribunal; a panel that re-derives
// independently is what catches it.
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {ClaimRegistry} from "../src/ClaimRegistry.sol";
import {Verdict, Status} from "../src/interfaces/IPerjury.sol";

contract AppealTest is Base {
    function setUp() public override {
        super.setUp();
        // A panel needs three members who are neither party, so the roster has to
        // be larger than the two-agent happy path.
        for (uint256 i; i < 4; ++i) {
            address a = address(uint160(0x5000 + i));
            vm.deal(a, STAKE);
            vm.prank(a);
            roster.registerAgent{value: STAKE}(
                keccak256(abi.encodePacked("panelist", i)), abi.encodePacked("pdns", i)
            );
            resolver.bind(abi.encodePacked("pdns", i), keccak256(abi.encodePacked("panelist", i)));
        }
    }

    function _appealed(Verdict original) internal returns (uint256 claimId, address witness) {
        claimId = _submit(alice);
        vrf.fulfill(vrf.nextRequestId() - 1, 1);
        witness = registry.claimOf(claimId).witness;
        _report(claimId, original);
        vm.deal(alice, alice.balance + 0.02 ether);
        vm.prank(alice);
        registry.appeal{value: 0.02 ether}(claimId);
        vrf.fulfill(vrf.nextRequestId() - 1, uint256(keccak256("panel")));
    }

    function test_verdictDoesNotSettleImmediately() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _report(id, Verdict.Mismatch);
        // A verdict nobody can contest is an assertion, not a judgement.
        assertEq(uint8(registry.claimOf(id).status), uint8(Status.Adjudicated));
        assertEq(registry.withdrawable(alice), 0, "nothing settles inside the window");
    }

    function test_finalizeIsPermissionless() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _report(id, Verdict.Match);
        vm.warp(block.timestamp + registry.CHALLENGE_WINDOW() + 1);
        // Anyone may finalise, so settlement never depends on a party choosing to act.
        vm.prank(address(0xBEEF));
        registry.finalize(id);
        assertEq(uint8(registry.claimOf(id).status), uint8(Status.Settled));
    }

    function test_cannotFinalizeInsideTheWindow() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _report(id, Verdict.Match);
        vm.expectRevert(ClaimRegistry.WindowOpen.selector);
        registry.finalize(id);
    }

    function test_cannotAppealAfterTheWindow() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _report(id, Verdict.Mismatch);
        vm.warp(block.timestamp + registry.CHALLENGE_WINDOW() + 1);
        vm.deal(alice, alice.balance + 0.02 ether);
        vm.prank(alice);
        vm.expectRevert(ClaimRegistry.WindowClosed.selector);
        registry.appeal{value: 0.02 ether}(id);
    }

    function test_onlyAPartyMayAppeal() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _report(id, Verdict.Mismatch);
        address stranger = address(0xDEAD);
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        vm.expectRevert(ClaimRegistry.NotAParty.selector);
        registry.appeal{value: 0.02 ether}(id);
    }

    function test_panelExcludesBothPartiesAndTheAppellant() public {
        (uint256 id, address witness) = _appealed(Verdict.Mismatch);
        address[] memory panel = registry.appealOf(id).panel;
        assertEq(panel.length, 3, "panel must be seated");
        for (uint256 i; i < panel.length; ++i) {
            assertTrue(panel[i] != alice, "claimant cannot review its own claim");
            assertTrue(panel[i] != witness, "original witness cannot review itself");
            for (uint256 j = i + 1; j < panel.length; ++j) {
                assertTrue(panel[i] != panel[j], "panel members must be distinct");
            }
        }
    }

    /// @dev The attack the appeal layer exists to close: a witness fabricates a
    ///      Mismatch, and an independent panel contradicts it.
    function test_overturnedVerdictSlashesTheLyingWitness() public {
        (uint256 id, address witness) = _appealed(Verdict.Mismatch);
        uint256 witnessStakeBefore = roster.stakeOf(witness);
        uint256 appellantBefore = registry.withdrawable(alice);

        vm.prank(CRE);
        sink.onPanelReport("", abi.encode(id, uint8(Verdict.Match)));

        assertEq(uint8(registry.claimOf(id).verdict), uint8(Verdict.Match), "panel verdict stands");
        assertLt(roster.stakeOf(witness), witnessStakeBefore, "contradicted witness is slashed");
        assertGt(registry.withdrawable(alice), appellantBefore, "appellant recovers its bond and claim bond");
    }

    /// @dev And the other direction: a nuisance appeal costs the appellant.
    function test_upheldVerdictForfeitsTheAppealBond() public {
        (uint256 id,) = _appealed(Verdict.Mismatch);
        uint256 forfeitedBefore = registry.forfeited();

        vm.prank(CRE);
        sink.onPanelReport("", abi.encode(id, uint8(Verdict.Mismatch)));

        assertEq(
            registry.forfeited(), forfeitedBefore + 0.02 ether + BOND, "appeal bond and claim bond forfeited"
        );
    }

    function test_panelVerdictFromNonTribunalReverts() public {
        (uint256 id,) = _appealed(Verdict.Mismatch);
        vm.prank(operator);
        vm.expectRevert();
        sink.onPanelReport("", abi.encode(id, uint8(Verdict.Match)));
    }

    function test_cannotAppealTwice() public {
        (uint256 id,) = _appealed(Verdict.Mismatch);
        vm.deal(alice, alice.balance + 0.02 ether);
        vm.prank(alice);
        vm.expectRevert();
        registry.appeal{value: 0.02 ether}(id);
    }
}
