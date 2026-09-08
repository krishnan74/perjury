// SPDX-License-Identifier: MIT
// Deploys VerdictSink last, once the environment (and therefore the Forwarder
// address) is known, then performs the one-time wiring on registry and writer.
// CRE_REPORT_WRITER is immutable by design — see docs/decisions.md ADR 0006.
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {VerdictSink} from "../src/VerdictSink.sol";
import {ClaimRegistry} from "../src/ClaimRegistry.sol";
import {PerjuryStandingWriter} from "../src/PerjuryStandingWriter.sol";
import {IClaimRegistry, IStandingWriter} from "../src/interfaces/IPerjury.sol";

contract DeploySink is Script {
    function run() external {
        address creWriter = vm.envAddress("CRE_REPORT_WRITER");
        ClaimRegistry registry = ClaimRegistry(payable(vm.envAddress("CLAIM_REGISTRY_ADDRESS")));
        PerjuryStandingWriter writer = PerjuryStandingWriter(vm.envAddress("STANDING_WRITER_ADDRESS"));

        require(address(registry).code.length > 0, "registry has no code");
        require(address(writer).code.length > 0, "writer has no code");

        vm.startBroadcast();
        VerdictSink sink = new VerdictSink(
            creWriter, IClaimRegistry(address(registry)), IStandingWriter(address(writer))
        );
        registry.wireSink(address(sink), address(writer));
        writer.wireSink(address(sink));
        vm.stopBroadcast();

        console.log("VerdictSink       ", address(sink));
        console.log("accepts reports from (immutable):", creWriter);
    }
}
