// SPDX-License-Identifier: MIT
// Witness assignment properties: claimant exclusion, uniformity, fail-closed,
// and the residual 1/n collusion risk asserted as a fact.
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {Claim, Verdict, Status} from "../src/interfaces/IPerjury.sol";

contract AssignmentTest is Base {
    /// @dev The invariant the whole protocol rests on.
    function testFuzz_claimantIsNeverItsOwnWitness(uint256 seed) public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, seed);
        address w = registry.claimOf(id).witness;
        assertTrue(w != alice, "claimant drew itself");
        assertTrue(w != address(0), "no witness assigned");
    }

    function testFuzz_assignedWitnessIsAlwaysEligible(uint256 seed) public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, seed);
        assertTrue(roster.isEligible(registry.claimOf(id).witness));
    }

    /// @dev Uniformity over the eligible set. With 4 agents, a claim from alice
    ///      leaves 3 candidates; each should land near 1/3 of draws.
    function test_assignmentIsUniformOverEligibleSet() public {
        uint256 trials = 300;
        uint256 bobCount;
        uint256 carolCount;
        uint256 malloryCount;

        for (uint256 i; i < trials; ++i) {
            uint256 id = _submit(alice);
            vrf.fulfill(vrf.nextRequestId() - 1, uint256(keccak256(abi.encode(i, "seed"))));
            address w = registry.claimOf(id).witness;
            if (w == bob) ++bobCount;
            else if (w == carol) ++carolCount;
            else if (w == mallory) ++malloryCount;
            _report(id, Verdict.Unverifiable); // leaves standing untouched
        }

        assertEq(bobCount + carolCount + malloryCount, trials);
        // Each should be near 100/300. Generous band: no candidate starved or dominant.
        assertGt(bobCount, 50);
        assertGt(carolCount, 50);
        assertGt(malloryCount, 50);
        assertLt(bobCount, 170);
        assertLt(carolCount, 170);
        assertLt(malloryCount, 170);
    }

    /// @dev Scenario 3, on-chain: a colluding pair cannot force a pairing. Over many
    ///      attempts the accomplice is drawn at roughly 1/n — the residual risk we
    ///      state openly rather than claim to have closed (docs/design.md §6).
    function test_collusionIsThrottledNotEliminated() public {
        uint256 trials = 120;
        uint256 accompliceDrawn;

        for (uint256 i; i < trials; ++i) {
            uint256 id = _submit(alice); // alice and mallory are "colluding"
            vrf.fulfill(vrf.nextRequestId() - 1, uint256(keccak256(abi.encode(i, "collude"))));
            if (registry.claimOf(id).witness == mallory) ++accompliceDrawn;
            _report(id, Verdict.Unverifiable);
        }

        // Throttled: nowhere near guaranteed.
        assertLt(accompliceDrawn, trials * 2 / 3, "collusion was not throttled");
        // But NOT eliminated — this is the honest limitation, asserted as a fact.
        assertGt(accompliceDrawn, 0, "accomplice never drawn: 1/n risk must be real");
    }

    /// @dev Fail closed. If nobody is eligible, refund — never fall back to a
    ///      biased pick.
    function test_noEligibleWitness_failsClosed() public {
        // Flag every other agent by driving a mismatch against each.
        _flag(bob);
        _flag(carol);
        _flag(mallory);

        // alice may already hold payouts from acting as a witness above, so
        // assert on the delta rather than the absolute balance.
        uint256 owedBefore = registry.withdrawable(alice);
        uint256 id = _submit(alice);
        vrf.fulfill(vrf.nextRequestId() - 1, 12345);

        Claim memory c = registry.claimOf(id);
        assertEq(c.witness, address(0), "no witness should be assigned");
        assertEq(uint8(c.verdict), uint8(Verdict.Unverifiable));
        assertEq(registry.withdrawable(alice) - owedBefore, BOND, "bond refunded");
    }

    function _flag(address agent) internal {
        uint256 id = _submit(agent);
        vrf.fulfill(vrf.nextRequestId() - 1, 1);
        _report(id, Verdict.Mismatch);
        assertFalse(roster.isEligible(agent));
    }

    function test_eligibleCountExcluding() public view {
        assertEq(roster.eligibleCountExcluding(alice), 3);
        assertEq(roster.eligibleCountExcluding(address(0)), 4);
    }

    /// @dev Sybils cost a registration and a distinct ENS node each; they raise the
    ///      odds linearly, they do not grant control.
    function test_sybil_cannotReuseEnsNode() public {
        address sybil = makeAddr("sybil");
        vm.prank(sybil);
        vm.expectRevert();
        roster.registerAgent(_node(alice), _dns(alice));
    }
}
