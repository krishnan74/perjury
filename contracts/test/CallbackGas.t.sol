// SPDX-License-Identifier: MIT
// Measures gas used by the VRF callback. This number sets callbackGasLimit, which
// in turn sets the LINK the subscription must reserve (500 gwei lane on Sepolia).
pragma solidity 0.8.26;

import {Base} from "./Base.t.sol";
import {console2} from "forge-std/console2.sol";
import {Verdict} from "../src/interfaces/IPerjury.sol";

contract CallbackGasTest is Base {
    function _measure(uint256 agents) internal returns (uint256) {
        for (uint256 i; i < agents; ++i) {
            address a = address(uint160(0x1000 + i));
            vm.deal(a, STAKE);
            // Name must resolve to the agent before it can register.
            resolver.bind(abi.encodePacked("dns", i), keccak256(abi.encodePacked("extra", i)));
            resolver.setBinding(abi.encodePacked("dns", i), a);
            vm.prank(a);
            roster.registerAgent{value: STAKE}(keccak256(abi.encodePacked("extra", i)), abi.encodePacked("dns", i));
        }
        _submit(alice);
        uint256 reqId = vrf.nextRequestId() - 1;
        uint256 before = gasleft();
        vrf.fulfill(reqId, uint256(keccak256("seed")));
        return before - gasleft();
    }

    function test_callbackGas_4agents() public {
        console_log("4 agents (baseline)", _measure(0));
    }

    function test_callbackGas_8agents() public {
        console_log("8 agents", _measure(4));
    }

    function test_callbackGas_16agents() public {
        console_log("16 agents", _measure(12));
    }

    /// @dev Worst case: walk the whole bounded loop before finding anyone eligible.
    function test_callbackGas_worstCase_manyIneligible() public {
        for (uint256 i; i < 20; ++i) {
            address a = address(uint160(0x2000 + i));
            vm.deal(a, STAKE);
            resolver.bind(abi.encodePacked("bdns", i), keccak256(abi.encodePacked("bad", i)));
            resolver.setBinding(abi.encodePacked("bdns", i), a);
            vm.prank(a);
            roster.registerAgent{value: STAKE}(keccak256(abi.encodePacked("bad", i)), abi.encodePacked("bdns", i));
            // make them ineligible: negative standing
            vm.prank(address(writer));
            resolver.setText(abi.encodePacked("bdns", i), "com.perjury.agent-standing", "-5");
        }
        _submit(alice);
        uint256 reqId = vrf.nextRequestId() - 1;
        uint256 before = gasleft();
        vrf.fulfill(reqId, uint256(keccak256("worst")));
        console_log("24 agents, 20 ineligible", before - gasleft());
    }

    function console_log(string memory label, uint256 gas) internal pure {
        console2.log(label, gas);
    }
}
