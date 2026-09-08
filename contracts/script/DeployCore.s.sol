// SPDX-License-Identifier: MIT
// Deploys everything except VerdictSink, whose CRE_REPORT_WRITER is immutable and
// depends on knowing the Forwarder address. registry.wireSink / writer.wireSink are
// separate one-time calls, so they can be made later without redeploying anything.
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {ClaimRegistry} from "../src/ClaimRegistry.sol";
import {WitnessRoster, IVRFCoordinator} from "../src/WitnessRoster.sol";
import {PerjuryStandingWriter} from "../src/PerjuryStandingWriter.sol";
import {ENSTextStandingReader, IExtendedResolver} from "../src/ens/ENSTextStandingReader.sol";
import {IClaimRegistry, IWitnessRoster, ITextResolver} from "../src/interfaces/IPerjury.sol";

contract DeployCore is Script {
    function run() external {
        address vrfCoordinator = vm.envAddress("VRF_COORDINATOR");
        bytes32 keyHash = vm.envBytes32("VRF_KEY_HASH");
        uint256 subId = vm.envUint("VRF_SUBSCRIPTION_ID");
        uint32 gasLimit = uint32(vm.envOr("VRF_CALLBACK_GAS_LIMIT", uint256(500_000)));
        address resolver = vm.envAddress("ENS_RESOLVER");

        vm.startBroadcast();

        ENSTextStandingReader reader = new ENSTextStandingReader(IExtendedResolver(resolver));
        WitnessRoster roster =
            new WitnessRoster(IVRFCoordinator(vrfCoordinator), reader, keyHash, subId, gasLimit);
        ClaimRegistry registry = new ClaimRegistry(IWitnessRoster(address(roster)));
        PerjuryStandingWriter writer = new PerjuryStandingWriter(
            ITextResolver(resolver), IClaimRegistry(address(registry)), IWitnessRoster(address(roster))
        );

        // Only wiring that does not need VerdictSink. Guarded: wiring to an
        // address with no code is permanent and unrecoverable — a partially
        // broadcast deploy bricked a roster this way once already.
        require(address(registry).code.length > 0, "registry has no code");
        roster.wireRegistry(IClaimRegistry(address(registry)));

        vm.stopBroadcast();

        console.log("ENSTextStandingReader ", address(reader));
        console.log("WitnessRoster         ", address(roster));
        console.log("ClaimRegistry         ", address(registry));
        console.log("PerjuryStandingWriter ", address(writer));
        console.log("");
        console.log("Next: add WitnessRoster as a VRF consumer, then deploy VerdictSink");
        console.log("once the Forwarder address is confirmed, and call wireSink on both.");
    }
}
