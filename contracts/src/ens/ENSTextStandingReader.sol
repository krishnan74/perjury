// SPDX-License-Identifier: MIT
// Reads an agent's standing from its ENS text record. See docs/design.md §4.3.
pragma solidity 0.8.26;

import {IStandingReader} from "../interfaces/IPerjury.sol";

interface IExtendedResolver {
    /// @dev ENSIP-10. The ENSv2 Permissioned Resolver serves reads through this,
    ///      not through a direct text(bytes32,string) call — verified on-chain:
    ///      text(bytes32,string) and text(bytes,string) both revert, resolve() works.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
}

/// @title ENSTextStandingReader
/// @notice Resolves reputation at witness-assignment time. Called from inside a
///         VRF callback, so it goes straight to the resolver rather than through
///         the Universal Resolver, avoiding a CCIP-read hop.
contract ENSTextStandingReader is IStandingReader {
    string public constant STANDING_KEY = "com.perjury.agent-standing";

    IExtendedResolver public immutable resolver;

    constructor(IExtendedResolver resolver_) {
        resolver = resolver_;
    }

    /// @param node namehash, used to build the inner text() call
    /// @param dnsName DNS-encoded name, which resolve() addresses by
    function standingOfName(bytes32 node, bytes calldata dnsName) public view returns (int256) {
        bytes memory inner = abi.encodeWithSignature("text(bytes32,string)", node, STANDING_KEY);
        (bool ok, bytes memory ret) = address(resolver).staticcall(
            abi.encodeWithSelector(IExtendedResolver.resolve.selector, dnsName, inner)
        );
        if (!ok || ret.length == 0) return 0;

        bytes memory encoded = abi.decode(ret, (bytes));
        if (encoded.length == 0) return 0;
        string memory raw = abi.decode(encoded, (string));
        return _parse(raw);
    }

    /// @dev IStandingReader entry point. Without the DNS name we cannot address
    ///      the record, so an unset name reads as zero standing — which is the
    ///      starting value, not a pass.
    function standingOf(bytes32) external pure returns (int256) {
        return 0;
    }

    function _parse(string memory s) internal pure returns (int256) {
        bytes memory b = bytes(s);
        if (b.length == 0) return 0;
        bool neg = b[0] == "-";
        int256 v;
        for (uint256 i = neg ? 1 : 0; i < b.length; ++i) {
            uint8 ch = uint8(b[i]);
            if (ch < 48 || ch > 57) return 0;
            v = v * 10 + int256(uint256(ch - 48));
        }
        return neg ? -v : v;
    }
}
