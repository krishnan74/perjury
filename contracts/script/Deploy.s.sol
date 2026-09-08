// SPDX-License-Identifier: MIT
// Deploys and wires the Perjury protocol. Wiring locks permanently at the end.
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {ClaimRegistry} from "../src/ClaimRegistry.sol";
import {WitnessRoster, IVRFCoordinator} from "../src/WitnessRoster.sol";
import {VerdictSink} from "../src/VerdictSink.sol";
import {PerjuryStandingWriter} from "../src/PerjuryStandingWriter.sol";
import {ENSTextStandingReader, IExtendedResolver} from "../src/ens/ENSTextStandingReader.sol";
import {IClaimRegistry, IWitnessRoster, IStandingWriter, ITextResolver} from "../src/interfaces/IPerjury.sol";

contract Deploy is Script {
    function run() external {
        // VRF v2.5 Sepolia. Values from the Chainlink docs / your subscription.
        address vrfCoordinator = vm.envAddress("VRF_COORDINATOR");
        bytes32 keyHash = vm.envBytes32("VRF_KEY_HASH");
        uint256 subId = vm.envUint("VRF_SUBSCRIPTION_ID");
        uint32 callbackGasLimit = uint32(vm.envOr("VRF_CALLBACK_GAS_LIMIT", uint256(500_000)));

        // ENSv2 hackathon deployment — NOT production ENS.
        address resolver = vm.envAddress("ENS_RESOLVER");

        // The only address VerdictSink will ever accept a report from.
        address creWriter = vm.envAddress("CRE_REPORT_WRITER");

        vm.startBroadcast();  // key supplied via --private-key

        ENSTextStandingReader reader = new ENSTextStandingReader(IExtendedResolver(resolver));

        WitnessRoster roster =
            new WitnessRoster(IVRFCoordinator(vrfCoordinator), reader, keyHash, subId, callbackGasLimit);

        // Short on testnet so a demo can show settlement; an hour in production.
        uint64 challengeWindow = uint64(vm.envOr("CHALLENGE_WINDOW_SECONDS", uint256(120)));
        uint64 responseWindow = uint64(vm.envOr("RESPONSE_WINDOW_SECONDS", uint256(600)));
        ClaimRegistry registry =
            new ClaimRegistry(IWitnessRoster(address(roster)), challengeWindow, responseWindow);

        PerjuryStandingWriter writer = new PerjuryStandingWriter(
            ITextResolver(resolver), IClaimRegistry(address(registry)), IWitnessRoster(address(roster))
        );

        VerdictSink sink =
            new VerdictSink(creWriter, IClaimRegistry(address(registry)), IStandingWriter(address(writer)));

        // One-time wiring. Every one of these reverts forever after.
        roster.wireRegistry(IClaimRegistry(address(registry)));
        registry.wireSink(address(sink), address(writer));
        writer.wireSink(address(sink));

        vm.stopBroadcast();

        console.log("ENSTextStandingReader  ", address(reader));
        console.log("WitnessRoster          ", address(roster));
        console.log("ClaimRegistry          ", address(registry));
        console.log("PerjuryStandingWriter  ", address(writer));
        console.log("VerdictSink            ", address(sink));
        console.log("");
        console.log("CRE_REPORT_WRITER (immutable) ", creWriter);
        console.log("Add the roster as a VRF consumer for subscription", subId);
        console.log("Record these in docs/TX_HASHES.md");
    }
}
