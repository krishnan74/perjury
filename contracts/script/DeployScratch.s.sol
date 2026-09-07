// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {ScratchSink} from "../src/ScratchSink.sol";

contract DeployScratch is Script {
    function run() external {
        vm.startBroadcast();
        ScratchSink sink = new ScratchSink();
        vm.stopBroadcast();
        console.log("ScratchSink", address(sink));
    }
}
