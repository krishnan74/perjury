// SPDX-License-Identifier: MIT
// Access control negatives: no operator, deployer, or agent can influence a
// verdict, an assignment, or a reputation record.
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {ClaimRegistry} from "../src/ClaimRegistry.sol";
import {WitnessRoster} from "../src/WitnessRoster.sol";
import {VerdictSink} from "../src/VerdictSink.sol";
import {PerjuryStandingWriter} from "../src/PerjuryStandingWriter.sol";
import {Verdict, Status} from "../src/interfaces/IPerjury.sol";

contract AccessControlTest is Base {
    function test_recordVerdict_fromEOA_reverts() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        vm.prank(operator);
        vm.expectRevert(ClaimRegistry.NotSink.selector);
        registry.recordVerdict(id, Verdict.Match, bytes32(0));
    }

    function test_recordVerdict_fromDeployer_reverts() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        vm.expectRevert(ClaimRegistry.NotSink.selector); // address(this) is the deployer
        registry.recordVerdict(id, Verdict.Match, bytes32(0));
    }

    function test_onReport_fromNonCRE_reverts() public {
        uint256 id = _submit(alice);
        vrf.fulfill(1, 1);
        vm.prank(operator);
        vm.expectRevert(VerdictSink.NotTribunal.selector);
        sink.onReport("", abi.encode(id, uint8(Verdict.Match), bytes32(0)));
    }

    function test_onWitnessAssigned_fromEOA_reverts() public {
        uint256 id = _submit(alice);
        vm.prank(operator);
        vm.expectRevert(ClaimRegistry.NotRoster.selector);
        registry.onWitnessAssigned(id, mallory);
    }

    /// @dev The core anti-collusion invariant: assignment is reachable only
    ///      through the VRF coordinator's callback.
    function test_rawFulfill_fromNonCoordinator_reverts() public {
        _submit(alice);
        uint256[] memory words = new uint256[](1);
        words[0] = 7;
        vm.prank(alice);
        vm.expectRevert(WitnessRoster.NotCoordinator.selector);
        roster.rawFulfillRandomWords(1, words);
    }

    function test_applyVerdict_fromEOA_reverts() public {
        vm.prank(operator);
        vm.expectRevert(PerjuryStandingWriter.NotRegistry.selector);
        writer.applyVerdict(1, Verdict.Mismatch);
    }

    /// @dev Models ENSv2 EAC: an agent cannot write its own reputation record.
    function test_agent_cannotWriteOwnStanding() public {
        vm.prank(alice);
        vm.expectRevert("EAC: unauthorized writer");
        resolver.setText(_dns(alice), "com.perjury.agent-standing", "999");
    }

    function test_operator_cannotWriteStanding() public {
        vm.prank(operator);
        vm.expectRevert("EAC: unauthorized writer");
        resolver.setText(_dns(alice), "com.perjury.agent-standing", "999");
    }

    function test_wiring_isOneTimeOnly() public {
        vm.expectRevert(ClaimRegistry.AlreadyWired.selector);
        registry.wireSink(address(0xdead), address(0xdead));
        vm.expectRevert(WitnessRoster.AlreadyWired.selector);
        roster.wireRegistry(registry);
        vm.expectRevert(PerjuryStandingWriter.AlreadyWired.selector);
        writer.wireSink(address(0xdead));
    }

    function test_wiring_notDeployer_reverts() public {
        ClaimRegistry fresh = new ClaimRegistry(roster, 1 hours, 10 minutes);
        vm.prank(operator);
        vm.expectRevert(ClaimRegistry.NotDeployer.selector);
        fresh.wireSink(address(1), address(2));
    }

    function test_creWriterAddress_isImmutable() public view {
        // No setter exists; changing the tribunal address requires a redeploy.
        assertEq(sink.CRE_REPORT_WRITER(), CRE);
    }
}
