// SPDX-License-Identifier: MIT
// Non-response was the cheapest attack in the system: a witness that simply did
// nothing locked the claimant's bond forever at no cost to itself.
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {ClaimRegistry} from "../src/ClaimRegistry.sol";
import {Verdict, Status} from "../src/interfaces/IPerjury.sol";

contract TimeoutTest is Base {
    function test_unresponsiveWitnessIsReplacedAndSlashed() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        address stalling = registry.claimOf(id).witness;
        uint256 stakeBefore = roster.stakeOf(stalling);

        vm.warp(block.timestamp + registry.RESPONSE_WINDOW() + 1);
        // Permissionless: the claimant is never dependent on the stalling party.
        vm.prank(address(0xBEEF));
        registry.timeoutWitness(id);

        assertLt(roster.stakeOf(stalling), stakeBefore, "non-response must cost something");
        assertEq(registry.claimOf(id).witness, address(0), "witness cleared");
        assertEq(uint8(registry.claimOf(id).status), uint8(Status.Pending), "redrawn, not abandoned");
    }

    function test_cannotTimeoutEarly() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        vm.expectRevert(ClaimRegistry.WindowOpen.selector);
        registry.timeoutWitness(id);
    }

    /// @dev The bond is no longer locked forever — the claim proceeds to a new witness.
    function test_claimSurvivesAnUnresponsiveWitness() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        vm.warp(block.timestamp + registry.RESPONSE_WINDOW() + 1);
        registry.timeoutWitness(id);

        // A fresh draw completes the claim normally.
        vrf.fulfill(vrf.nextRequestId() - 1, 7);
        assertTrue(registry.claimOf(id).witness != address(0), "new witness assigned");
        _reportAndFinalize(id, Verdict.Match);
        assertEq(uint8(registry.claimOf(id).status), uint8(Status.Settled));
        assertEq(registry.withdrawable(alice), BOND, "bond finally returns");
    }

    function test_claimantNonResponseSettlesUnverifiableAndPaysTheWitness() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        address w = registry.claimOf(id).witness;

        vm.warp(block.timestamp + registry.RESPONSE_WINDOW() * 2 + 1);
        registry.timeoutClaimant(id);

        assertEq(uint8(registry.claimOf(id).verdict), uint8(Verdict.Unverifiable));
        assertEq(registry.withdrawable(w), 0.002 ether, "witness made itself available and is paid");
        assertEq(registry.withdrawable(alice), BOND, "claimant's bond returns, minus the fee");
    }

    function test_claimantTimeoutIsLaterThanWitnessTimeout() public {
        // The witness is given the first chance to be replaced; only after a
        // second window is the claim abandoned. Otherwise a slow claimant and a
        // stalling witness are indistinguishable.
        assertGt(registry.RESPONSE_WINDOW() * 2, registry.RESPONSE_WINDOW());
    }
}
