// SPDX-License-Identifier: MIT
// Test doubles for the VRF coordinator and an EAC-enforcing ENS resolver.
pragma solidity 0.8.26;

import {ITextResolver} from "../../src/interfaces/IPerjury.sol";
import {IVRFCoordinator} from "../../src/WitnessRoster.sol";

/// @dev Stands in for the Chainlink VRF coordinator. Fulfilment is manual so
///      tests can drive an exact seed.
contract MockVRFCoordinator is IVRFCoordinator {
    uint256 public nextRequestId = 1;
    address public consumer;

    function setConsumer(address c) external {
        consumer = c;
    }

    function requestRandomWords(bytes32, uint64, uint16, uint32, uint32) external returns (uint256) {
        return nextRequestId++;
    }

    function fulfill(uint256 requestId, uint256 seed) external {
        uint256[] memory words = new uint256[](1);
        words[0] = seed;
        (bool ok, bytes memory err) =
            consumer.call(abi.encodeWithSignature("rawFulfillRandomWords(uint256,uint256[])", requestId, words));
        if (!ok) {
            assembly {
                revert(add(err, 32), mload(err))
            }
        }
    }
}

/// @dev Minimal ENS resolver. Records writes so tests can assert on them.
contract MockResolver is ITextResolver {
    mapping(bytes32 => mapping(string => string)) private _text;
    mapping(address => bool) public canWrite;
    bool public enforceAcl;

    function allow(address who, bool ok) external {
        canWrite[who] = ok;
    }

    function setEnforceAcl(bool on) external {
        enforceAcl = on;
    }

    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return _text[node][key];
    }

    /// @dev ENSv2 takes a DNS-encoded name; we key storage by its hash so the
    ///      mock can serve reads by namehash in tests.
    function setText(bytes calldata dnsName, string calldata key, string calldata value) external {
        // Models Enhanced Access Control: only granted roles may write this key.
        if (enforceAcl) require(canWrite[msg.sender], "EAC: unauthorized writer");
        _text[nodeFor[keccak256(dnsName)]][key] = value;
    }

    /// @dev Test helper: bind a DNS-encoded name to the namehash reads use.
    mapping(bytes32 => bytes32) public nodeFor;

    function bind(bytes calldata dnsName, bytes32 node) external {
        nodeFor[keccak256(dnsName)] = node;
    }
}
