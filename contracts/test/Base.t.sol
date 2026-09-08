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

    function setUp() public virtual {
        vrf = new MockVRFCoordinator();
        resolver = new MockResolver();
        reader = new ENSTextStandingReader(IExtendedResolver(address(resolver)));

        roster = new WitnessRoster(IVRFCoordinator(address(vrf)), reader, bytes32("key"), 1, 500_000);
        registry = new ClaimRegistry(IWitnessRoster(address(roster)));
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
        vm.prank(a);
        roster.registerAgent(_node(a), _dns(a));
        resolver.bind(_dns(a), _node(a));
    }

    function _submit(address claimant) internal returns (uint256 claimId) {
        vm.prank(claimant);
        claimId = registry.submitClaim{value: BOND}(bytes32("aave-v3-utilization"), keccak256("claim"));
    }

    function _report(uint256 claimId, Verdict v) internal {
        vm.prank(CRE);
        sink.onReport("", abi.encode(claimId, uint8(v), keccak256("evidence")));
    }
}
