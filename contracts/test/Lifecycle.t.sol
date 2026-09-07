// SPDX-License-Identifier: MIT
// Perjury — claim lifecycle, bond settlement, and the reputation loop.
// Provenance: AI-ASSISTED against the human-specified test matrix (docs/design.md §2.5).
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {ClaimRegistry} from "../src/ClaimRegistry.sol";
import {Claim, Verdict, Status} from "../src/interfaces/IPerjury.sol";

contract LifecycleTest is Base {
    function test_submit_escrowsBond() public {
        uint256 before = address(registry).balance;
        uint256 id = _submit(alice);
        assertEq(address(registry).balance, before + BOND);
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

    function test_submit_unregistered_reverts() public {
        address stranger = makeAddr("stranger");
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        vm.expectRevert(ClaimRegistry.NotRegistered.selector);
        registry.submitClaim{value: BOND}(bytes32("s"), bytes32("h"));
    }

    /// @dev Scenario 1: a true claim holds up. Bond returned, standing rises.
    function test_match_returnsBondAndRaisesStanding() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _report(id, Verdict.Match);

        Claim memory c = registry.claimOf(id);
        assertEq(uint8(c.verdict), uint8(Verdict.Match));
        assertEq(uint8(c.status), uint8(Status.Settled));
        assertEq(registry.withdrawable(alice), BOND);
        assertEq(reader.standingOf(_node(alice)), 1);
    }

    /// @dev Scenario 2: a false claim. Bond forfeited to the witness, standing drops,
    ///      and the claimant becomes ineligible with no further transaction.
    function test_mismatch_forfeitsBondToWitnessAndFlags() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        address witness = registry.claimOf(id).witness;
        assertTrue(witness != alice, "witness must not be the claimant");

        _report(id, Verdict.Mismatch);

        assertEq(registry.withdrawable(witness), BOND, "bond goes to the witness");
        assertEq(registry.withdrawable(alice), 0);
        assertEq(reader.standingOf(_node(alice)), -3);
        assertFalse(roster.isEligible(alice), "flagged agent is ineligible immediately");
    }

    /// @dev The exclusion must follow from the record alone — no admin tx in between.
    function test_flaggedAgent_isNeverAssignedAsWitness() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _report(id, Verdict.Mismatch);
        assertFalse(roster.isEligible(alice));

        // Every subsequent draw must skip alice, whatever the seed.
        for (uint256 seed; seed < 24; ++seed) {
            uint256 id2 = _submit(bob);
            vrf.fulfill(roster_nextRequestId(), seed);
            address w = registry.claimOf(id2).witness;
            assertTrue(w != alice, "flagged agent was assigned");
            _report(id2, Verdict.Match);
        }
    }

    function roster_nextRequestId() internal view returns (uint256) {
        return vrf.nextRequestId() - 1;
    }

    /// @dev Provenance failure must never become a silent pass.
    function test_unverifiable_returnsBondAndLeavesStandingUntouched() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _report(id, Verdict.Unverifiable);

        assertEq(registry.withdrawable(alice), BOND, "bond returned");
        assertEq(reader.standingOf(_node(alice)), 0, "standing untouched");
        assertTrue(roster.isEligible(alice));
    }

    function test_doubleSettle_reverts() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _report(id, Verdict.Match);
        vm.prank(CRE);
        vm.expectRevert(ClaimRegistry.BadStatus.selector);
        sink.onReport("", abi.encode(id, uint8(Verdict.Match), bytes32(0)));
    }

    function test_withdraw_paysOutOnce() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        _report(id, Verdict.Match);

        uint256 before = alice.balance;
        vm.prank(alice);
        registry.withdraw();
        assertEq(alice.balance, before + BOND);

        vm.prank(alice);
        vm.expectRevert(ClaimRegistry.NothingToWithdraw.selector);
        registry.withdraw();
    }

    /// @dev Escrow solvency: the contract always holds what it owes.
    function test_invariant_escrowSolvent() public {
        _submit(alice);
        _submit(bob);
        vrf.fulfill(1, 3);
        vrf.fulfill(2, 5);
        _report(1, Verdict.Match);
        _report(2, Verdict.Mismatch);

        uint256 owed = registry.withdrawable(alice) + registry.withdrawable(bob) + registry.withdrawable(carol)
            + registry.withdrawable(mallory);
        assertEq(address(registry).balance, owed);
    }
}
