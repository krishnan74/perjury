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
            resolver.bind(abi.encodePacked("pdns", i), keccak256(abi.encodePacked("panelist", i)));
            resolver.setBinding(abi.encodePacked("pdns", i), a);
            vm.prank(a);
            roster.registerAgent{value: STAKE}(
                keccak256(abi.encodePacked("panelist", i)), abi.encodePacked("pdns", i)
            );
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
        sink.onReport("", abi.encode(uint8(1), id, uint8(Verdict.Match), bytes32(0)));
        registry.finalize(id); // settlement is separate, so the report stays cheap

        assertEq(uint8(registry.claimOf(id).verdict), uint8(Verdict.Match), "panel verdict stands");
        assertLt(roster.stakeOf(witness), witnessStakeBefore, "contradicted witness is slashed");
        assertGt(registry.withdrawable(alice), appellantBefore, "appellant recovers its bond and claim bond");
    }

    /// @dev And the other direction: a nuisance appeal costs the appellant.
    function test_upheldVerdictForfeitsTheAppealBond() public {
        (uint256 id,) = _appealed(Verdict.Mismatch);
        uint256 forfeitedBefore = registry.forfeited();

        vm.prank(CRE);
        sink.onReport("", abi.encode(uint8(1), id, uint8(Verdict.Mismatch), bytes32(0)));
        registry.finalize(id);

        assertEq(
            registry.forfeited(), forfeitedBefore + 0.02 ether + BOND, "appeal bond and claim bond forfeited"
        );
    }

    /// @dev A panel report must stay cheap enough for the Forwarder's gas
    ///      allowance: it records, it does not settle.
    function test_panelReportRecordsButDoesNotSettle() public {
        (uint256 id,) = _appealed(Verdict.Mismatch);
        vm.prank(CRE);
        sink.onReport("", abi.encode(uint8(1), id, uint8(Verdict.Mismatch), bytes32(0)));
        assertEq(uint8(registry.claimOf(id).status), uint8(Status.Adjudicated), "recorded, not settled");
        registry.finalize(id);
        assertEq(uint8(registry.claimOf(id).status), uint8(Status.Settled));
    }

    function test_panelVerdictFromNonTribunalReverts() public {
        (uint256 id,) = _appealed(Verdict.Mismatch);
        vm.prank(operator);
        vm.expectRevert();
        sink.onReport("", abi.encode(uint8(1), id, uint8(Verdict.Match), bytes32(0)));
    }

    /// @dev Observed on Sepolia: a panel VRF callback ran out of gas, so the
    ///      request was marked fulfilled and nothing happened — leaving the appeal
    ///      open and the bond locked with no event to react to.
    function test_appealWhosePanelNeverSeatsCanBeAbandoned() public {
        uint256 id = _submit(alice);
        vrf.fulfill(vrf.nextRequestId() - 1, 1);
        _report(id, Verdict.Mismatch);
        vm.deal(alice, alice.balance + 0.02 ether);
        vm.prank(alice);
        registry.appeal{value: 0.02 ether}(id);
        // VRF never calls back.

        vm.warp(block.timestamp + registry.CHALLENGE_WINDOW() + registry.RESPONSE_WINDOW() + 1);
        uint256 before = registry.withdrawable(alice);
        vm.prank(address(0xBEEF)); // permissionless
        registry.timeoutAppeal(id);

        assertEq(uint8(registry.claimOf(id).status), uint8(Status.Settled), "claim settles");
        assertGt(registry.withdrawable(alice), before, "appellant is refunded: it did nothing wrong");
    }

    function test_cannotAbandonAnAppealWhosePanelDidSeat() public {
        (uint256 id,) = _appealed(Verdict.Mismatch);
        vm.warp(block.timestamp + registry.CHALLENGE_WINDOW() + registry.RESPONSE_WINDOW() + 1);
        vm.expectRevert(ClaimRegistry.PanelSeatedAlready.selector);
        registry.timeoutAppeal(id);
    }

    function test_agentCanRecoverItsStakeAndLosesEligibility() public {
        uint256 staked = roster.stakeOf(bob);
        uint256 before = bob.balance;
        vm.prank(bob);
        roster.withdrawStake();
        assertEq(bob.balance, before + staked, "stake returned");
        assertFalse(roster.isEligible(bob), "agent is no longer drawable");
    }

    function test_cannotAppealTwice() public {
        (uint256 id,) = _appealed(Verdict.Mismatch);
        vm.deal(alice, alice.balance + 0.02 ether);
        vm.prank(alice);
        vm.expectRevert();
        registry.appeal{value: 0.02 ether}(id);
    }

    // ── Tribunal work discovery ─────────────────────────────────────────────
    //
    // A deployed workflow carries its config from deploy time, so a claim id in
    // that config pins it to one claim forever. These cover the view it reads
    // instead.

    function test_pendingForTribunal_nothingToDo() public view {
        (uint256 id, uint8 kind) = registry.pendingForTribunal();
        assertEq(id, 0, "no claims, nothing pending");
        assertEq(kind, 0);
    }

    function test_pendingForTribunal_ignoresAClaimStillAwaitingVrf() public {
        uint256 id = _submit(alice);
        (uint256 found,) = registry.pendingForTribunal();
        assertEq(found, 0, "no witness drawn yet, so there is nothing to adjudicate");
        vrf.fulfill(vrf.nextRequestId() - 1, 1);
        (found,) = registry.pendingForTribunal();
        assertEq(found, id, "assigning the witness is what makes it the tribunal's work");
    }

    function test_pendingForTribunal_clearsOnceAdjudicated() public {
        uint256 id = _submit(alice);
        vrf.fulfill(vrf.nextRequestId() - 1, 1);
        _report(id, Verdict.Match);
        (uint256 found,) = registry.pendingForTribunal();
        assertEq(found, 0, "a verdict is recorded, so the tribunal owes nothing");
    }

    function test_pendingForTribunal_reportsAnAppealAsKindPanel() public {
        (uint256 id,) = _appealed(Verdict.Mismatch);
        (uint256 found, uint8 kind) = registry.pendingForTribunal();
        assertEq(found, id);
        assertEq(kind, 1, "a seated appeal is judged by the panel, not the witness");
    }

    /// @dev Before the panel VRF fulfils there is no one to adjudicate, and
    ///      handing the workflow the claim anyway would make it fetch evidence
    ///      that does not exist yet on every tick.
    function test_pendingForTribunal_waitsForThePanelToBeSeated() public {
        uint256 id = _submit(alice);
        vrf.fulfill(vrf.nextRequestId() - 1, 1);
        _report(id, Verdict.Mismatch);
        vm.deal(alice, alice.balance + 0.02 ether);
        vm.prank(alice);
        registry.appeal{value: 0.02 ether}(id);
        (uint256 found,) = registry.pendingForTribunal();
        assertEq(found, 0, "appealed but the panel draw is still in flight");
        vrf.fulfill(vrf.nextRequestId() - 1, uint256(keccak256("panel")));
        (found,) = registry.pendingForTribunal();
        assertEq(found, id, "seated, so now it is adjudicable");
    }

    /// @dev Oldest first, so a backlog drains in order rather than starving the
    ///      claim that has been waiting longest.
    function test_pendingForTribunal_returnsTheOldestOutstandingClaim() public {
        uint256 first = _submit(alice);
        vrf.fulfill(vrf.nextRequestId() - 1, 1);
        uint256 second = _submit(bob);
        vrf.fulfill(vrf.nextRequestId() - 1, 2);
        (uint256 found,) = registry.pendingForTribunal();
        assertEq(found, first, "oldest first");
        _report(first, Verdict.Match);
        (found,) = registry.pendingForTribunal();
        assertEq(found, second, "and it moves on once that one is answered");
    }
}
