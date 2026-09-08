// SPDX-License-Identifier: MIT
// Claim lifecycle, bond settlement, and the reputation loop.
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {ClaimRegistry} from "../src/ClaimRegistry.sol";
import {Claim, Verdict, Status} from "../src/interfaces/IPerjury.sol";

contract LifecycleTest is Base {
    function test_submit_escrowsBond() public {
        uint256 before = address(registry).balance;
        uint256 id = _submit(alice);
        assertEq(address(registry).balance, before + SUBMIT_VALUE); // bond + witness fee
        Claim memory c = registry.claimOf(id);
        assertEq(c.claimant, alice);
        assertEq(c.bond, BOND);
        assertEq(uint8(c.status), uint8(Status.Pending));
        assertEq(c.witness, address(0));
    }

    function test_submit_belowMinBond_reverts() public {
        vm.prank(alice);
        vm.expectRevert(ClaimRegistry.BondTooSmall.selector);
        registry.submitClaim{value: 1 wei}(bytes32("s"), bytes32("h"));
    }

    /// @dev A slashed agent keeps its registration but loses eligibility, and must
    ///      not be able to keep making claims with no collateral left to slash.
    function test_submit_bySlashedAgent_reverts() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _reportAndFinalize(id, Verdict.Mismatch);
        assertFalse(roster.isEligible(alice), "mismatch flags the claimant");
        vm.prank(alice);
        vm.expectRevert(ClaimRegistry.NotEligible.selector);
        registry.submitClaim{value: SUBMIT_VALUE}(bytes32("s"), bytes32("h"));
    }

    /// @dev Exclusion must be survivable. Gating on the standing value made it
    ///      permanent: standing rises only on a Match, a Match needs a claim, and
    ///      a claim needs eligibility. One mismatch ended an agent forever.
    function test_flaggedAgentRecoversAfterTheCooldown() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _reportAndFinalize(id, Verdict.Mismatch);
        assertFalse(roster.isEligible(alice), "flagged immediately");
        assertEq(reader.standingOfName(_node(alice), _dns(alice)), -3, "record shows the history");

        vm.warp(block.timestamp + roster.FLAG_COOLDOWN() + 1);
        // Stake was slashed below the floor, so it must be topped up too.
        vm.deal(alice, alice.balance + STAKE);
        vm.prank(alice);
        roster.topUp{value: STAKE}();

        assertTrue(roster.isEligible(alice), "eligible again once the cooldown expires");
        assertEq(reader.standingOfName(_node(alice), _dns(alice)), -3, "but the record still shows it lied");
    }

    /// @dev A resolver outage must not silently restore every flagged agent.
    function test_unreadableReputationFailsClosed() public {
        assertTrue(roster.isEligible(bob));
        resolver.setDown(true);
        assertFalse(roster.isEligible(bob), "unreadable record must not read as eligible");
        resolver.setDown(false);
        assertTrue(roster.isEligible(bob));
    }

    function test_submit_unregistered_reverts() public {
        address stranger = makeAddr("stranger");
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        vm.expectRevert(ClaimRegistry.NotEligible.selector);
        registry.submitClaim{value: SUBMIT_VALUE}(bytes32("s"), bytes32("h"));
    }

    /// @dev Scenario 1: a true claim holds up. Bond returned, standing rises.
    function test_match_returnsBondAndRaisesStanding() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _reportAndFinalize(id, Verdict.Match);

        Claim memory c = registry.claimOf(id);
        assertEq(uint8(c.verdict), uint8(Verdict.Match));
        assertEq(uint8(c.status), uint8(Status.Settled));
        assertEq(registry.withdrawable(alice), BOND);
        assertEq(reader.standingOfName(_node(alice), _dns(alice)), 1);
    }

    /// @dev Scenario 2: a false claim. The bond is forfeited and the claimant is
    ///      slashed — but the bond does NOT go to the witness. Paying the witness
    ///      from the penalty is what made fabricating disagreement profitable
    ///      (ADR 0007). The witness receives only its flat fee.
    function test_mismatch_forfeitsBondAndSlashesClaimant() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        address witness = registry.claimOf(id).witness;
        assertTrue(witness != alice, "witness must not be the claimant");
        uint256 stakeBefore = roster.stakeOf(alice);

        _reportAndFinalize(id, Verdict.Mismatch);

        assertEq(registry.withdrawable(witness), 0.002 ether, "witness gets the flat fee only");
        assertEq(registry.withdrawable(alice), 0, "claimant forfeits its bond");
        assertEq(registry.forfeited(), BOND, "forfeited bond is held, not paid out");
        assertLt(roster.stakeOf(alice), stakeBefore, "claimant's stake is slashed");
        assertEq(reader.standingOfName(_node(alice), _dns(alice)), -3);
        assertFalse(roster.isEligible(alice), "flagged agent is ineligible immediately");
    }

    /// @dev The core of ADR 0007: a witness cannot profit by reporting Mismatch.
    function test_witnessEarnsTheSameWhateverItReports() public {
        uint256 idA = _submit(alice);
        vrf.fulfill(vrf.nextRequestId() - 1, 1);
        address wA = registry.claimOf(idA).witness;
        _reportAndFinalize(idA, Verdict.Match);
        uint256 onMatch = registry.withdrawable(wA);

        uint256 idB = _submit(alice);
        vrf.fulfill(vrf.nextRequestId() - 1, 1);
        address wB = registry.claimOf(idB).witness;
        uint256 before = registry.withdrawable(wB);
        _reportAndFinalize(idB, Verdict.Mismatch);
        uint256 onMismatch = registry.withdrawable(wB) - before;

        assertEq(onMatch, onMismatch, "witness payout must not depend on the verdict");
    }

    /// @dev The exclusion must follow from the record alone — no admin tx in between.
    function test_flaggedAgent_isNeverAssignedAsWitness() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _reportAndFinalize(id, Verdict.Mismatch);
        assertFalse(roster.isEligible(alice));

        // Every subsequent draw must skip alice, whatever the seed.
        for (uint256 seed; seed < 24; ++seed) {
            uint256 id2 = _submit(bob);
            vrf.fulfill(roster_nextRequestId(), seed);
            address w = registry.claimOf(id2).witness;
            assertTrue(w != alice, "flagged agent was assigned");
            _reportAndFinalize(id2, Verdict.Match);
        }
    }

    function roster_nextRequestId() internal view returns (uint256) {
        return vrf.nextRequestId() - 1;
    }

    /// @dev Provenance failure must never become a silent pass.
    function test_unverifiable_returnsBondAndLeavesStandingUntouched() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _reportAndFinalize(id, Verdict.Unverifiable);

        // A witness was assigned and did its job, so it is paid regardless.
        assertEq(registry.withdrawable(alice), BOND, "bond returned, fee paid to the witness");
        assertEq(reader.standingOfName(_node(alice), _dns(alice)), 0, "standing untouched");
        assertTrue(roster.isEligible(alice));
    }

    function test_doubleSettle_reverts() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _reportAndFinalize(id, Verdict.Match);
        vm.prank(CRE);
        vm.expectRevert(ClaimRegistry.BadStatus.selector);
        sink.onReport("", abi.encode(uint8(0), id, uint8(Verdict.Match), bytes32(0)));
    }

    function test_withdraw_paysOutOnce() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _reportAndFinalize(id, Verdict.Match);

        uint256 before = alice.balance;
        vm.prank(alice);
        registry.withdraw();
        assertEq(alice.balance, before + BOND);

        vm.prank(alice);
        vm.expectRevert(ClaimRegistry.NothingToWithdraw.selector);
        registry.withdraw();
    }

    /// @dev Escrow solvency: the contract holds what it owes plus what it has
    ///      forfeited. Forfeited bonds are deliberately owed to nobody.
    function test_invariant_escrowSolvent() public {
        _submit(alice);
        _submit(bob);
        vrf.fulfill(1, 3);
        vrf.fulfill(2, 5);
        _reportAndFinalize(1, Verdict.Match);
        _reportAndFinalize(2, Verdict.Mismatch);

        uint256 owed = registry.withdrawable(alice) + registry.withdrawable(bob) + registry.withdrawable(carol)
            + registry.withdrawable(mallory);
        assertEq(address(registry).balance, owed + registry.forfeited());
    }
}
