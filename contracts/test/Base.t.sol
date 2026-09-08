// SPDX-License-Identifier: MIT
// Shared test fixture: deploys and wires the full protocol.
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ClaimRegistry} from "../src/ClaimRegistry.sol";
import {WitnessRoster, IVRFCoordinator} from "../src/WitnessRoster.sol";
import {VerdictSink} from "../src/VerdictSink.sol";
import {PerjuryStandingWriter} from "../src/PerjuryStandingWriter.sol";
import {ENSTextStandingReader, IExtendedResolver} from "../src/ens/ENSTextStandingReader.sol";
import {IClaimRegistry, IWitnessRoster, IStandingWriter, ITextResolver, Verdict, Status} from
    "../src/interfaces/IPerjury.sol";
import {MockVRFCoordinator, MockResolver} from "./mocks/Mocks.sol";

contract Base is Test {
    ClaimRegistry internal registry;
    WitnessRoster internal roster;
    VerdictSink internal sink;
    PerjuryStandingWriter internal writer;
    ENSTextStandingReader internal reader;
    MockVRFCoordinator internal vrf;
    MockResolver internal resolver;

    address internal constant CRE = address(0xC2E);
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal mallory = makeAddr("mallory");
    address internal operator = makeAddr("operator");

    uint256 internal constant BOND = 0.01 ether;
    uint256 internal constant STAKE = 0.05 ether;
    /// @dev What a claimant sends: bond plus the flat witness fee.
    uint256 internal constant SUBMIT_VALUE = BOND + 0.002 ether;

    function setUp() public virtual {
        vrf = new MockVRFCoordinator();
        resolver = new MockResolver();
        reader = new ENSTextStandingReader(IExtendedResolver(address(resolver)));

        roster = new WitnessRoster(IVRFCoordinator(address(vrf)), reader, bytes32("key"), 1, 500_000);
        registry = new ClaimRegistry(IWitnessRoster(address(roster)), 1 hours);
        writer = new PerjuryStandingWriter(
            ITextResolver(address(resolver)), IClaimRegistry(address(registry)), IWitnessRoster(address(roster))
        );
        sink = new VerdictSink(CRE, IClaimRegistry(address(registry)), IStandingWriter(address(writer)));

        roster.wireRegistry(IClaimRegistry(address(registry)));
        registry.wireSink(address(sink), address(writer));
        writer.wireSink(address(sink));
        vrf.setConsumer(address(roster));

        // Only the standing writer may write reputation records — this models the
        // ENSv2 EAC grant configured in T4.
        resolver.allow(address(writer), true);
        resolver.setEnforceAcl(true);

        _register(alice);
        _register(bob);
        _register(carol);
        _register(mallory);

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 10 ether);
        vm.deal(mallory, 10 ether);
    }

    function _node(address a) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("agent", a));
    }

    function _dns(address a) internal pure returns (bytes memory) {
        return abi.encodePacked("dns:", a);
    }

    function _register(address a) internal {
        vm.deal(a, a.balance + STAKE);
        vm.prank(a);
        roster.registerAgent{value: STAKE}(_node(a), _dns(a));
        resolver.bind(_dns(a), _node(a));
    }

    function _submit(address claimant) internal returns (uint256 claimId) {
        vm.prank(claimant);
        claimId = registry.submitClaim{value: SUBMIT_VALUE}(bytes32("aave-v3-utilization"), keccak256("claim"));
    }

    /// @dev Records a verdict only. Since ADR 0007 a verdict is challengeable, so
    ///      it does not settle until the window closes.
    function _report(uint256 claimId, Verdict v) internal {
        vm.prank(CRE);
        sink.onReport("", abi.encode(claimId, uint8(v), keccak256("evidence")));
    }

    /// @dev Records a verdict and lets it become final unchallenged.
    function _reportAndFinalize(uint256 claimId, Verdict v) internal {
        _report(claimId, v);
        vm.warp(block.timestamp + registry.CHALLENGE_WINDOW() + 1);
        registry.finalize(claimId);
    }
}
